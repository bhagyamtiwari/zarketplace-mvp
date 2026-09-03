// Edge Function: create-razorpay-order
//
// Called from Checkout once the buyer's address/order rows exist. Takes the
// order_numbers for one checkout session, verifies the caller actually owns
// them, sums their already-server-validated total_amount (set by the
// orders_snapshot_from_listing trigger — never trusted from the client here),
// and creates (or reuses) a Razorpay Order.
//
// Idempotent: if every order in the group already has the same
// razorpay_order_id and is still awaiting_payment, that same Razorpay order
// is returned instead of creating a new one — safe to call again on retry
// (e.g. buyer reopens Checkout after closing the modal) without creating
// duplicate Razorpay orders.
//
// Required env vars (Supabase function secrets):
//   - RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto-injected)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkIntraState, resolvePincode, STATE_CODE_TO_NAME } from "../_shared/pincode.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

interface RequestBody {
  order_numbers: string[];
}

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

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

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) return json({ error: "Invalid or expired session" }, 401);
    const buyerId = callerData.user.id;

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.order_numbers) || body.order_numbers.length === 0) {
      return json({ error: "order_numbers required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, order_number, buyer_id, seller_id, status, total_amount, razorpay_order_id, checkout_group_id, listing_id, shipping_address")
      .in("order_number", body.order_numbers);
    if (ordersErr) throw ordersErr;
    if (!orders || orders.length !== body.order_numbers.length) {
      return json({ error: "One or more orders not found" }, 404);
    }
    if (orders.some((o) => o.buyer_id !== buyerId)) {
      return json({ error: "Forbidden" }, 403);
    }
    if (orders.some((o) => o.status !== "awaiting_payment" && o.status !== "payment_failed")) {
      return json({ error: "One or more orders are not awaiting payment" }, 409);
    }
    // Retry-path guard: an order can sit in payment_failed (a prior failed
    // attempt, or its reservation lapsing) while the listing itself gets
    // bought by someone else in the meantime. Re-verify availability before
    // letting a retry resume — otherwise this would be the same double-sale
    // bug as the original missing reservation lock, just reached via retry
    // instead of two fresh concurrent checkouts.
    const listingIds = orders.map((o) => o.listing_id).filter(Boolean) as string[];
    if (listingIds.length > 0) {
      const { data: listings, error: listingsErr } = await supabase
        .from("listings")
        .select("id, is_sold, status")
        .in("id", listingIds);
      if (listingsErr) throw listingsErr;
      const unavailable = (listings ?? []).filter((l) => l.is_sold || l.status !== "approved");
      if (unavailable.length > 0) {
        const unavailableIds = new Set(unavailable.map((l) => l.id));
        const affectedOrderIds = orders.filter((o) => unavailableIds.has(o.listing_id)).map((o) => o.id);
        await supabase.from("orders").update({ status: "cancelled" }).in("id", affectedOrderIds);
        return json({ error: "One or more items in this order are no longer available" }, 409);
      }

      // GST place of supply, decided by the DELIVERY PINCODE.
      //
      // Place of supply for goods is where the movement terminates, and the
      // movement that matters here is OURS: the hub ships to the buyer, under
      // our GSTIN. The vendor's state is a fact about the purchase leg, which
      // is a separate transaction on a separate invoice, and has nothing to
      // say about this sale. The previous version compared the buyer against
      // the VENDOR's state, which was wrong on the model and also named the
      // vendor's location to the buyer in the refusal message.
      //
      // Reading the hub state per request rather than from a constant means
      // this starts working the moment the hub address is filled in, with no
      // redeploy.
      //
      // Fails closed on an unreadable or unknown pincode. Declining a sale we
      // could have made is recoverable; completing one we could not lawfully
      // make is not.
      const { data: hubRow } = await supabase
        .from("hub_location").select("state, pincode").eq("id", 1).maybeSingle();
      const hubState = (hubRow?.state ?? "").trim();
      const hubPincode = (hubRow?.pincode ?? "").trim();
      // Pincode first, name second, for the same reason the buyer side reads
      // the pincode rather than the dropdown: a typed state name is a claim,
      // a pincode is a fact.
      const hubCode = resolvePincode(hubPincode).stateCode
        ?? (hubState
          ? Object.entries(STATE_CODE_TO_NAME).find(([, n]) => n.toLowerCase() === hubState.toLowerCase())?.[0] ?? null
          : null);

      // An unconfigured hub is an operations problem, not something a buyer
      // did. It must reach us, loudly, and never read to them as their fault.
      if (!hubCode) {
        console.error(
          "create-razorpay-order: BLOCKED - hub_location has no usable state or pincode. " +
          "Every checkout will be refused until it is set.",
        );
        return json({
          error: "We cannot take payment right now. This is a problem on our side, not with your details. " +
                 "Nothing has been charged. Please try again shortly.",
          operator_alert: "hub_location is not configured: set state or pincode on row id 1.",
        }, 503);
      }

      for (const o of orders) {
        const addr = o.shipping_address as { pincode?: string; state?: string } | null;
        const verdict = checkIntraState(addr?.pincode, hubCode);
        if (verdict.ok) continue;

        // Logged before returning, so the cost of the restriction is
        // measurable and the states worth expanding to are the ones showing
        // up here.
        try {
          await supabase.from("blocked_checkouts").insert({
            buyer_id: o.buyer_id,
            listing_id: o.listing_id,
            attempted_pincode: addr?.pincode ?? null,
            resolved_state_code: verdict.stateCode,
            resolved_state_name: verdict.stateName,
            reason: verdict.reason,
            item_value: o.total_amount,
          });
        } catch (logErr) {
          console.error("create-razorpay-order: blocked_checkouts insert failed", logErr);
        }

        // Nothing here names a vendor, a vendor's state, or anything that
        // implies a third party. We are the seller; this is our delivery
        // limit and it is stated as ours.
        const message = verdict.reason === "different_state"
          ? `We cannot deliver to ${verdict.stateName ?? "that area"} yet. We are working on it. Nothing has been charged.`
          : verdict.reason === "malformed"
          ? "That delivery pincode does not look right. Check it and try again. Nothing has been charged."
          : "We cannot confirm which state that pincode is in, so we cannot take payment for it yet. " +
            "Nothing has been charged. Contact us and we will sort it out.";

        return json({ error: message }, 409);
      }
    }

    // Idempotency: reuse an existing Razorpay order if every row in this
    // group already points at the same one.
    const existingIds = new Set(orders.map((o) => o.razorpay_order_id).filter(Boolean));
    if (existingIds.size === 1) {
      const razorpayOrderId = [...existingIds][0] as string;
      const totalPaise = Math.round(orders.reduce((s, o) => s + Number(o.total_amount), 0) * 100);
      return json({
        razorpay_order_id: razorpayOrderId,
        amount: totalPaise,
        currency: "INR",
        key_id: RAZORPAY_KEY_ID,
      });
    }

    const totalAmount = orders.reduce((s, o) => s + Number(o.total_amount), 0);
    const totalPaise = Math.round(totalAmount * 100);
    if (totalPaise <= 0) return json({ error: "Invalid order amount" }, 400);

    const receipt = orders[0].order_number.slice(0, 40);
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: totalPaise,
        currency: "INR",
        receipt,
        notes: { order_numbers: body.order_numbers.join(",") },
      }),
    });
    const rpData = await rpRes.json();
    if (!rpRes.ok) {
      return json({ error: "Failed to create Razorpay order", detail: rpData }, 502);
    }

    const checkoutGroupId = orders[0].checkout_group_id ?? crypto.randomUUID();
    const { error: updErr } = await supabase
      .from("orders")
      .update({ razorpay_order_id: rpData.id, checkout_group_id: checkoutGroupId })
      .in("id", orders.map((o) => o.id));
    if (updErr) throw updErr;

    return json({
      razorpay_order_id: rpData.id,
      amount: totalPaise,
      currency: "INR",
      key_id: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("create-razorpay-order error", err);
    return json({ error: String(err) }, 500);
  }
});
