-- Demo listings fill the shop for previews and are marked by "(Demo)" at the
-- end of the title, so they can be found and removed before real sellers go
-- live. They must never take a real payment: the item does not exist. The
-- product page hides the buy buttons for them; this is the backstop.
CREATE OR REPLACE FUNCTION public.orders_refuse_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.listings
     WHERE id = NEW.listing_id AND title ~* '\(demo\)\s*$'
  ) THEN
    RAISE EXCEPTION 'This is a demo item and is not for sale.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.orders_refuse_demo() FROM PUBLIC;

DROP TRIGGER IF EXISTS orders_refuse_demo ON public.orders;
CREATE TRIGGER orders_refuse_demo
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_refuse_demo();
