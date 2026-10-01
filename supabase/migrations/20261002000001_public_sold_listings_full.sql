-- Sold items open as their own page (greyed, tagged Sold, not buyable), so
-- the sold view carries the same safe columns as public_listings. Still no
-- vendor key of any kind; the isolation test probes it.
DROP VIEW IF EXISTS public.public_sold_listings;
CREATE VIEW public.public_sold_listings AS
  SELECT l.id, l.sku, l.title, l.brand, l.description, l.price, l.sale_price, l.category, l.gender,
         l.size_type, l.size, l.condition, l.image_url, l.image_urls, l.shipping_category, l.free_shipping,
         l.has_flaws, l.flaws_description, l.original_tags_attached, l.original_packaging, l.item_altered,
         l.wear_frequency, l.authenticity_confirmed, l.status, l.is_sold, l.created_at, l.updated_at,
         l.pit_to_pit_cm, l.length_cm, l.sleeve_cm, l.waist_cm, l.inseam_cm, l.outseam_cm, l.is_verified,
         l.updated_at AS sold_at
    FROM public.listings l
   WHERE l.status = 'approved' AND l.is_sold = true;
GRANT SELECT ON public.public_sold_listings TO anon, authenticated;
