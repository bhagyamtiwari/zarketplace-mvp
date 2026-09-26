-- A demo listing needs no acquisition behind it.
--
-- require_accepted_acquisition() is the guard that keeps us a principal: we
-- may not list an item we have not agreed to buy, because listing someone
-- else's item on their behalf is the agency relationship MODEL.md §2 forbids.
--
-- A demo listing is not that. It is shop furniture: an item that does not
-- exist, cannot be bought, and has no vendor on the other side of it.
-- orders_refuse_demo() (20260920000001) already refuses any order against a
-- title ending in "(Demo)", at the database, regardless of what the site
-- does. So a demo listing going live can never produce a sale, and there is
-- no transaction for an acquisition to be the first half of.
--
-- The exemption uses the same regex as that trigger, so the two agree on what
-- a demo listing is. Everything else the guard does is untouched: a real
-- listing still cannot go live until its offer has been accepted.
CREATE OR REPLACE FUNCTION public.require_accepted_acquisition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at < TIMESTAMPTZ '2026-08-31 00:00:00+00' THEN
    RETURN NEW;
  END IF;
  -- Never orderable, so never an acquisition. Same pattern as
  -- orders_refuse_demo().
  IF NEW.title ~* '\(demo\)\s*$' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.acquisitions a
       WHERE a.listing_id = NEW.id AND a.offer_status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'This listing cannot go live until its acquisition amount has been accepted';
    END IF;
  END IF;
  RETURN NEW;
END $$;
