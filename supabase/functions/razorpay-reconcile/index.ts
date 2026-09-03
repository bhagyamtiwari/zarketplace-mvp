// Edge Function: razorpay-reconcile
//
// Compares what we believe about every captured payment against what Razorpay
// actually holds, and reports only the disagreements.
//
// This exists because four cancelled orders carried captured payments totalling
// 22,827 with no refund record on our side. Whether the money was returned or
// not, we could not tell from our own database - and "we cannot tell" is the
// problem. A refund that happens at Razorpay and is never written back leaves
// our record permanently wrong, in the same shape as every other silent
// failure found in this codebase: the operation succeeded somewhere else and
// nothing here noticed.
//
// It is a standing tool, not a one-off. Run it before a wipe, after any manual
// dashboard refund, and on any order whose status looks wrong.
//
// Never returns secrets. Admin only: the caller's JWT is checked against
// is_admin() before anything is fetched.
//
// Required secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (already set).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";

interface RazorpayPayment {
  id: string;
  status: string;              // created | authorized | captured | refunded | failed
  amount: number;              // paise
  amount_refunded: number;     // paise
  error_description?: string | null;
}

/** What our row says, what Razorpay says, and whether those agree. */
interface Row {
  order_number: string;
  our_status: string;
  our_amount: number;
  payment_id: string;
  razorpay_status: string | null;
  razorpay_amount: number | null;
  razorpay_refunded: number | null;
  disagreement: string | null;
}

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload, null, 2), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!KEY_ID || !KEY_SECRET) {
      return json({ error: "Razorpay is not configured on the server" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    // Admin only, checked against the same is_admin() the policies use. This
    // reads every buyer's payment record, so it is not a vendor-safe surface.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);
    const { data: isAdmin } = await caller.rpc("is_admin");
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: orders, error: ordersErr } = await db
      .from("orders")
      .select("order_number, status, total_amount, razorpay_payment_id")
      .not("razorpay_payment_id", "is", null)
      .order("created_at");
    if (ordersErr) throw ordersErr;

    const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
    const rows: Row[] = [];

    for (const o of orders ?? []) {
      const paymentId = o.razorpay_payment_id as string;
      const our_amount = Number(o.total_amount);
      let rp: RazorpayPayment | null = null;
      let fetchError: string | null = null;

      try {
        const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (res.ok) rp = await res.json() as RazorpayPayment;
        else fetchError = `Razorpay returned ${res.status}`;
      } catch (e) {
        fetchError = String(e);
      }

      // Everything is compared in paise, because that is the unit Razorpay is
      // authoritative in. Comparing rupees invites a rounding disagreement
      // that looks like a real one.
      const ourPaise = Math.round(our_amount * 100);
      const refunded = rp?.amount_refunded ?? 0;
      const fullyRefunded = rp ? refunded >= rp.amount && rp.amount > 0 : false;
      const partlyRefunded = refunded > 0 && !fullyRefunded;

      let disagreement: string | null = null;
      if (fetchError) {
        disagreement = `Could not read this payment from Razorpay: ${fetchError}`;
      } else if (!rp) {
        disagreement = "Razorpay has no record of this payment id";
      } else if (fullyRefunded && o.status !== "refunded") {
        disagreement =
          `Razorpay shows this fully refunded (${refunded / 100}), we still say "${o.status}". ` +
          `The money went back and our record never learned.`;
      } else if (partlyRefunded && o.status !== "refunded") {
        disagreement =
          `Razorpay shows a partial refund of ${refunded / 100} of ${rp.amount / 100}, we say "${o.status}".`;
      } else if (o.status === "refunded" && refunded === 0) {
        disagreement = "We say refunded, Razorpay shows nothing returned. The buyer has not been paid back.";
      } else if (o.status === "cancelled" && rp.status === "captured" && refunded === 0) {
        disagreement =
          `Cancelled here, captured and NOT refunded at Razorpay. ${rp.amount / 100} is still held.`;
      } else if (rp.amount !== ourPaise) {
        disagreement = `Amount mismatch: we say ${our_amount}, Razorpay says ${rp.amount / 100}.`;
      }

      rows.push({
        order_number: o.order_number,
        our_status: o.status,
        our_amount,
        payment_id: paymentId,
        razorpay_status: rp?.status ?? null,
        razorpay_amount: rp ? rp.amount / 100 : null,
        razorpay_refunded: rp ? refunded / 100 : null,
        disagreement,
      });
    }

    const disagreements = rows.filter((r) => r.disagreement);
    return json({
      checked: rows.length,
      agreeing: rows.length - disagreements.length,
      disagreeing: disagreements.length,
      money_still_held:
        rows.filter((r) => r.our_status === "cancelled" && r.razorpay_refunded === 0)
            .reduce((s, r) => s + (r.razorpay_amount ?? 0), 0),
      disagreements,
      all: rows,
    });
  } catch (err) {
    console.error("razorpay-reconcile error", err);
    return json({ error: String(err) }, 500);
  }
});
