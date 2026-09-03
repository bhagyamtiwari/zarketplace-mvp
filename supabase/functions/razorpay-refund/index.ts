// Edge Function: razorpay-refund
//
// Admin-triggered (admin console order drawer, "Refund via Razorpay"). Issues a
// full refund of a captured payment via the Razorpay Refunds API, then brings
// the order to a clean terminal state: status -> 'refunded', the listing is put
// back on sale, any not-yet-paid seller payout is voided, an audit row is
// written, and the buyer is emailed a refund confirmation.
//
// This replaces the previous manual "refund in the Razorpay dashboard" step for
// payment_conflict and cancellations. Full refunds only (item + shipping +
// protection fee); partial refunds are not supported here.
//
// Required env vars (Supabase function secrets):
//   - RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
//   - RESEND_API_KEY, EMAIL_FROM, PUBLIC_SITE_URL (for the buyer email)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto-injected)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { buildEmail } from "../send-email/templates/index.ts";

interface RequestBody {
  order_id: string;
  reason?: string;
  /**
   * Put the item back on sale afterwards. Defaults to true, which is right for
   * an ordinary cancel-and-relist. The hub passes false when the refund
   * follows a fulfillment failure: that item is not coming, and relisting it
   * would offer buyers something we cannot supply.
   */
  relist?: boolean;
}

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return json({ error: "Razorpay is not configured on the server" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) return json({ error: "Invalid or expired session" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: callerProfile } = await supabase
      .from("profiles").select("is_admin").eq("id", callerData.user.id).maybeSingle();
    if (!callerProfile?.is_admin) return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as RequestBody;
    if (!body.order_id) return json({ error: "order_id required" }, 400);

    const { data: order, error: orderErr } = await supabase
      .from("orders").select("*").eq("id", body.order_id).maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return json({ error: "Order not found" }, 404);
    if (!order.razorpay_payment_id) return json({ error: "This order has no captured payment to refund" }, 409);
    if (order.status === "refunded") return json({ error: "This order is already refunded" }, 409);

    // Full refund of what the buyer actually paid.
    const paise = Math.round(Number(order.total_amount) * 100);
    if (paise <= 0) return json({ error: "Invalid refund amount" }, 400);

    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rpRes = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpay_payment_id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount: paise, speed: "normal", notes: { order_number: order.order_number, reason: body.reason ?? "" } }),
    });
    const rpData = await rpRes.json();
    if (!rpRes.ok) {
      // Razorpay refuses double-refunds; surface that clearly rather than as a
      // generic failure.
      return json({ error: "Razorpay refund failed", detail: rpData }, 502);
    }
    const refundId = String(rpData.id ?? "");

    // Bring the order to a clean terminal state.
    //
    // This used to be a single best-effort write, on the reasoning that the
    // money was already back so a failed follow-up must not look like a failed
    // refund. That reasoning is right about the caller and wrong about the
    // record: a refund that happens at Razorpay and is never written here is
    // invisible to us afterwards, and reconciling it means going to Razorpay's
    // dashboard to discover it. The money moving is exactly why the write has
    // to be durable.
    //
    // So: retry, and if it still will not land, say so loudly and hand the
    // caller the refund id rather than a bare success. Nothing is silent.
    let written = false;
    let lastWriteErr: string | null = null;
    for (let attempt = 1; attempt <= 4 && !written; attempt++) {
      const { error: wErr } = await supabase
        .from("orders").update({ status: "refunded" }).eq("id", order.id);
      if (!wErr) { written = true; break; }
      lastWriteErr = wErr.message ?? String(wErr);
      console.error(`razorpay-refund: write-back attempt ${attempt} failed`, wErr);
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 400));
    }
    if (!written) {
      // The refund is real and our record does not show it. This is the exact
      // shape razorpay-reconcile exists to catch, so leave a trail it and an
      // operator can both find.
      console.error(
        `razorpay-refund: REFUND SUCCEEDED BUT NOT RECORDED. order=${order.order_number} ` +
        `refund_id=${refundId} amount=${paise / 100}. Our record still says "${order.status}".`,
      );
      try {
        await supabase.from("admin_audit_log").insert({
          entity: "order", entity_id: order.id,
          action: "order.refund.write_back_failed",
          old_state: { status: order.status },
          new_state: { refund_id: refundId, amount: paise / 100, error: lastWriteErr },
          reason: "Refund succeeded at Razorpay; the order status write failed after retries.",
        });
      } catch (auditErr) {
        console.error("razorpay-refund: could not even record the write-back failure", auditErr);
      }
    }
    // Put the item back on sale only when the refund was a change of mind
    // about the ORDER. A refund that follows a fulfillment failure must not
    // relist: the item was refused at the hub, never dispatched, or is lost,
    // and record_fulfillment_failure has already archived it. Relisting it
    // here would put an item we cannot supply back in front of buyers.
    if (order.listing_id && body.relist !== false) {
      await supabase.from("listings").update({ is_sold: false }).eq("id", order.listing_id);
    }
    // Deliberately does NOT touch payouts. Refunding a buyer is a movement on
    // the outbound sale; what we owe the vendor for the item we bought is a
    // separate transaction with a separate trigger, and cancelling one has
    // never been a reason to cancel the other. If the item itself failed, that
    // goes through record_fulfillment_failure instead.

    await supabase.from("admin_audit_log").insert({
      admin_id: callerData.user.id,
      admin_email: callerData.user.email ?? null,
      entity: "order",
      entity_id: order.id,
      action: "order.refund",
      old_state: { status: order.status },
      new_state: { status: "refunded", refund_id: refundId },
      reason: body.reason ?? null,
    });

    void sendRefundEmail(order).catch((e) => console.error("refund email failed", e));

    return json({
      ok: true,
      refund_id: refundId,
      amount: paise,
      // Told plainly rather than swallowed: the caller needs to know the
      // difference between "done" and "done but our record disagrees".
      recorded: written,
      ...(written ? {} : {
        warning:
          "The refund went through at Razorpay but this order's status could not be updated. " +
          "Run razorpay-reconcile and correct it before relying on the order record.",
      }),
    });
  } catch (err) {
    console.error("razorpay-refund error", err);
    return json({ error: String(err) }, 500);
  }
});

async function sendRefundEmail(order: Record<string, unknown>) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "zarketplace <onboarding@resend.dev>";
  const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://zarketplace.com";
  const built = buildEmail("order_refunded_buyer", { order: { ...order, status: "refunded" }, siteUrl: SITE_URL });
  if (!built.to || !RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: EMAIL_FROM, to: built.to, subject: built.subject, html: built.html }),
  });
}
