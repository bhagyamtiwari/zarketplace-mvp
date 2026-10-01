-- Sold items, for /sold and for favourites that have sold. The storefront view
-- (public_listings) leaves sold items out on purpose; this one is only them,
-- with only what a grid card needs. Like public_listings, no vendor key of any
-- kind: the isolation test guards it.
CREATE OR REPLACE VIEW public.public_sold_listings AS
  SELECT l.id, l.sku, l.title, l.brand, l.price, l.sale_price, l.category, l.gender,
         l.size_type, l.condition, l.image_url, l.image_urls, l.updated_at AS sold_at
    FROM public.listings l
   WHERE l.status = 'approved' AND l.is_sold = true;

GRANT SELECT ON public.public_sold_listings TO anon, authenticated;
