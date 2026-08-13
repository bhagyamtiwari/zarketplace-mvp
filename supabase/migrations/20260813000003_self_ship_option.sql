-- Let a seller ship the item themselves.
--
-- Until now every listing went out on a courier we book, and the only choice
-- was who pays for it. Sellers who already have their own courier arrangement
-- had no way to list at all, which is a strange thing to block when the
-- problem is not enough listings.
--
-- Three fulfilment choices, from two columns rather than a new enum:
--
--   shipping_mode = 'platform', free_shipping = false  -> we ship, buyer pays
--   shipping_mode = 'platform', free_shipping = true   -> we ship, seller pays
--   shipping_mode = 'self_ship'                        -> seller ships it
--
-- shipping_mode already existed as a dead column: NOT NULL DEFAULT 'free',
-- every row set to 'free', and referenced by no function, no view and no line
-- of application code (checked before writing this). Repurposing it beats
-- adding a fifth shipping_* column beside it.

-- 1. Repurpose the column. Everything currently on file is platform-shipped.
--    The original CHECK pinned it to ('free','paid') - vocabulary from the
--    era when the column meant "who pays", which is now what free_shipping
--    records. It has to go before the values can be rewritten, or the UPDATE
--    below fails against it.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_shipping_mode_check;
UPDATE public.listings SET shipping_mode = 'platform' WHERE shipping_mode <> 'self_ship';
ALTER TABLE public.listings ALTER COLUMN shipping_mode SET DEFAULT 'platform';
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_shipping_mode_valid;
ALTER TABLE public.listings ADD CONSTRAINT listings_shipping_mode_valid
  CHECK (shipping_mode IN ('platform', 'self_ship'));

-- 2. Orders need to remember which it was. The listing can be edited or
--    deleted later; an order is a record of what was actually agreed, so it
--    snapshots the mode exactly as it snapshots price and address.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_mode text NOT NULL DEFAULT 'platform';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_mode_valid;
ALTER TABLE public.orders ADD CONSTRAINT orders_shipping_mode_valid
  CHECK (shipping_mode IN ('platform', 'self_ship'));

-- 3. Charge correctly. This is the only place the buyer's total is decided -
--    the client merely mirrors it for display - so self-ship has to zero the
--    shipping line here or the buyer pays us for a courier we never book.
--    Buyer Protection is unchanged: it is escrow and dispute cover, which the
--    buyer gets whoever hands the parcel over.
CREATE OR REPLACE FUNCTION public.orders_snapshot_from_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  l public.listings;
  cat public.shipping_categories;
  self_ship boolean;
  ship_charge numeric;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id is required';
  END IF;

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

  IF NEW.buyer_id IS NOT NULL AND NEW.buyer_id = l.seller_id THEN
    RAISE EXCEPTION 'You cannot buy your own listing';
  END IF;

  self_ship := (l.shipping_mode = 'self_ship');

  SELECT * INTO cat FROM public.shipping_categories WHERE key = l.shipping_category;
  IF NOT FOUND OR cat.rate IS NULL THEN
    RAISE EXCEPTION 'Listing has no valid shipping category';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders WHERE listing_id = NEW.listing_id AND status = 'awaiting_payment'
  ) THEN
    RAISE EXCEPTION 'This item is currently reserved by another buyer. Please try again in a few minutes.';
  END IF;

  -- What the buyer is charged for delivery. Self-ship costs them nothing
  -- extra; the seller absorbs whatever their own courier charges, exactly as
  -- they would have on Instagram.
  ship_charge := CASE
    WHEN self_ship THEN 0
    WHEN l.free_shipping THEN 0
    ELSE cat.rate
  END;

  NEW.listing_sku := l.sku;
  NEW.listing_title := l.title;
  NEW.listing_image_url := l.image_url;
  NEW.seller_id := l.seller_id;
  NEW.seller_email := l.seller_email;
  NEW.seller_upi_vpa_snapshot := l.seller_upi_vpa;
  NEW.pickup_address := l.pickup_address;
  NEW.amount := COALESCE(l.sale_price, l.price);
  NEW.shipping_category := l.shipping_category;
  NEW.shipping_mode := l.shipping_mode;
  -- shipping_cost is what we would bill for the courier. Zero on self-ship:
  -- there is no courier of ours to bill for.
  NEW.shipping_cost := CASE WHEN self_ship THEN 0 ELSE cat.rate END;
  NEW.free_shipping := l.free_shipping;
  NEW.buyer_protection_fee := public.compute_buyer_protection_fee(NEW.amount);
  NEW.total_amount := NEW.amount + ship_charge + NEW.buyer_protection_fee;
  NEW.reservation_expires_at := now() + interval '20 minutes';
  NEW.package_snapshot := CASE WHEN self_ship THEN
    jsonb_build_object('source', 'self_ship')
  ELSE
    jsonb_build_object(
      'weight_kg',  cat.default_weight_kg,
      'length_cm',  cat.pkg_length_cm,
      'breadth_cm', cat.pkg_breadth_cm,
      'height_cm',  cat.pkg_height_cm,
      'rate',       cat.rate,
      'source',     'category_estimate'
    )
  END;
  RETURN NEW;
END;
$function$;

-- 4. Buyers need to see the mode before they buy, so the card and product page
--    can say who is shipping. Appended last, as CREATE OR REPLACE requires.
CREATE OR REPLACE VIEW public.public_listings AS
SELECT
  id, sku, seller_id, seller_display_name, seller_instagram, title, brand,
  description, price, sale_price, category, gender, size_type, size, condition,
  image_url, image_urls, shipping_category, has_flaws, flaws_description,
  original_tags_attached, original_packaging, item_altered, wear_frequency,
  authenticity_confirmed, seller_declared_at, status, is_sold, created_at,
  updated_at, free_shipping, pickup_state, shipping_mode
FROM public.listings
WHERE status = 'approved' AND is_sold = false;

GRANT SELECT ON public.public_listings TO anon, authenticated;

-- 5. Stop the pickup-address rule from making self-ship impossible.
--
--    Approval required a complete pickup address, for the stated reason that
--    "a courier pickup could never be booked" without one. That reason does
--    not exist on self-ship: there is no pickup of ours to book. Meanwhile a
--    pickup address is only collected at the seller's FIRST SALE, so a brand
--    new seller choosing self-ship could never have a listing approved - the
--    exact seller this option is for. Found by exercising the trigger rather
--    than by reading it.
CREATE OR REPLACE FUNCTION public.listings_require_pickup_address()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'approved' AND NEW.shipping_mode <> 'self_ship' THEN
    IF NEW.pickup_address IS NULL
       OR coalesce(NEW.pickup_address->>'address','') = ''
       OR coalesce(NEW.pickup_address->>'city','') = ''
       OR coalesce(NEW.pickup_address->>'state','') = ''
       OR coalesce(NEW.pickup_address->>'pincode','') = '' THEN
      RAISE EXCEPTION 'This listing has no complete pickup address (address, city, state, pincode), so a courier pickup could never be booked. Ask the seller to add it before approving.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
