-- Permissive UPDATE policy on listings (MVP). The frontend marks listings sold
-- after a buyer self-attests UPI payment. Tighten this post-MVP to scope by
-- seller_id OR a buyer-with-active-order check.
DROP POLICY IF EXISTS "listings_update_anon" ON public.listings;
CREATE POLICY "listings_update_anon" ON public.listings
  FOR UPDATE TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

GRANT UPDATE ON public.listings TO anon, authenticated;
