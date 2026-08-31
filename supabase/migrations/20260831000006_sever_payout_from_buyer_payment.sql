-- Sever the last link between a buyer's money and a vendor's payout.
--
-- handle_order_delivered was written for the old marketplace: a buyer's order
-- reaching 'delivered' inserted a payout row keyed to that order. That is
-- exactly the causal chain the reseller model cannot have - it makes the
-- vendor's money conditional on the buyer's, and it reads to any reviewer as
-- one split payment rather than two transactions.
CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := now();
    NEW.review_ends_at := now() + interval '48 hours';
  END IF;
  RETURN NEW;
END $fn$;

-- seller_payouts was that model's ledger: one row per ORDER. Its very shape -
-- order_id NOT NULL UNIQUE - is the claim that a vendor's money comes out of a
-- buyer's payment. Empty, unreferenced, and replaced by public.payouts.
DROP TABLE IF EXISTS public.seller_payouts;
