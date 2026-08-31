-- protect_vendor_standing stops a vendor editing their own trust score. It was
-- also reverting the system's own updates: record_fulfillment_failure runs
-- SECURITY DEFINER, but is_admin() reads auth.uid(), which is the vendor - or
-- nobody, on a scheduled sweep. Every trust penalty was silently undone and
-- the automatic restriction could never fire.
--
-- The guard now recognises an internal caller through a transaction-local flag
-- that only our own SECURITY DEFINER functions set. set_config(..., true)
-- scopes it to the transaction, so it cannot be left switched on.
CREATE OR REPLACE FUNCTION public.protect_vendor_standing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin()
     AND coalesce(current_setting('zarketplace.internal', true), '') <> 'on' THEN
    NEW.trust_score        := OLD.trust_score;
    NEW.listing_restricted := OLD.listing_restricted;
    NEW.restricted_at      := OLD.restricted_at;
    NEW.restricted_reason  := OLD.restricted_reason;
    NEW.banned             := OLD.banned;
    NEW.banned_at          := OLD.banned_at;
    NEW.banned_reason      := OLD.banned_reason;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- record_fulfillment_failure sets the flag around its trust update. The rest
-- of the function is unchanged from 20260831000005.
