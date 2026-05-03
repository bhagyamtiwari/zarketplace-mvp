// Edge Function: cashfree-webhook
//
// Purpose:
//   Receives payment status notifications from Cashfree, verifies the
//   signature, and updates our database accordingly:
//     - On PAYMENT_SUCCESS_WEBHOOK: mark order as 'paid', mark listing
//       'is_sold = true', create seller_payouts row (status 'pending'),
//       and trigger transactional emails.
//     - On PAYMENT_FAILED_WEBHOOK: mark order 'cancelled'.
//
// Configure in Cashfree Dashboard -> Developers -> Webhooks:
//   URL: https://<project>.supabase.co/functions/v1/cashfree-webhook
//
// JWT verification MUST be disabled when deploying this function:
//   supabase functions deploy cashfree-webhook --no-verify-jwt
//
// Required env vars:
//   - CASHFREE_SECRET_KEY  (used to verify webhook HMAC signature)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SECRET = Deno.env.get("CASHFREE_SECRET_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const rawBody = await req.text();
    const tsHeader = req.headers.get("x-webhook-timestamp") ?? "";
    const sigHeader = req.headers.get("x-webhook-signature") ?? "";

    // ---- Security: require valid signature + fresh timestamp. ----
    // Without these checks, an attacker could POST a forged webhook payload
    // and flip orders to 'paid' without paying. Cashfree always sends both
    // headers; missing headers means the request is not from Cashfree.
    if (!SECRET) {
      console.error("CASHFREE_SECRET_KEY missing in webhook env");
      return new Response("server misconfigured", { status: 500 });
    }
    if (!tsHeader || !sigHeader) {
      console.warn("Cashfree webhook missing signature headers");
      return new Response("missing signature", { status: 401 });
    }
    const sigOk = await verifySignature(SECRET, tsHeader + rawBody, sigHeader);
    if (!sigOk) {
      console.warn("Cashfree webhook signature mismatch");
      return new Response("invalid signature", { status: 401 });
    }
    // Replay protection: reject timestamps older than 5 minutes. Cashfree's
    // timestamp is unix seconds.
    const tsSeconds = Number(tsHeader);
    if (!Number.isFinite(tsSeconds)) {
      return new Response("bad timestamp", { status: 400 });
    }
    const ageSec = Math.abs(Date.now() / 1000 - tsSeconds);
    if (ageSec > 300) {
      console.warn("Cashfree webhook too old or skewed", { ageSec });
      return new Response("stale webhook", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type ?? event.event ?? "";
    const data = event.data ?? {};
    const cfOrder = data.order ?? {};
    const cfPayment = data.payment ?? {};
    const orderNumber = cfOrder.order_id; // matches our orders.order_number

    if (!orderNumber) {
      return new Response("no order id", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("order_number", orderNumber)
      .single();

    if (!order) {
      return new Response("order not found", { status: 404 });
    }

    if (eventType.includes("SUCCESS") || cfPayment.payment_status === "SUCCESS") {
      // Mark order paid (idempotent)
      if (order.status === "pending") {
        await supabase
          .from("orders")
          .update({
            status: "paid",
            payment_status: "SUCCESS",
            payment_method: cfPayment.payment_group ?? cfPayment.payment_method ?? null,
            payment_completed_at: new Date().toISOString(),
            cashfree_payment_response: event,
          })
          .eq("id", order.id);

        // Mark listing as sold so it disappears from /browse
        await supabase
          .from("listings")
          .update({ is_sold: true })
          .eq("id", order.listing_id);

        // Snapshot seller payout destination onto the payout row so finance
        // can release without joining tables.
        const { data: listing } = await supabase
          .from("listings")
          .select("seller_upi_vpa, seller_bank_account, seller_bank_ifsc, seller_bank_holder")
          .eq("id", order.listing_id)
          .single();

        await supabase
          .from("seller_payouts")
          .insert({
            order_id: order.id,
            seller_email: order.seller_email,
            amount: order.seller_payout_amount,
            status: "pending",
            payout_method: "manual",
            destination_upi: listing?.seller_upi_vpa ?? null,
            destination_account: listing?.seller_bank_account ?? null,
            destination_ifsc: listing?.seller_bank_ifsc ?? null,
            destination_holder: listing?.seller_bank_holder ?? null,
          });

        // Fire transactional emails (non-blocking; failures logged inside)
        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            template: "order_confirmation_buyer",
            order_id: order.id,
          }),
        }).catch((e) => console.error("buyer email trigger failed", e));

        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            template: "order_notification_seller",
            order_id: order.id,
          }),
        }).catch((e) => console.error("seller email trigger failed", e));
      }
    } else if (eventType.includes("FAILED") || cfPayment.payment_status === "FAILED") {
      await supabase
        .from("orders")
        .update({
          status: "cancelled",
          payment_status: "FAILED",
          cashfree_payment_response: event,
        })
        .eq("id", order.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cashfree-webhook error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function verifySignature(secret: string, payload: string, signatureB64: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return computed === signatureB64;
}
