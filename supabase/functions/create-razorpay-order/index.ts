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
import { corsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  order_numbers: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
      .select("id, order_number, buyer_id, status, total_amount, razorpay_order_id, checkout_group_id")
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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
