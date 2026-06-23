// Edge Function: razorpay-webhook
//
// Public endpoint configured in the Razorpay dashboard (Settings > Webhooks).
// This is the ONLY place orders.status is ever set to 'paid' or
// 'payment_failed' — never the frontend. Razorpay calls this directly (no
// Supabase session), so verify_jwt is disabled for this function in
// config.toml and authenticity is instead proven by the HMAC signature
// Razorpay signs every webhook body with.
//
// Idempotency: Razorpay retries webhooks that don't return 2xx quickly, and
// can also send the same event more than once. Before writing anything we
// check whether the matching order already has this exact
// razorpay_payment_id recorded; if so we return 200 immediately without
// reprocessing (no duplicate emails, no duplicate listing updates).
//
// Required env vars (Supabase function secrets):
//   - RAZORPAY_WEBHOOK_SECRET (separate from RAZORPAY_KEY_SECRET — set when
//     creating the webhook in the Razorpay dashboard)
//   - RESEND_API_KEY, EMAIL_FROM, PUBLIC_SITE_URL (same as send-email)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildEmail } from "../send-email/templates/index.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!WEBHOOK_SECRET) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return new Response("Server not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-Razorpay-Signature") ?? "";
  const valid = await verifySignature(rawBody, signature, WEBHOOK_SECRET);
  if (!valid) {
    console.error("razorpay-webhook: signature mismatch");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const eventType = event.event as string;
    const payment = event.payload?.payment?.entity;

    if (eventType === "payment.captured" && payment?.order_id) {
      await handleCaptured(supabase, payment);
    } else if (eventType === "payment.failed" && payment?.order_id) {
      await handleFailed(supabase, payment);
    } else {
      // Unhandled event type (e.g. refund events) — acknowledge so Razorpay
      // stops retrying; nothing to do yet.
      console.log("razorpay-webhook: ignoring event", eventType);
    }
    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("razorpay-webhook processing error", err);
    // 500 so Razorpay retries — the failure was on our side, not a bad event.
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});

async function handleCaptured(supabase: ReturnType<typeof createClient>, payment: any) {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("razorpay_order_id", payment.order_id);
  if (error) throw error;
  if (!orders || orders.length === 0) {
    console.error("razorpay-webhook: no orders found for razorpay_order_id", payment.order_id);
    return;
  }

  // Idempotent: only act on rows this exact payment hasn't already been
  // recorded against. A duplicate delivery of the same event ends up with
  // an empty list here and is a clean no-op.
  const toProcess = orders.filter((o: any) => !(o.status === "paid" && o.razorpay_payment_id === payment.id));
  if (toProcess.length === 0) return;

  const { error: updErr } = await supabase
    .from("orders")
    .update({
      status: "paid",
      razorpay_payment_id: payment.id,
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("razorpay_order_id", payment.order_id)
    .neq("status", "paid"); // never overwrite an already-paid row (e.g. duplicate webhook for a different payment_id)
  if (updErr) throw updErr;

  const listingIds = toProcess.map((o: any) => o.listing_id).filter(Boolean);
  if (listingIds.length > 0) {
    const { error: soldErr } = await supabase.from("listings").update({ is_sold: true }).in("id", listingIds);
    if (soldErr) console.warn("razorpay-webhook: mark sold failed", soldErr);
  }

  for (const order of toProcess) {
    await sendOrderEmail(supabase, { ...order, status: "paid", razorpay_payment_id: payment.id }, "payment_confirmed_buyer");
    await sendOrderEmail(supabase, { ...order, status: "paid", razorpay_payment_id: payment.id }, "order_notification_seller");
  }
}

async function handleFailed(supabase: ReturnType<typeof createClient>, payment: any) {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("razorpay_order_id", payment.order_id);
  if (error) throw error;
  if (!orders || orders.length === 0) return;

  // Never downgrade an order that a (possibly later, out-of-order) captured
  // webhook already marked paid.
  const stillPending = orders.filter((o: any) => o.status === "awaiting_payment");
  if (stillPending.length === 0) return;

  const { error: updErr } = await supabase
    .from("orders")
    .update({ status: "payment_failed" })
    .eq("razorpay_order_id", payment.order_id)
    .eq("status", "awaiting_payment");
  if (updErr) throw updErr;

  for (const order of stillPending) {
    await sendOrderEmail(supabase, { ...order, status: "payment_failed" }, "payment_failed_buyer");
  }
}

async function sendOrderEmail(supabase: ReturnType<typeof createClient>, order: any, template: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://zarketplace.com";

  try {
    const built = buildEmail(template, { order, siteUrl: SITE_URL });
    if (!built.to) return;

    if (!RESEND_API_KEY) {
      await supabase.from("email_log").insert({
        to_email: built.to, template, subject: built.subject,
        related_order_id: order.id, status: "queued",
        error_message: "RESEND_API_KEY not configured (dev mode)",
      });
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: EMAIL_FROM, to: built.to, subject: built.subject, html: built.html }),
    });
    const data = await res.json();
    await supabase.from("email_log").insert({
      to_email: built.to, template, subject: built.subject,
      related_order_id: order.id, status: res.ok ? "sent" : "failed",
      provider_id: data?.id ?? null, error_message: res.ok ? null : JSON.stringify(data),
    });
  } catch (err) {
    // Email failures must never fail the webhook response.
    console.error("razorpay-webhook: email send failed", template, err);
  }
}

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedHex = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expectedHex, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
