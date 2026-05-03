// Edge Function: cashfree-refund
//
// Purpose:
//   Issues a refund against a Cashfree order. Called from the admin panel
//   when an order needs to be cancelled after payment.
//
// Docs: https://www.cashfree.com/docs/api-reference/payments/latest/refunds/create
//
// Required env vars:
//   - CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   - ADMIN_RELEASE_TOKEN  (shared secret required in `x-admin-token` header)
//
// Request body: { order_id: string (our orders.id), reason?: string, amount?: number }
//
// Response: { ok: true, refund_id, refund_status }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const APP_ID = Deno.env.get("CASHFREE_APP_ID")!;
    const SECRET = Deno.env.get("CASHFREE_SECRET_KEY")!;
    const ENV = (Deno.env.get("CASHFREE_ENV") ?? "sandbox").toLowerCase();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ADMIN_TOKEN = Deno.env.get("ADMIN_RELEASE_TOKEN");

    if (ADMIN_TOKEN && req.headers.get("x-admin-token") !== ADMIN_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }

    const { order_id, reason, amount } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: order } = await supabase.from("orders").select("*").eq("id", order_id).single();
    if (!order) return json({ error: "order not found" }, 404);
    if (!order.cashfree_order_id && !order.order_number) {
      return json({ error: "order has no Cashfree reference" }, 400);
    }

    const base = ENV === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    // Cashfree refund endpoint uses our order_id (we used order_number)
    const cfOrderId = order.order_number;
    const refundId = `RF-${Date.now()}`;
    const refundAmount = amount ?? Number(order.total_amount);

    const cfRes = await fetch(`${base}/orders/${cfOrderId}/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2023-08-01",
        "x-client-id": APP_ID,
        "x-client-secret": SECRET,
      },
      body: JSON.stringify({
        refund_amount: refundAmount,
        refund_id: refundId,
        refund_note: reason ?? "Order cancelled by admin",
      }),
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok) {
      return json({ error: "Cashfree refund failed", detail: cfData }, 500);
    }

    // Update DB: mark order refunded; un-sell listing; cancel payout
    await supabase.from("orders").update({
      status: "refunded",
      payment_status: "REFUNDED",
      cashfree_payment_response: cfData,
    }).eq("id", order_id);

    await supabase.from("listings").update({ is_sold: false }).eq("id", order.listing_id);
    await supabase.from("seller_payouts").update({ status: "cancelled", notes: "Order refunded" }).eq("order_id", order_id);

    return json({ ok: true, refund_id: refundId, refund_status: cfData.refund_status, detail: cfData });
  } catch (err) {
    console.error("cashfree-refund error", err);
    return json({ error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
