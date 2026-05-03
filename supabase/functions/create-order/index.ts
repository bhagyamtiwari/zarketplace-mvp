// Edge Function: create-order
//
// Purpose:
//   Creates an order in our `orders` table AND a corresponding Cashfree order,
//   then returns the payment_session_id that the frontend uses to open the
//   Cashfree checkout popup.
//
// Environment variables required (set via `supabase secrets set` or in
// Dashboard -> Project Settings -> Edge Functions):
//   - CASHFREE_APP_ID         (test: TEST10521924cfa7306bde25f8b49ed642912501)
//   - CASHFREE_SECRET_KEY     (test: cfsk_ma_test_...)
//   - CASHFREE_ENV            "sandbox" | "production"  (default: sandbox)
//   - SUPABASE_URL            auto-injected
//   - SUPABASE_SERVICE_ROLE_KEY auto-injected
//   - PUBLIC_SITE_URL         e.g. https://zarketplace.com (used for return_url)
//
// Request body:
//   { listing_id: string, buyer: { name, email, phone, address, city, pincode },
//     billing?: same shape, payment_method?: 'online' }
//
// Response:
//   { order_number, cashfree_order_id, payment_session_id }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const PLATFORM_FEE_RATE = 0.10; // 10% platform fee

interface BuyerInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const APP_ID = Deno.env.get("CASHFREE_APP_ID");
    const SECRET = Deno.env.get("CASHFREE_SECRET_KEY");
    const ENV = (Deno.env.get("CASHFREE_ENV") ?? "sandbox").toLowerCase();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:3000";

    if (!APP_ID || !SECRET) {
      return json({ error: "Cashfree credentials not configured" }, 500);
    }

    const body = await req.json();
    const { listing_id, buyer, billing } = body as {
      listing_id: string;
      buyer: BuyerInput;
      billing?: BuyerInput;
    };

    if (!listing_id || !buyer?.email || !buyer?.name || !buyer?.phone) {
      return json({ error: "Missing required fields" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Fetch listing & verify it's available
    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listing_id)
      .single();

    if (listingErr || !listing) {
      return json({ error: "Listing not found" }, 404);
    }
    if (listing.is_sold) {
      return json({ error: "Listing already sold" }, 409);
    }
    if (listing.status !== "approved") {
      return json({ error: "Listing not available for purchase" }, 400);
    }

    // 2. Calculate amounts
    const itemPrice = Number(listing.sale_price ?? listing.price);
    const shipping = Number(listing.shipping_cost ?? 0);
    const total = itemPrice + shipping;
    const platformFee = Math.round(itemPrice * PLATFORM_FEE_RATE * 100) / 100;
    const sellerPayout = itemPrice - platformFee; // seller pays shipping if free

    // 2.5 Idempotency: if this buyer already has a recent (<30 min) pending
    // order for this same listing AND we already created a Cashfree session
    // for it, reuse that session. Prevents duplicate orphan orders when the
    // user double-clicks "Pay" or refreshes the checkout page.
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number, cashfree_order_id, cashfree_payment_session_id, total_amount")
      .eq("listing_id", listing.id)
      .eq("buyer_email", buyer.email.toLowerCase())
      .eq("status", "pending")
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder?.cashfree_payment_session_id && Number(existingOrder.total_amount) === total) {
      console.log("Reusing existing pending order", existingOrder.order_number);
      return json({
        order_number: existingOrder.order_number,
        cashfree_order_id: existingOrder.cashfree_order_id,
        payment_session_id: existingOrder.cashfree_payment_session_id,
        env: ENV,
        reused: true,
      });
    }

    // 3. Insert order row (status pending). Triggers will assign order_number.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        listing_id: listing.id,
        listing_sku: listing.sku,
        listing_title: listing.title,
        listing_image_url: listing.image_url,
        buyer_email: buyer.email.toLowerCase(),
        buyer_name: buyer.name,
        buyer_phone: buyer.phone,
        shipping_address: buyer,
        billing_address: billing ?? buyer,
        seller_email: (listing.seller_email ?? "").toLowerCase(),
        amount: itemPrice,
        shipping_cost: shipping,
        total_amount: total,
        platform_fee: platformFee,
        seller_payout_amount: sellerPayout,
        status: "pending",
      })
      .select()
      .single();

    if (orderErr || !order) {
      console.error("Order insert failed", orderErr);
      return json({ error: "Failed to create order", detail: orderErr?.message }, 500);
    }

    // 4. Create Cashfree order
    const cashfreeBase = ENV === "production"
      ? "https://api.cashfree.com/pg/orders"
      : "https://sandbox.cashfree.com/pg/orders";

    // Cashfree requires customer_phone digits-only and 10-15 chars
    const cleanPhone = (buyer.phone || "").replace(/\D/g, "").slice(-10) || "9999999999";

    const cfPayload = {
      order_id: order.order_number,
      order_amount: total,
      order_currency: "INR",
      customer_details: {
        customer_id: "buyer_" + order.id,
        customer_name: buyer.name,
        customer_email: buyer.email,
        customer_phone: cleanPhone,
      },
      order_meta: {
        return_url: `${SITE_URL}/track-order?order=${order.order_number}&email=${encodeURIComponent(buyer.email)}`,
        notify_url: `${SUPABASE_URL}/functions/v1/cashfree-webhook`,
      },
      order_note: `Zarketplace order for ${listing.title} (SKU ${listing.sku})`,
    };

    const cfRes = await fetch(cashfreeBase, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2023-08-01",
        "x-client-id": APP_ID,
        "x-client-secret": SECRET,
      },
      body: JSON.stringify(cfPayload),
    });

    const cfData = await cfRes.json();

    if (!cfRes.ok || !cfData.payment_session_id) {
      console.error("Cashfree create order failed", cfData);
      // Mark order as cancelled so it doesn't block the listing
      await supabase
        .from("orders")
        .update({ status: "cancelled", payment_status: "failed", cashfree_payment_response: cfData })
        .eq("id", order.id);
      return json(
        { error: "Cashfree order creation failed", detail: cfData },
        500,
      );
    }

    // 5. Save Cashfree IDs back to the order
    await supabase
      .from("orders")
      .update({
        cashfree_order_id: cfData.cf_order_id?.toString() ?? cfData.order_id,
        cashfree_payment_session_id: cfData.payment_session_id,
      })
      .eq("id", order.id);

    return json({
      order_number: order.order_number,
      cashfree_order_id: cfData.cf_order_id ?? cfData.order_id,
      payment_session_id: cfData.payment_session_id,
      env: ENV,
    });
  } catch (err) {
    console.error("create-order unexpected error", err);
    return json({ error: "Unexpected error", detail: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}