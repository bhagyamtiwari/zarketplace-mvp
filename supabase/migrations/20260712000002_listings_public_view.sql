-- Finding 2 (High): seller PII world-readable via the listings API.
--
-- public.listings carries sensitive seller columns (seller_email,
-- seller_upi_vpa, pickup_address) alongside the buyer-facing catalogue data.
-- RLS filters rows, not columns, and the old listings_public_select policy let
-- anon read the whole approved-unsold row, so anyone with the anon key could
-- harvest every active seller's UPI VPA, email, and home pickup address.
--
-- Fix is a split:
--   1. A definer (NOT security_invoker) view public.public_listings that exposes
--      ONLY the buyer-safe columns for approved, unsold listings. Because it is a
--      definer view it bypasses base-table RLS; its own WHERE clause is therefore
--      the public row filter, and it matches exactly what anon could see before.
--   2. Tighten the base-table SELECT policy to owner/admin only. Anon and
--      non-owner authenticated lose all direct base-table read and must go
--      through the view (which never selects the sensitive columns). Owners and
--      admins keep full-row access to the base table for their own / all rows.
--
-- INSERT/UPDATE/DELETE policies are unchanged. seller_instagram stays public by
-- product intent (it is a public handle). Legacy shipping_mode / shipping_cost
-- are excluded from the view: nothing in the frontend reads them.

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
  updated_at
FROM public.listings
WHERE status = 'approved' AND is_sold = false;

GRANT SELECT ON public.public_listings TO anon, authenticated;

-- Tighten the base table: only the owner or an admin can read it directly. The
-- public catalogue is served exclusively from public_listings above.
DROP POLICY IF EXISTS listings_public_select ON public.listings;

CREATE POLICY listings_public_select ON public.listings
  FOR SELECT
  USING (seller_id = auth.uid() OR public.is_admin());
