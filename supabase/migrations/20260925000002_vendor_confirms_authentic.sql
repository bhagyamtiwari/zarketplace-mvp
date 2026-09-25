-- The sell form now asks the vendor "Confirmed authentic?", Yes or No, and
-- keeps the answer here. Null: the item was sent before the question existed.
--
-- Whether the listing page says "Authenticity: Confirmed" is our claim, made
-- in our own name, so authenticity_confirmed is set by an operator in the
-- admin portal and by no one else. Until now the sell form set it from the
-- vendor's own accuracy tick, so every item went live saying "Confirmed".
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS vendor_confirms_authentic boolean;

-- A vendor's insert always starts authenticity_confirmed off, and a vendor's
-- update leaves it as it was. Pinned rather than refused, so a client that
-- still sends the old value keeps working.
CREATE OR REPLACE FUNCTION public.guard_authenticity_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin()
     OR COALESCE(current_setting('zarketplace.internal', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.authenticity_confirmed := false;
  ELSE
    NEW.authenticity_confirmed := OLD.authenticity_confirmed;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.guard_authenticity_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS listings_guard_authenticity ON public.listings;
CREATE TRIGGER listings_guard_authenticity
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_authenticity_flag();
