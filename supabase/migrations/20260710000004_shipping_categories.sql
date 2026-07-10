-- Shipping v1 (docs/REALIGNMENT_PLAN.md §0.3): buyer always pays a flat,
-- category-based shipping rate. The seller picks a shipping category at
-- listing time (not dimensions/weight); zarketplace buys the prepaid label
-- for that rate once the buyer pays, and the seller just packs the item and
-- hands it to the courier at pickup. Sellers never arrange or pay for
-- shipping themselves, and free/self-absorbed shipping no longer exists.
--
-- Replaces the old listings.shipping_mode ('free'/'paid') + shipping_cost
-- (seller-set, seller-collected) model entirely for new listings. The old
-- columns are left in place (unused by new code) rather than dropped, since
-- they hold real seller-entered data on existing rows and dropping is not
-- reversible - safe cleanup for a later migration once nothing reads them.

CREATE TABLE IF NOT EXISTS public.shipping_categories (
  key text PRIMARY KEY,
  label text NOT NULL,
  rate numeric NOT NULL CHECK (rate >= 0),
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO public.shipping_categories (key, label, rate, sort_order) VALUES
  ('tops', 'T-Shirts & Tops', 80, 1),
  ('bottoms', 'Jeans & Bottoms', 99, 2),
  ('footwear', 'Footwear', 129, 3),
  ('outerwear', 'Jackets & Heavy Items', 149, 4),
  ('accessories', 'Accessories & Small Items', 79, 5)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.shipping_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipping_categories_read ON public.shipping_categories;
CREATE POLICY shipping_categories_read ON public.shipping_categories FOR SELECT
  USING (true);
DROP POLICY IF EXISTS shipping_categories_admin_write ON public.shipping_categories;
CREATE POLICY shipping_categories_admin_write ON public.shipping_categories FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS shipping_category text REFERENCES public.shipping_categories(key);

-- Backfill from the listing's own product category, which is a reasonable
-- real mapping (not a blind guess) - existing sellers already chose one of
-- these five categories when listing.
UPDATE public.listings SET shipping_category = CASE category
  WHEN 'Tops' THEN 'tops'
  WHEN 'Bottoms' THEN 'bottoms'
  WHEN 'Outerwear' THEN 'outerwear'
  WHEN 'Shoes' THEN 'footwear'
  WHEN 'Accessories' THEN 'accessories'
  ELSE 'tops'
END
WHERE shipping_category IS NULL;

ALTER TABLE public.listings ALTER COLUMN shipping_category SET DEFAULT 'tops';
ALTER TABLE public.listings ALTER COLUMN shipping_category SET NOT NULL;

-- Orders snapshot the category too (useful for the future Shiprocket label
-- request, and so a later shipping_categories edit never rewrites history).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_category text;

-- Extends the same trigger from migration 20260710000002: shipping is now
-- always charged (category rate), never seller-optional/free.
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
