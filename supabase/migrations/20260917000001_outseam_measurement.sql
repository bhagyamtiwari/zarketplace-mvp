-- Outseam, for bottoms.
--
-- The bottoms measurement guide numbers three measurements: 1 waist,
-- 2 inseam, 3 outseam. The form only had fields for the first two, so a seller
-- would see a numbered measurement on the drawing with nowhere to enter it.
-- Nullable and optional, like waist and inseam.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS outseam_cm numeric;

-- Same sanity bounds as the rest, extended. Outseam runs waistband to hem, so
-- it is the longest of the three bottoms measurements: bounded like waist
-- rather than like inseam.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_measurements_sane;
ALTER TABLE public.listings ADD CONSTRAINT listings_measurements_sane CHECK (
      (pit_to_pit_cm IS NULL OR (pit_to_pit_cm > 0 AND pit_to_pit_cm < 200))
  AND (length_cm     IS NULL OR (length_cm     > 0 AND length_cm     < 250))
  AND (sleeve_cm     IS NULL OR (sleeve_cm     > 0 AND sleeve_cm     < 150))
  AND (waist_cm      IS NULL OR (waist_cm      > 0 AND waist_cm      < 200))
  AND (inseam_cm     IS NULL OR (inseam_cm     > 0 AND inseam_cm     < 150))
  AND (outseam_cm    IS NULL OR (outseam_cm    > 0 AND outseam_cm    < 200))
);

-- Appended at the end: CREATE OR REPLACE VIEW may add columns only after the
-- existing ones. Column order, filter and grants are otherwise unchanged, and
-- the view carries no reloptions to lose.
CREATE OR REPLACE VIEW public.public_listings AS
 SELECT id,
    sku,
    title,
    brand,
    description,
    price,
    sale_price,
    category,
    gender,
    size_type,
    size,
    condition,
    image_url,
    image_urls,
    shipping_category,
    free_shipping,
    shipping_mode,
    has_flaws,
    flaws_description,
    original_tags_attached,
    original_packaging,
    item_altered,
    wear_frequency,
    authenticity_confirmed,
    status,
    is_sold,
    created_at,
    updated_at,
    relevance_score,
    seller_id = auth.uid() AS is_mine,
    pit_to_pit_cm,
    length_cm,
    sleeve_cm,
    waist_cm,
    inseam_cm,
    is_verified,
    outseam_cm
   FROM listings l
  WHERE status = 'approved'::text AND is_sold = false;
