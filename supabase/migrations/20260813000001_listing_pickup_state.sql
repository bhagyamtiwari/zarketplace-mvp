-- Record which state a listing ships from, as a first-class column.
--
-- Interstate supply under GST needs a GSTIN, which individual resellers
-- generally do not have. Until that is resolved a sale is only valid when the
-- buyer and the seller are in the same state, so the buyer-facing catalogue
-- has to be filterable by the seller's state.
--
-- Why a column and not pickup_address->>'state':
--   1. pickup_address is only populated at the seller's FIRST SALE. A brand
--      new seller has none, so their listings would carry no state at all and
--      would be invisible to every buyer - worse than the problem being fixed.
--      The listing form now asks for the state directly.
--   2. public_listings deliberately does not expose pickup_address (it is the
--      seller's home address - see 20260712000002). The view can only filter
--      on something it is allowed to select.
--   3. A seller who moves must not silently relocate every item they have
--      already listed. Snapshotting on the row is the correct semantics.

-- 1. The column. Nullable: rows written before the listing form asked for it
--    have no reliable answer, and inventing one would show an item to the
--    wrong state.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pickup_state text;

-- 2. Backfill from the pickup address where one exists, normalizing the
--    handful of spellings that free text allowed. Anything not recognised is
--    left NULL to be re-asked rather than guessed.
UPDATE public.listings
SET pickup_state = CASE lower(regexp_replace(btrim(pickup_address->>'state'), '[^A-Za-z]', '', 'g'))
  WHEN 'newdelhi' THEN 'Delhi'
  WHEN 'nctofdelhi' THEN 'Delhi'
  WHEN 'delhinct' THEN 'Delhi'
  WHEN 'orissa' THEN 'Odisha'
  WHEN 'pondicherry' THEN 'Puducherry'
  WHEN 'uttaranchal' THEN 'Uttarakhand'
  ELSE (
    SELECT s FROM unnest(ARRAY[
      'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
      'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
      'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
      'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
      'Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands',
      'Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
      'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
    ]) AS s
    WHERE lower(regexp_replace(s, '[^A-Za-z]', '', 'g'))
        = lower(regexp_replace(btrim(pickup_address->>'state'), '[^A-Za-z]', '', 'g'))
  )
END
WHERE pickup_state IS NULL
  AND nullif(btrim(coalesce(pickup_address->>'state', '')), '') IS NOT NULL;

-- 3. Expose it to buyers. CREATE OR REPLACE requires the existing column list
--    unchanged and in order, with new columns appended - hence pickup_state
--    last, after free_shipping. Still a definer view: it bypasses base-table
--    RLS and its WHERE clause is the public row filter.
CREATE OR REPLACE VIEW public.public_listings AS
SELECT
  id,
  sku,
  seller_id,
  seller_display_name,
  seller_instagram,
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
  has_flaws,
  flaws_description,
  original_tags_attached,
  original_packaging,
  item_altered,
  wear_frequency,
  authenticity_confirmed,
  seller_declared_at,
  status,
  is_sold,
  created_at,
  updated_at,
  free_shipping,
  pickup_state
FROM public.listings
WHERE status = 'approved' AND is_sold = false;

GRANT SELECT ON public.public_listings TO anon, authenticated;

-- 4. Filtering the feed by state is the whole point, so index it. Partial:
--    only live rows are ever queried this way.
CREATE INDEX IF NOT EXISTS listings_pickup_state_live_idx
  ON public.listings (pickup_state)
  WHERE status = 'approved' AND is_sold = false;
