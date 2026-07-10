-- Escrow correctness fix: payouts must release after delivery, not shipping.
--
-- Before this migration, a seller's own "mark shipped" click created the
-- seller_payouts row immediately (see the removed insert in
-- SellerPortal.tsx TrackingForm.save). That meant the "protected payment"
-- promise was never actually true - the buyer had no delivery confirmation,
-- no review window, and no way to raise a claim before money was owed.
--
-- This migration:
--   1. Adds delivered_at / review_ends_at / claim_open to orders, and a
--      'delivered' status.
--   2. Adds releasable_at to seller_payouts.
--   3. Adds a trigger that stamps delivered_at/review_ends_at and creates
--      the payout row automatically the moment an order's status becomes
--      'delivered' - so payout creation can never again be skipped, forgotten,
--      or done early by a client-side action.
--   4. Locks down who can set status = 'delivered' (admin only, for now -
--      the Shiprocket webhook takes this over with a service-role key once
--      it exists) and who can flip a payout to paid_out (admin only, and
--      only once the review window has actually closed with no open claim).
--
-- Known simplification for MVP: this does not enforce a strict state
-- sequence (e.g. paid -> shipped -> delivered). Any status can transition to
-- 'delivered' as long as the actor is admin. Pickup/in-transit states arrive
-- with the Shiprocket integration.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_open boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'awaiting_payment', 'awaiting_verification', 'paid', 'payment_failed',
    'payment_conflict', 'shipped', 'delivered', 'cancelled', 'refunded'
  ]::text[]));

ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS releasable_at timestamptz;

-- Stamps delivery timestamps and creates the payout ledger row the instant
-- status flips to 'delivered'. SECURITY DEFINER so it can write to
-- seller_payouts regardless of who triggered the update (admin today, the
-- Shiprocket webhook's service-role key later) - see the fulfill_captured_
-- payment() precedent in migration 20260623000008 for the same pattern.
--
-- Payout amount is orders.amount (the item price only), not total_amount -
-- shipping is no longer the seller's to collect under the new model, so it
-- must never be paid out to them.
CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := now();
    NEW.review_ends_at := now() + interval '48 hours';

    IF NEW.seller_id IS NOT NULL THEN
      INSERT INTO public.seller_payouts (seller_id, order_id, amount, releasable_at)
      VALUES (NEW.seller_id, NEW.id, NEW.amount, NEW.review_ends_at)
      ON CONFLICT (order_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM authenticated;

DROP TRIGGER IF EXISTS on_order_delivered ON public.orders;
CREATE TRIGGER on_order_delivered
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_delivered();

-- A buyer or seller may still update their own order rows (shipping
-- tracking, etc.), but only an admin (or a service-role caller, which
-- bypasses RLS entirely) may set status to 'delivered' - that transition is
-- what releases a seller's money, so it can't be self-served.
DROP POLICY IF EXISTS orders_party_update ON public.orders;
CREATE POLICY orders_party_update ON public.orders FOR UPDATE
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR is_admin())
  WITH CHECK (
    (buyer_id = auth.uid() OR seller_id = auth.uid() OR is_admin())
    AND (status <> 'delivered' OR is_admin())
  );

-- Sellers no longer create their own payout row (the trigger above does it
-- at delivery time) - drop their direct insert grant entirely.
DROP POLICY IF EXISTS seller_payouts_seller_insert ON public.seller_payouts;

-- Admin can freely edit a payout row, except flipping it to paid_out: that
-- specific transition now requires the review window to have actually
-- closed and the order to have no open claim, enforced here rather than
-- only in the client UI.
DROP POLICY IF EXISTS seller_payouts_admin_update ON public.seller_payouts;
CREATE POLICY seller_payouts_admin_update ON public.seller_payouts FOR UPDATE
  USING (is_admin())
  WITH CHECK (
    is_admin()
    AND (
      status <> 'paid_out'
      OR (
        releasable_at IS NOT NULL AND releasable_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.claim_open
        )
      )
    )
  );
