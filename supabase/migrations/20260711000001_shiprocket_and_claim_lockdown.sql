-- Shiprocket integration prerequisites + a claim_open integrity fix found
-- while auditing the escrow flow for launch.
--
-- 1. Shiprocket needs a pickup address per order (the courier has to know
--    where to collect from) and a delivery state (their API requires
--    pickup_state/billing_state). Neither existed anywhere in the schema -
--    sellers only ever entered UPI/payout details, never an address, and
--    the buyer address blob (profiles.default_address / orders.shipping_
--    address) has no state field. This adds:
--      - listings.pickup_address jsonb - collected once at listing time
--        (Sell.tsx), same shape as the existing buyer address blob
--        ({ fullName, phone, address, landmark, city, state, pincode }).
--      - orders.pickup_address jsonb - snapshotted from the listing at
--        order-insert time, same pattern as every other snapshot field
--        (seller_upi_vpa_snapshot, amount, shipping_cost, ...), so a later
--        edit to the seller's address never rewrites an in-flight order.
--      - orders.shiprocket_order_id / shiprocket_shipment_id - identifiers
--        returned by Shiprocket once a pickup is booked, so a retry never
--        creates a duplicate booking.
--
-- 2. claim_open integrity fix: the orders_party_update policy (migration
--    20260710000001) only restricts the `status` column ('delivered' is
--    admin-only) - it does not restrict `claim_open` at all. That means a
--    seller can currently clear a buyer's open claim themselves via a
--    direct table write (supabase.from('orders').update({claim_open:
--    false})), which would improperly unblock their own payout. Locks
--    claim_open to admin-only writes via a BEFORE UPDATE trigger, the same
--    pattern already used for listings_lock_immutable and
--    handle_order_delivered.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS pickup_address jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_address jsonb,
  ADD COLUMN IF NOT EXISTS shiprocket_order_id text,
  ADD COLUMN IF NOT EXISTS shiprocket_shipment_id text;

-- Extends the trigger once more (same function, same trigger name) to also
-- snapshot pickup_address. Everything else is unchanged from migration
-- 20260710000004.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_snapshot_from_listing ON public.orders;
CREATE TRIGGER orders_snapshot_from_listing
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_snapshot_from_listing();

-- claim_open lockdown: only an admin (or a service-role caller, e.g. a
-- future claims-review edge function) may open or close a claim.
CREATE OR REPLACE FUNCTION public.orders_lock_claim_open()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.claim_open IS DISTINCT FROM OLD.claim_open AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'claim_open can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_lock_claim_open ON public.orders;
CREATE TRIGGER orders_lock_claim_open
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_lock_claim_open();
