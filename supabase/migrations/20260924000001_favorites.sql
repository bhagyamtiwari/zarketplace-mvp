-- Favorites, kept on the account so they follow someone from their phone to
-- their laptop. A signed-out visitor still hearts things on the device alone
-- (src/lib/favorites.ts); signing in merges those into the account.
--
-- The same shape as cart_items: one row per person per item, owner-only.

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Read and remove your own. Add only an item that is on sale right now:
-- my_favorites() below is how a favorite's name and photo reach its owner
-- after the item has sold, so adding one must never become a way to read an
-- item that was not public when it was hearted. No UPDATE: a favorite is
-- there or it is not.
DROP POLICY IF EXISTS favorites_select_own ON public.favorites;
CREATE POLICY favorites_select_own ON public.favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS favorites_insert_own_on_sale ON public.favorites;
CREATE POLICY favorites_insert_own_on_sale ON public.favorites
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.public_listings pl WHERE pl.id = listing_id)
  );

DROP POLICY IF EXISTS favorites_delete_own ON public.favorites;
CREATE POLICY favorites_delete_own ON public.favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.favorites FROM anon;
REVOKE ALL ON public.favorites FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;

-- Your favorites with what a card needs, including the ones that have since
-- sold or come off the site: public_listings only holds what is on sale, so
-- without this a favorite would vanish the moment it sold. Only the columns
-- the storefront already showed for the item; nothing about who sold it to
-- us, and only ever the caller's own rows.
CREATE OR REPLACE FUNCTION public.my_favorites()
RETURNS TABLE (
  listing_id uuid,
  sku text,
  title text,
  brand text,
  image_url text,
  price numeric,
  sale_price numeric,
  size text,
  available boolean,
  sold boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.listing_id,
    l.sku,
    l.title,
    l.brand,
    l.image_url,
    l.price,
    l.sale_price,
    COALESCE(NULLIF(l.size_type, ''), l.size) AS size,
    (l.status = 'approved' AND NOT COALESCE(l.is_sold, false)) AS available,
    COALESCE(l.is_sold, false) AS sold,
    f.created_at
  FROM public.favorites f
  JOIN public.listings l ON l.id = f.listing_id
  WHERE f.user_id = auth.uid()
  ORDER BY f.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.my_favorites() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_favorites() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_favorites() TO authenticated;
