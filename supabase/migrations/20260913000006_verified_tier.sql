-- The "Verified" shelf: stock we own outright, shot ourselves, sitting on our
-- shelf and ready to go out the same day. MODEL.md §3 names this exact filter
-- ("Verified - ships in 48 hours") and §13 step 2 is where the stock comes
-- from: the forty-odd seed listings we buy and photograph ourselves.
--
-- This is NOT the instant lane. The instant lane is a vendor-facing offer, at a
-- lower price, for someone who ships to us before a sale, and it stays
-- deferred. Nothing here is offered to a vendor at all: it is a label an
-- operator puts on inventory we already own, and the only thing it changes is
-- what a buyer can filter by.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listings.is_verified IS
  'Operator-set. Stock we own and photographed ourselves, in hand and ready to dispatch. Buyer-facing filter only; never offered to or set by a vendor.';

CREATE INDEX IF NOT EXISTS listings_verified_idx ON public.listings (is_verified)
  WHERE is_verified = true;

-- A vendor must not be able to award themselves the badge.
CREATE OR REPLACE FUNCTION public.guard_verified_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT public.is_admin()
     AND COALESCE(current_setting('zarketplace.internal', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Only an operator can mark an item verified';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS listings_guard_verified ON public.listings;
CREATE TRIGGER listings_guard_verified
  BEFORE UPDATE OF is_verified ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_verified_flag();

-- The storefront view, restated in full.
--
-- The column list is the one the live view already served, plus the
-- measurements from 20260913000004 and is_verified. Notably absent, and it has
-- to stay that way: seller_id and every other per-vendor key, which an earlier
-- fix removed because a stable id lets a buyer group the catalogue by vendor.
-- The isolation test guards this.
CREATE OR REPLACE VIEW public.public_listings AS
  SELECT
    l.id, l.sku, l.title, l.brand, l.description, l.price, l.sale_price,
    l.category, l.gender, l.size_type, l.size, l.condition,
    l.image_url, l.image_urls, l.shipping_category, l.free_shipping,
    l.shipping_mode, l.has_flaws, l.flaws_description,
    l.original_tags_attached, l.original_packaging, l.item_altered,
    l.wear_frequency, l.authenticity_confirmed, l.status, l.is_sold,
    l.created_at, l.updated_at, l.relevance_score,
    (l.seller_id = auth.uid()) AS is_mine,
    l.pit_to_pit_cm, l.length_cm, l.sleeve_cm, l.waist_cm, l.inseam_cm,
    l.is_verified
  FROM public.listings l
  WHERE l.status = 'approved' AND l.is_sold = false;

GRANT SELECT ON public.public_listings TO anon, authenticated;
