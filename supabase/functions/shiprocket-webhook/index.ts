// Edge Function: shiprocket-webhook
//
// Public endpoint configured in the Shiprocket dashboard (Settings ->
// API -> Webhooks / Channel). Unlike Razorpay, Shiprocket does not sign its
// webhook payloads with an HMAC secret - the standard workaround is a shared
// secret appended to the callback URL itself. Register the webhook as:
//   https://<project>.supabase.co/functions/v1/shiprocket-webhook?token=<SHIPROCKET_WEBHOOK_TOKEN>
// and this function rejects any request whose ?token= doesn't match.
//
// This is the automated counterpart to an admin manually marking an order
// `delivered` in Admin.tsx: when Shiprocket reports a shipment delivered,
// this function (running as the service role, same trust boundary as
// razorpay-webhook) sets orders.status = 'delivered', which fires the
// existing handle_order_delivered trigger (starts the 48h review window,
// creates the seller_payouts row - see migration
// 20260710000001_delivery_escrow_and_payout_timing.sql). No new logic is
// duplicated here; this function only ever writes the same `status`
// transition an admin could already make by hand.
//
// Only "delivered" is acted on. Other Shiprocket statuses (in transit, out
// for delivery, pickup scheduled, RTO, cancelled, ...) are accepted and
// logged but don't change orders.status - our own state machine only
// distinguishes shipped vs. delivered, and anything ambiguous (RTO,
// cancelled) needs a human to look at it rather than an automatic write.
//
// Idempotent: if the matched order is not currently `shipped`, the event is
// a no-op (already delivered, or never got that far - either way there's
// nothing safe to do here).
//
// Required env vars (Supabase function secrets):
//   - SHIPROCKET_WEBHOOK_TOKEN
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Shiprocket's status strings vary by event type; matching by substring
// keeps this resilient to the exact casing/wording of whichever field they
// send ("current_status", "shipment_status", "status", ...).
function isDelivered(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("delivered") && !s.includes("rto") && !s.includes("undelivered");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const WEBHOOK_TOKEN = Deno.env.get("SHIPROCKET_WEBHOOK_TOKEN");
  if (!WEBHOOK_TOKEN) {
    console.error("SHIPROCKET_WEBHOOK_TOKEN not configured");
    return new Response("Server not configured", { status: 500 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("token") !== WEBHOOK_TOKEN) {
    console.error("shiprocket-webhook: token mismatch");
    return new Response("Invalid token", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    const awb = String(payload.awb ?? payload.awb_code ?? "").trim();
    const shiprocketOrderId = String(payload.order_id ?? payload.sr_order_id ?? "").trim();
    const status = String(payload.current_status ?? payload.shipment_status ?? payload.status ?? "").trim();

    if (!awb && !shiprocketOrderId) {
      // Nothing to match an order against - acknowledge so Shiprocket
      // doesn't retry a payload shape we can never resolve.
      return new Response("ok (no identifier)", { status: 200, headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let query = supabase.from("orders").select("id, status").limit(1);
    query = awb ? query.eq("tracking_number", awb) : query.eq("shiprocket_order_id", shiprocketOrderId);
    const { data: orders, error: findErr } = await query;
    if (findErr) throw findErr;
    const order = orders?.[0];
    if (!order) {
      console.warn("shiprocket-webhook: no matching order", { awb, shiprocketOrderId, status });
      return new Response("ok (no match)", { status: 200, headers: corsHeaders });
    }

    if (!isDelivered(status)) {
      // Logged for traceability; no state change for in-transit/RTO/etc.
      console.log("shiprocket-webhook: status noted, no action", { orderId: order.id, status });
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (order.status !== "shipped") {
      // Already delivered, or in a state where auto-marking isn't safe
      // (e.g. a payment_conflict). Idempotent no-op.
      return new Response("ok (no-op)", { status: 200, headers: corsHeaders });
    }

    const { error: updErr } = await supabase
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", order.id);
    if (updErr) throw updErr;

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("shiprocket-webhook error", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
