-- Seller payout ledger. A row is created (client-side, by the seller's own
-- "mark shipped" action) the moment an order ships, so there's a real record
-- of what's owed. Admin manually flips status to 'paid_out' once the UPI
-- transfer has actually been sent outside the app — no payment automation,
-- just proper tracking, per current MVP scope.
CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payout'
    CHECK (status IN ('awaiting_payout', 'paid_out')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS seller_payouts_seller_idx ON public.seller_payouts (seller_id);
CREATE INDEX IF NOT EXISTS seller_payouts_status_idx ON public.seller_payouts (status);

ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seller_payouts_seller_insert ON public.seller_payouts;
DROP POLICY IF EXISTS seller_payouts_party_select ON public.seller_payouts;
DROP POLICY IF EXISTS seller_payouts_admin_update ON public.seller_payouts;

-- A seller may only create the payout row for their own order, for the
-- order's own seller_id/amount (no inserting payouts for someone else's sale).
CREATE POLICY seller_payouts_seller_insert ON public.seller_payouts FOR INSERT
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.seller_id = auth.uid()
    )
  );

CREATE POLICY seller_payouts_party_select ON public.seller_payouts FOR SELECT
  USING (seller_id = auth.uid() OR public.is_admin());

-- Only admin can flip a payout to paid_out.
CREATE POLICY seller_payouts_admin_update ON public.seller_payouts FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
