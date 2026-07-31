-- Shipping v2, part 2 of 2: fix the payout deduction predicate.
--
-- REQUIRES 20260731000001 (shipping_payer / fulfillment_method) to be applied
-- first. This migration will fail loudly if it is not, which is the intent.
--
-- The body below is the LIVE definition, dumped from production on 2026-07-31
-- via pg_get_functiondef, with exactly ONE expression changed: the CASE
-- predicate that decides whether shipping is deducted from the payout.
--
-- Do NOT regenerate this function from the copy in
-- 20260710000001_delivery_escrow_and_payout_timing.sql. That copy predates the
-- free_shipping work and inserts NEW.amount with no deduction at all, so
-- applying it would start paying free-delivery sellers the full asking price
-- while zarketplace keeps buying their labels.
--
-- WHAT CHANGED AND WHY:
--
--   before:  CASE WHEN NEW.free_shipping THEN NEW.shipping_cost ELSE 0 END
--   after:   CASE WHEN NEW.shipping_payer = 'seller'
--                  AND NEW.fulfillment_method = 'zarketplace'
--                 THEN NEW.shipping_cost ELSE 0 END
--
-- free_shipping is true on BOTH seller-funded routes, but only one of them
-- deducts. A self-shipping seller shows Free at checkout and already paid
-- their own courier directly, so the old predicate would have taken the flat
-- rate out of their payout a second time: up to Rs. 259 per order, with no
-- error raised anywhere and no way for the seller to see why they were short.
--
-- free_shipping remains correct for display ("does checkout say Free?") and is
-- still read by the Marketplace filter, ListingCard, ProductPage and Checkout.
-- It is only wrong as a payout predicate. See docs/SHIPPING_V2_PLAN.md.
--
-- THIS IS ONE OF THREE PLACES THAT COMPUTE SELLER PAYOUT. The other two are
-- calculateSellerPayout() in src/lib/pricing.ts and the payout-released-seller
-- email template. All three now use the same predicate. Changing one without
-- the others means the seller is told a number we do not pay.
--
-- !!! APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR, AS ONE SCRIPT. !!!

begin;

CREATE OR REPLACE FUNCTION public.handle_order_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := now();
    NEW.review_ends_at := now() + interval '48 hours';

    IF NEW.seller_id IS NOT NULL THEN
      INSERT INTO public.seller_payouts (seller_id, order_id, amount, releasable_at)
      VALUES (
        NEW.seller_id,
        NEW.id,
        -- Deduct only when WE bought the label. Not on self-ship: that seller
        -- paid their own courier and keeps the full asking price.
        GREATEST(0, NEW.amount - (
          CASE WHEN NEW.shipping_payer = 'seller'
                AND NEW.fulfillment_method = 'zarketplace'
               THEN NEW.shipping_cost ELSE 0 END
        )),
        NEW.review_ends_at
      )
      ON CONFLICT (order_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Permissions and the trigger binding are unchanged from
-- 20260710000001; CREATE OR REPLACE preserves both. Restated here only so the
-- end state is explicit if this file is ever read on its own.
REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM authenticated;

commit;
