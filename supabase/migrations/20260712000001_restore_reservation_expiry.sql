-- Security audit Finding 1 (High): restore order-reservation auto-expiry that
-- was silently dropped from orders_snapshot_from_listing.
--
-- Migration 20260623000006 added a hard reservation lock: a UNIQUE index
-- (orders_listing_one_active_reservation_idx) guaranteeing at most one
-- 'awaiting_payment' order per listing, plus three pieces of logic inside
-- orders_snapshot_from_listing that make that lock self-healing:
--   (a) stamp reservation_expires_at = now() + 20 min on each new order,
--   (b) lazily lapse any stale awaiting_payment hold on the same listing
--       (buyer opened checkout, never paid, no payment.failed webhook fired),
--   (c) a friendly "reserved by another buyer" error when a live hold exists.
--
-- Migration 20260710000002 (pricing / buyer protection) redefined this
-- function WITHOUT (a)/(b)/(c), and 20260710000004 + 20260711000001 carried
-- that reduced form forward. The UNIQUE index is still live, so an abandoned
-- checkout now leaves an awaiting_payment row with reservation_expires_at = NULL
-- that nothing ever expires, and every future buyer's insert for that listing
-- fails on the unique-key violation. The item becomes permanently unbuyable
-- after a single abandoned checkout, and Checkout.tsx's reservation countdown
-- silently no-ops because reservation_expires_at is never populated.
--
-- This migration re-creates orders_snapshot_from_listing with the CURRENT live
-- body (pricing_config buyer-protection fee, shipping_categories rate, pickup
-- snapshot) PLUS the restored (a)/(b)/(c) reservation handling on the
-- non-admin / non-service_role path. The lapse UPDATE in (b) transitions
-- awaiting_payment -> payment_failed for expired holds; that transition is
-- already permitted for any actor by the still-live orders_enforce_transitions
-- "expired reservation lapsing" branch (verified against prod), so no change to
-- that function is needed. Pure CREATE OR REPLACE + trigger re-attach:
-- idempotent and safe to apply live.

CREATE OR REPLACE FUNCTION public.orders_snapshot_from_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.listings;
  ship_rate numeric;
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id is required';
  END IF;

  -- (b) Lazily lapse any expired reservation on this listing before checking
  -- availability, so an abandoned checkout never permanently locks inventory
  -- (no cron required). Releasing a stale hold only frees the item; it can
  -- never fake a payment.
  UPDATE public.orders
    SET status = 'payment_failed'
    WHERE listing_id = NEW.listing_id
      AND status = 'awaiting_payment'
      AND reservation_expires_at < now();

  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF l.status <> 'approved' OR l.is_sold THEN
    RAISE EXCEPTION 'Listing is not available for purchase';
  END IF;

  SELECT rate INTO ship_rate FROM public.shipping_categories WHERE key = l.shipping_category;
  IF ship_rate IS NULL THEN
    RAISE EXCEPTION 'Listing has no valid shipping category';
  END IF;

  -- (c) Friendly error when another buyer still holds a live reservation. The
  -- UNIQUE index is what actually guarantees correctness under concurrency;
  -- this just surfaces a clear message in the common case.
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE listing_id = NEW.listing_id AND status = 'awaiting_payment'
  ) THEN
    RAISE EXCEPTION 'This item is currently reserved by another buyer. Please try again in a few minutes.';
  END IF;

  NEW.listing_sku := l.sku;
  NEW.listing_title := l.title;
  NEW.listing_image_url := l.image_url;
  NEW.seller_id := l.seller_id;
  NEW.seller_email := l.seller_email;
  NEW.seller_upi_vpa_snapshot := l.seller_upi_vpa;
  NEW.pickup_address := l.pickup_address;
  NEW.amount := COALESCE(l.sale_price, l.price);
  NEW.shipping_category := l.shipping_category;
  NEW.shipping_cost := ship_rate;
  NEW.buyer_protection_fee := public.compute_buyer_protection_fee(NEW.amount);
  NEW.total_amount := NEW.amount + NEW.shipping_cost + NEW.buyer_protection_fee;
  -- (a) Reserve this listing for 20 minutes for the new order.
  NEW.reservation_expires_at := now() + interval '20 minutes';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_snapshot_from_listing ON public.orders;
CREATE TRIGGER orders_snapshot_from_listing
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_snapshot_from_listing();
