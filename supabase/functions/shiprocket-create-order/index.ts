// Edge Function: shiprocket-create-order
//
// Admin-triggered (Admin.tsx Orders panel, "Book Pickup" button). Books a
// Shiprocket doorstep pickup for a single order that's already `paid`:
//   1. Authenticate to Shiprocket (email/password -> short-lived JWT).
//   2. Ensure the seller has a Shiprocket "pickup location" registered.
//      Shiprocket's create-order API takes a pickup_location NICKNAME, not
//      an inline address - each seller's own pickup_address (collected in
//      Sell.tsx, snapshotted onto the order) has to be registered once via
//      their addpickup API before it can be referenced. Idempotent: reuses
//      the order's own id as the nickname, and a 400 "already exists" from
//      Shiprocket is treated as success.
//   3. Create the adhoc order (buyer delivery address + seller pickup
//      location + a category-based default weight, since this marketplace's
//      flat shipping rate model never collects per-item weight/dimensions -
//      see docs/REALIGNMENT_PLAN.md §0.3).
//   4. Auto-assign a courier + AWB (no courier_id = let Shiprocket pick the
//      recommended one).
//   5. Generate the shipping label.
//
// Each step is best-effort past order creation: if AWB assignment or label
// generation fails, whatever succeeded (shiprocket_order_id / shipment_id)
// is still persisted so admin can see what happened and retry rather than
// the whole booking silently vanishing. Only step 3 (order creation) is
// required for a 2xx response; later-step failures are returned as
// `warnings` alongside the 200.
//
// Required env vars (Supabase function secrets):
//   - SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto-injected)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildEmail } from "../send-email/templates/index.ts";

const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

// Declared weight in kg per shipping category - the flat-rate shipping model
// never asks the seller for a real parcel weight, so this is a reasonable
// fixed default per category rather than a precise per-item value. Tune from
// real Shiprocket invoices once volume exists (see docs/SHIPPING.md).
const CATEGORY_WEIGHT_KG: Record<string, number> = {
  tops: 0.3,
  bottoms: 0.5,
  footwear: 1.0,
  outerwear: 0.8,
  accessories: 0.2,
};
const DEFAULT_WEIGHT_KG = 0.5;
// Generic parcel dimensions in cm - same reasoning as weight above.
const PARCEL_DIMS = { length: 30, breadth: 25, height: 5 };

interface RequestBody {
  order_id: string;
}

interface Addr {
  fullName?: string;
  phone?: string;
  address?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SHIPROCKET_EMAIL = Deno.env.get("SHIPROCKET_EMAIL");
    const SHIPROCKET_PASSWORD = Deno.env.get("SHIPROCKET_PASSWORD");

    if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) {
      return json({ error: "Shiprocket is not configured on the server" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) return json({ error: "Invalid or expired session" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Only admins may book a pickup - this is the same trust boundary as
    // marking an order delivered (see migration 20260710000001).
    const { data: callerProfile } = await supabase
      .from("profiles").select("is_admin").eq("id", callerData.user.id).maybeSingle();
    if (!callerProfile?.is_admin) return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as RequestBody;
    if (!body.order_id) return json({ error: "order_id required" }, 400);

    const { data: order, error: orderErr } = await supabase
      .from("orders").select("*").eq("id", body.order_id).maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.status !== "paid" && order.status !== "shipped") {
      return json({ error: `Order must be 'paid' to book a pickup (is '${order.status}')` }, 409);
    }
    if (order.shiprocket_order_id) {
      return json({ error: "This order already has a Shiprocket booking", shiprocket_order_id: order.shiprocket_order_id }, 409);
    }

    const pickup: Addr = (order.pickup_address as Addr) ?? {};
    const delivery: Addr = (order.shipping_address as Addr) ?? {};
    for (const [label, v] of [
      ["pickup address", pickup.address], ["pickup city", pickup.city], ["pickup state", pickup.state], ["pickup pincode", pickup.pincode],
      ["delivery address", delivery.address], ["delivery city", delivery.city], ["delivery state", delivery.state], ["delivery pincode", delivery.pincode],
    ] as const) {
      if (!v) return json({ error: `Order is missing ${label} - cannot book pickup` }, 422);
    }

    // 1. Auth
    const loginRes = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) {
      return json({ error: "Shiprocket authentication failed", detail: loginData }, 502);
    }
    const srHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${loginData.token}` };

    // 2. Ensure a pickup location exists for this order's seller. Nickname
    // is deterministic (order id, truncated - Shiprocket caps nickname
    // length) so a retry reuses the same registration instead of piling up
    // duplicates per seller.
    const pickupNickname = `zk-${order.id}`.slice(0, 36);
    const addPickupRes = await fetch(`${SHIPROCKET_BASE}/settings/company/addpickup`, {
      method: "POST",
      headers: srHeaders,
      body: JSON.stringify({
        pickup_location: pickupNickname,
        name: pickup.fullName || order.seller_email,
        email: order.seller_email,
        phone: (pickup.phone || "").replace(/\D/g, "").slice(-10) || "9999999999",
        address: pickup.address,
        address_2: pickup.landmark || "",
        city: pickup.city,
        state: pickup.state,
        country: "India",
        pin_code: pickup.pincode,
      }),
    });
    const addPickupData = await addPickupRes.json();
    // Shiprocket returns 400ish "pickup location already exists" on retry -
    // that's success for our purposes, not a failure to surface.
    const pickupAlreadyExists = typeof addPickupData?.message === "string" &&
      /already exist/i.test(addPickupData.message);
    if (!addPickupRes.ok && !pickupAlreadyExists) {
      return json({ error: "Failed to register pickup location with Shiprocket", detail: addPickupData }, 502);
    }

    // 3. Create the adhoc order.
    const weight = CATEGORY_WEIGHT_KG[order.shipping_category ?? ""] ?? DEFAULT_WEIGHT_KG;
    const now = new Date();
    const orderDate = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    const createOrderRes = await fetch(`${SHIPROCKET_BASE}/orders/create/adhoc`, {
      method: "POST",
      headers: srHeaders,
      body: JSON.stringify({
        order_id: order.order_number,
        order_date: orderDate,
        pickup_location: pickupNickname,
        billing_customer_name: delivery.fullName || order.buyer_name,
        billing_last_name: "",
        billing_address: delivery.address,
        billing_address_2: delivery.landmark || "",
        billing_city: delivery.city,
        billing_pincode: delivery.pincode,
        billing_state: delivery.state,
        billing_country: "India",
        billing_email: order.buyer_email,
        billing_phone: (delivery.phone || order.buyer_phone || "").replace(/\D/g, "").slice(-10) || "9999999999",
        shipping_is_billing: true,
        order_items: [{
          name: order.listing_title ?? "Item",
          sku: order.listing_sku ?? order.order_number,
          units: 1,
          selling_price: Number(order.amount),
        }],
        payment_method: "Prepaid",
        sub_total: Number(order.amount),
        length: PARCEL_DIMS.length,
        breadth: PARCEL_DIMS.breadth,
        height: PARCEL_DIMS.height,
        weight,
      }),
    });
    const createOrderData = await createOrderRes.json();
    if (!createOrderRes.ok || !createOrderData.shipment_id) {
      return json({ error: "Failed to create Shiprocket order", detail: createOrderData }, 502);
    }

    const shiprocketOrderId = String(createOrderData.order_id ?? "");
    const shipmentId = String(createOrderData.shipment_id ?? "");

    // Persist what we have so far immediately - if steps 4/5 below fail,
    // admin still sees a real booking to retry/complete rather than nothing.
    await supabase.from("orders").update({
      shiprocket_order_id: shiprocketOrderId,
      shiprocket_shipment_id: shipmentId,
    }).eq("id", order.id);

    const warnings: string[] = [];

    // 4. Auto-assign courier + AWB (omit courier_id to let Shiprocket pick
    // its recommended courier for this route).
    let awbCode: string | null = null;
    let courierName: string | null = null;
    const awbRes = await fetch(`${SHIPROCKET_BASE}/courier/assign/awb`, {
      method: "POST",
      headers: srHeaders,
      body: JSON.stringify({ shipment_id: shipmentId }),
    });
    const awbData = await awbRes.json();
    if (awbRes.ok && awbData?.response?.data?.awb_code) {
      awbCode = String(awbData.response.data.awb_code);
      courierName = awbData.response.data.courier_name ? String(awbData.response.data.courier_name) : null;
    } else {
      warnings.push("Courier/AWB assignment failed - retry from Shiprocket dashboard or this booking again.");
    }

    // 5. Generate the label (best-effort; not required for tracking to work).
    let labelUrl: string | null = null;
    if (awbCode) {
      const labelRes = await fetch(`${SHIPROCKET_BASE}/courier/generate/label`, {
        method: "POST",
        headers: srHeaders,
        body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
      });
      const labelData = await labelRes.json();
      if (labelRes.ok && labelData?.label_url) {
        labelUrl = String(labelData.label_url);
      } else {
        warnings.push("Label generation failed - generate it from the Shiprocket dashboard.");
      }
    }

    const trackingUrl = awbCode ? `https://shiprocket.co/tracking/${awbCode}` : null;
    const update: Record<string, unknown> = {};
    if (awbCode) update.tracking_number = awbCode;
    if (courierName) update.courier = courierName;
    if (trackingUrl) update.tracking_url = trackingUrl;
    if (awbCode && order.status !== "shipped") {
      update.status = "shipped";
      update.shipped_at = new Date().toISOString();
    }
    if (Object.keys(update).length > 0) {
      const { error: updErr } = await supabase.from("orders").update(update).eq("id", order.id);
      if (updErr) throw updErr;
    }

    if (awbCode && order.status !== "shipped") {
      const email = buildEmail("tracking_update_buyer", {
        order: { ...order, ...update },
        siteUrl: Deno.env.get("PUBLIC_SITE_URL") ?? "https://zarketplace.com",
      });
      void sendViaResend(email).catch((e) => console.error("tracking email failed", e));
    }

    return json({
      ok: true,
      shiprocket_order_id: shiprocketOrderId,
      shiprocket_shipment_id: shipmentId,
      tracking_number: awbCode,
      courier: courierName,
      tracking_url: trackingUrl,
      label_url: labelUrl,
      warnings,
    });
  } catch (err) {
    console.error("shiprocket-create-order error", err);
    return json({ error: String(err) }, 500);
  }
});

// Minimal direct-to-Resend sender so this function doesn't need to invoke
// another edge function just to send one email. Mirrors send-email's own
// Resend call; failures are logged and swallowed (see call site above).
async function sendViaResend(email: { to: string; subject: string; html: string }) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "zarketplace <onboarding@resend.dev>";
  if (!RESEND_API_KEY) return; // dev mode - no-op, matches send-email's own fallback
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: EMAIL_FROM, to: email.to, subject: email.subject, html: email.html }),
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
