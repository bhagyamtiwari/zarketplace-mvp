// Books one leg of an item's journey with Shiprocket.
//
// Replaces shiprocket-create-order, which booked a single shipment from the
// vendor's address to the buyer's - the old marketplace's direct ship. That
// skipped the hub entirely and put the vendor's address on the buyer's parcel.
//
//   INBOUND   vendor -> hub. Booked when the item sells. Its pickup scan is
//             what sets picked_up_at, which NO_SHIP and the 48-hour reminder
//             both key off.
//   OUTBOUND  hub -> buyer. Refused until the item has been accepted at the
//             hub, because until then we do not own it and may yet refuse it.
//
// Whether a leg may be booked is decided by can_book_leg() in the database,
// not here, so the rule holds for any caller.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import {
  buildHubPickupPayload, buildVendorPickupPayload,
  buildInboundOrderPayload, buildOutboundOrderPayload,
  type Addr, type HubLocation, type Leg,
} from "./payload.ts";

const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

interface RequestBody { listing_id: string; leg: Leg }

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SR_EMAIL = Deno.env.get("SHIPROCKET_EMAIL");
    const SR_PASSWORD = Deno.env.get("SHIPROCKET_PASSWORD");
    if (!SR_EMAIL || !SR_PASSWORD) {
      return json({ error: "Shiprocket is not configured on the server" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // An admin from the console, or the payment webhook booking the inbound
    // leg automatically with the service key.
    const isInternal = jwt === SERVICE_KEY;
    if (!isInternal) {
      const caller = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: u, error: uErr } = await caller.auth.getUser();
      if (uErr || !u?.user) return json({ error: "Invalid or expired session" }, 401);
      const { data: prof } = await db
        .from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: "Forbidden" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    if (!body.listing_id) return json({ error: "listing_id required" }, 400);
    if (body.leg !== "INBOUND" && body.leg !== "OUTBOUND") {
      return json({ error: "leg must be INBOUND or OUTBOUND" }, 400);
    }

    // The database decides, not this function.
    const { data: gate } = await db.rpc("can_book_leg", {
      p_listing_id: body.listing_id, p_leg: body.leg,
    });
    const gateResult = gate as { ok?: boolean; reason?: string } | null;
    if (!gateResult?.ok) {
      return json({ error: gateResult?.reason ?? "That leg cannot be booked" }, 409);
    }

    const { data: listing } = await db
      .from("listings")
      .select("id, title, sku, shipping_category, pickup_address, seller_email")
      .eq("id", body.listing_id).maybeSingle();
    if (!listing) return json({ error: "Listing not found" }, 404);

    const { data: hubRow } = await db.from("hub_location").select("*").eq("id", 1).maybeSingle();
    const hub = hubRow as (HubLocation & { registered_at: string | null }) | null;
    if (!hub?.address || !hub.pincode) {
      return json({ error: "The hub address is not configured. Set it in hub_location." }, 500);
    }

    // Auth to Shiprocket.
    const loginRes = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SR_EMAIL, password: SR_PASSWORD }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) {
      return json({ error: "Shiprocket authentication failed", detail: loginData }, 502);
    }
    const srHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${loginData.token}`,
    };

    const registerPickup = async (payload: Record<string, unknown>) => {
      const res = await fetch(`${SHIPROCKET_BASE}/settings/company/addpickup`, {
        method: "POST", headers: srHeaders, body: JSON.stringify(payload),
      });
      const data = await res.json();
      // "already exists" is success on a retry.
      const already = JSON.stringify(data ?? {}).match(/already exist/i);
      if (!res.ok && !already) {
        throw new Error(`Pickup registration failed: ${JSON.stringify(data)}`);
      }
    };

    let orderPayload: Record<string, unknown>;
    let reference: string;

    if (body.leg === "INBOUND") {
      const vendorPickup = (listing.pickup_address as Addr) ?? {};
      for (const [label, v] of [
        ["address", vendorPickup.address], ["city", vendorPickup.city],
        ["state", vendorPickup.state], ["pincode", vendorPickup.pincode],
      ] as const) {
        if (!v) return json({ error: `The vendor's pickup ${label} is missing` }, 422);
      }
      // The vendor's address is registered as a pickup location for THIS leg
      // only. It is never used as the origin of a buyer's parcel.
      const vendorNickname = `zk-v-${listing.id}`.slice(0, 36);
      await registerPickup(buildVendorPickupPayload(
        vendorPickup, vendorNickname, listing.seller_email ?? hub.email,
      ));

      const { data: acq } = await db
        .from("acquisitions").select("offer_amount").eq("listing_id", listing.id).maybeSingle();

      reference = `${listing.sku ?? listing.id.slice(0, 8)}`;
      orderPayload = buildInboundOrderPayload({
        hub, vendorPickup, reference,
        itemTitle: listing.title ?? "Item",
        sku: listing.sku ?? listing.id.slice(0, 8),
        shippingCategory: listing.shipping_category ?? null,
        // Declared value for transit cover is what we agreed to pay, not what
        // we hope to sell it for. The vendor never sees this leg's paperwork,
        // and the resale price has no business on it.
        declaredValue: Number(acq?.offer_amount ?? 0),
      }, vendorNickname);
    } else {
      if (!hub.registered_at) {
        await registerPickup(buildHubPickupPayload(hub));
        await db.from("hub_location").update({ registered_at: new Date().toISOString() }).eq("id", 1);
      }

      const { data: order } = await db
        .from("orders")
        .select("order_number, buyer_name, buyer_email, buyer_phone, shipping_address, amount")
        .eq("listing_id", listing.id)
        .not("status", "in", "(cancelled,refunded)")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!order) return json({ error: "No live order for this item" }, 404);

      const delivery = (order.shipping_address as Addr) ?? {};
      for (const [label, v] of [
        ["address", delivery.address], ["city", delivery.city],
        ["state", delivery.state], ["pincode", delivery.pincode],
      ] as const) {
        if (!v) return json({ error: `The delivery ${label} is missing` }, 422);
      }

      reference = order.order_number;
      orderPayload = buildOutboundOrderPayload({
        hub, buyerDelivery: delivery,
        buyerName: order.buyer_name ?? "",
        buyerEmail: order.buyer_email ?? "",
        buyerPhone: order.buyer_phone ?? "",
        reference,
        itemTitle: listing.title ?? "Item",
        sku: listing.sku ?? listing.id.slice(0, 8),
        shippingCategory: listing.shipping_category ?? null,
        saleValue: Number(order.amount ?? 0),
      });
    }

    const createRes = await fetch(`${SHIPROCKET_BASE}/orders/create/adhoc`, {
      method: "POST", headers: srHeaders, body: JSON.stringify(orderPayload),
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.shipment_id) {
      return json({ error: "Failed to create the Shiprocket order", detail: createData }, 502);
    }

    const srOrderId = String(createData.order_id ?? "");
    const shipmentId = String(createData.shipment_id ?? "");

    // Record the leg before the best-effort steps, so a later failure leaves a
    // booking to retry rather than nothing.
    await db.from("shipments").insert({
      listing_id: listing.id, leg: body.leg,
      shiprocket_order_id: srOrderId, shiprocket_shipment_id: shipmentId,
      status: "pending", last_status_at: new Date().toISOString(),
    });

    const warnings: string[] = [];
    let awb: string | null = null;
    let courier: string | null = null;

    const awbRes = await fetch(`${SHIPROCKET_BASE}/courier/assign/awb`, {
      method: "POST", headers: srHeaders, body: JSON.stringify({ shipment_id: shipmentId }),
    });
    const awbData = await awbRes.json();
    if (awbRes.ok && awbData?.response?.data?.awb_code) {
      awb = String(awbData.response.data.awb_code);
      courier = awbData.response.data.courier_name ? String(awbData.response.data.courier_name) : null;
    } else {
      warnings.push("Courier/AWB assignment failed - retry this booking.");
    }

    if (awb) {
      const pickupRes = await fetch(`${SHIPROCKET_BASE}/courier/generate/pickup`, {
        method: "POST", headers: srHeaders,
        body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
      });
      const pickupData = await pickupRes.json();
      const already = typeof pickupData?.message === "string" &&
        /already|generated|requested/i.test(pickupData.message);
      if (!pickupRes.ok && !already) {
        warnings.push("Pickup request failed - schedule it from the Shiprocket dashboard.");
      }
    }

    let labelUrl: string | null = null;
    if (awb) {
      const labelRes = await fetch(`${SHIPROCKET_BASE}/courier/generate/label`, {
        method: "POST", headers: srHeaders,
        body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
      });
      const labelData = await labelRes.json();
      if (labelRes.ok && labelData?.label_url) labelUrl = String(labelData.label_url);
      else warnings.push("Label generation failed - generate it from the Shiprocket dashboard.");
    }

    if (awb) {
      // Setting awb fires notify_label_issued, which emails the vendor on the
      // inbound leg only.
      await db.from("shipments").update({
        awb, courier, label_url: labelUrl,
        status: "label_issued", last_status_at: new Date().toISOString(),
      }).eq("listing_id", listing.id).eq("leg", body.leg);

      if (body.leg === "INBOUND") {
        await db.rpc("mark_label_issued", { p_listing_id: listing.id });
      } else {
        // The buyer's own order row carries the outbound tracking. The inbound
        // AWB is never written here.
        await db.from("orders").update({
          tracking_number: awb, courier,
          tracking_url: `https://shiprocket.co/tracking/${awb}`,
        }).eq("listing_id", listing.id).not("status", "in", "(cancelled,refunded)");
      }
    }

    return json({
      ok: true, leg: body.leg,
      shiprocket_order_id: srOrderId, shiprocket_shipment_id: shipmentId,
      awb, courier, label_url: labelUrl, warnings,
    });
  } catch (err) {
    console.error("shiprocket-book-leg error", err);
    return json({ error: String(err) }, 500);
  }
});
