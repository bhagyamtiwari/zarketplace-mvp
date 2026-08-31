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
// records the delivery - see migration
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
import { buildEmail } from "../send-email/templates/index.ts";

// Shiprocket's status strings vary by event type; matching by substring
// keeps this resilient to the exact casing/wording of whichever field they
// send ("current_status", "shipment_status", "status", ...).
function isDelivered(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("delivered") && !s.includes("rto") && !s.includes("undelivered");
}

// Normalize Shiprocket's many status strings into the small set we surface to
// buyers and admins (orders.shipment_status). Only 'delivered' also drives the
// escrow/order state machine; the rest are display-only sub-states.
function normalizeShipmentStatus(status: string): string | null {
  const s = status.toLowerCase();
  if (!s) return null;
  if (s.includes("rto")) return "rto";
  if (s.includes("undelivered") || s.includes("ndr") || s.includes("failed")) return "ndr";
  if (s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("in transit") || s.includes("in-transit") || s.includes("shipped")) return "in_transit";
  if (s.includes("picked up") || s.includes("pickup done") || s.includes("out for pickup")) return "picked_up";
  if (s.includes("pickup scheduled") || s.includes("pickup generated") || s.includes("manifest") || s.includes("awb")) return "pickup_scheduled";
  if (s.includes("cancel")) return "cancelled";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const WEBHOOK_TOKEN = Deno.env.get("SHIPROCKET_WEBHOOK_TOKEN");
  if (!WEBHOOK_TOKEN) {
    console.error("SHIPROCKET_WEBHOOK_TOKEN not configured");
    return new Response("Server not configured", { status: 500 });
  }

  // Shiprocket's webhook config passes the shared secret in an HTTP header
  // (Auth Token Type = x-api-key), not as a ?token= query param. Accept the
  // header first and fall back to the query param so either configuration
  // works.
  const url = new URL(req.url);
  const presented = req.headers.get("x-api-key") ?? url.searchParams.get("token");
  if (presented !== WEBHOOK_TOKEN) {
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

    // Both legs first, keyed by AWB against the shipments table. This has to
    // happen before the order lookup below, because that lookup only ever
    // matches the OUTBOUND leg - orders.tracking_number carries the buyer's
    // tracking number and never the inbound one. Without this, an inbound
    // pickup scan would be silently ignored, picked_up_at would stay null, and
    // NO_SHIP would fire against a vendor who had actually posted the item.
    if (awb) {
      const scanned = normalizeShipmentStatus(status);
      if (scanned === "picked_up" || scanned === "in_transit" || scanned === "delivered") {
        await supabase.rpc("record_pickup_scan", { p_awb: awb });
      }
      await supabase.from("shipments").update({
        status: scanned === "delivered" ? "delivered" : (scanned ?? "in_transit"),
        delivered_at: scanned === "delivered" ? new Date().toISOString() : undefined,
        last_status_at: new Date().toISOString(),
      }).eq("awb", awb);
    }

    let query = supabase.from("orders").select("*").limit(1);
    query = awb ? query.eq("tracking_number", awb) : query.eq("shiprocket_order_id", shiprocketOrderId);
    const { data: orders, error: findErr } = await query;
    if (findErr) throw findErr;
    const order = orders?.[0];
    if (!order) {
      // Expected for every inbound-leg event: the buyer has no order row
      // matching that AWB, and should not. The shipment was already updated
      // above, so this is a normal path rather than a miss.
      console.info("delivery-status-hook: no buyer order for this AWB (inbound leg?)", { awb, status });
      return new Response("ok (no buyer order)", { status: 200, headers: corsHeaders });
    }

    // Always record the fine-grained courier sub-state for buyer/admin
    // visibility, whatever the event is.
    const shipmentStatus = normalizeShipmentStatus(status);
    if (shipmentStatus) {
      await supabase.from("orders")
        .update({ shipment_status: shipmentStatus, shipment_status_at: new Date().toISOString() })
        .eq("id", order.id);
    }

    if (!isDelivered(status)) {
      // Sub-state recorded above; RTO/NDR/in-transit etc. never auto-change the
      // order/escrow state machine - those need a human to look at them.
      console.log("delivery-status-hook: sub-status recorded, no state change", { orderId: order.id, status, shipmentStatus });
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

    // Tell the buyer it's delivered and the 48h review window has started.
    // Best-effort: a failed email must never fail the webhook.
    void sendDeliveredEmail({ ...order, status: "delivered" }).catch((e) => console.error("delivered email failed", e));

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("shiprocket-webhook error", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});

// Direct-to-Resend sender for the buyer "delivered" email (mirrors the pattern
// in shiprocket-create-order). No-op in dev when RESEND_API_KEY is unset.
async function sendDeliveredEmail(order: Record<string, unknown>) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "zarketplace <onboarding@resend.dev>";
  const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://zarketplace.com";
  if (!RESEND_API_KEY) return;
  const built = buildEmail("order_delivered_buyer", { order, siteUrl: SITE_URL });
  if (!built.to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: EMAIL_FROM, to: built.to, subject: built.subject, html: built.html }),
  });
}
