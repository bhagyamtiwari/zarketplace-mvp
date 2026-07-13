// Edge Function: send-email
//
// Purpose:
//   Sends transactional emails via Resend (default) given a template name and
//   an order_id. Logs every send to `email_log`.
//
// Templates supported (each lives in its own file under ./templates/, wired up
// in ./templates/index.ts — editing one template never touches the others):
//   - order_confirmation_buyer
//   - order_notification_seller
//   - tracking_update_buyer
//   - payout_released_seller
//   - custom
//
// Required env vars:
//   - RESEND_API_KEY        (sign up at resend.com — free tier covers MVP)
//   - EMAIL_FROM            e.g. "zarketplace <orders@zarketplace.com>"
//                           Until your domain is verified in Resend, you can
//                           use "onboarding@resend.dev" for testing.
//   - PUBLIC_SITE_URL       e.g. https://zarketplace.com
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Invoked from checkout (buyer confirmation) and seller portal (tracking
// updates).
//
// Authorization: every caller must send a valid Supabase Authorization
// header. Order-bound templates may only be requested by that order's
// buyer, that order's seller, or an admin. The `custom` template (free-form
// subject/html/recipient) is admin-only. The recipient address is always
// derived from the order itself — callers cannot redirect an email to an
// address of their choosing.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { buildEmail } from "./templates/index.ts";

interface SendEmailRequest {
  template: string;
  order_id?: string;
  extra?: Record<string, unknown>;
}

const ORDER_BOUND_TEMPLATES = new Set([
  "order_confirmation_buyer",
  "order_notification_seller",
  "tracking_update_buyer",
  "payout_released_seller",
  "payment_confirmed_buyer",
  "payment_failed_buyer",
  "payment_conflict_buyer",
]);

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
    const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://zarketplace.com";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) return json({ error: "Invalid or expired session" }, 401);
    const callerId = callerData.user.id;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .single();
    const isAdmin = callerProfile?.is_admin === true;

    const body = (await req.json()) as SendEmailRequest;

    if (!body.template) return json({ error: "template required" }, 400);

    if (body.template === "custom") {
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    } else if (ORDER_BOUND_TEMPLATES.has(body.template)) {
      if (!body.order_id) return json({ error: "order_id required" }, 400);
    } else {
      return json({ error: "Unknown template" }, 400);
    }

    let order: any = null;
    if (body.order_id) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", body.order_id)
        .single();
      order = data;

      if (!order) return json({ error: "Order not found" }, 404);
      const isParty = order.buyer_id === callerId || order.seller_id === callerId;
      if (!isParty && !isAdmin) return json({ error: "Forbidden" }, 403);
    }

    const built = buildEmail(body.template, { order, extra: body.extra, siteUrl: SITE_URL });
    const recipient = built.to;

    if (!recipient) return json({ error: "no recipient" }, 400);

    if (!RESEND_API_KEY) {
      // Dev mode: just log and return ok
      console.log("[send-email] RESEND_API_KEY not set; skipping send", { recipient, subject: built.subject });
      await supabase.from("email_log").insert({
        to_email: recipient,
        template: body.template,
        subject: built.subject,
        related_order_id: body.order_id ?? null,
        status: "queued",
        error_message: "RESEND_API_KEY not configured (dev mode)",
      });
      return json({ ok: true, dev_mode: true });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: recipient,
        subject: built.subject,
        html: built.html,
      }),
    });

    const resendData = await resendRes.json();

    await supabase.from("email_log").insert({
      to_email: recipient,
      template: body.template,
      subject: built.subject,
      related_order_id: body.order_id ?? null,
      status: resendRes.ok ? "sent" : "failed",
      provider_id: resendData?.id ?? null,
      error_message: resendRes.ok ? null : JSON.stringify(resendData),
    });

    return json({ ok: resendRes.ok, provider: resendData });
  } catch (err) {
    console.error("send-email error", err);
    return json({ error: String(err) }, 500);
  }
});
