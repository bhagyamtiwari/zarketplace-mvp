-- Measurements, and the numbers that tell us whether the patient lane works.
-- MODEL.md §8 and §6.
--
-- "It didn't fit" is the single largest return driver in used apparel, and tag
-- size does not settle it: a vintage L and a modern L are different garments.
-- So the listing carries the garment measured flat, in centimetres, and those
-- are numbers rather than a sentence in the description, because they have to
-- be filterable later.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS pit_to_pit_cm numeric,
  ADD COLUMN IF NOT EXISTS length_cm numeric,
  ADD COLUMN IF NOT EXISTS sleeve_cm numeric,
  ADD COLUMN IF NOT EXISTS waist_cm numeric,
  ADD COLUMN IF NOT EXISTS inseam_cm numeric;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_measurements_sane;
ALTER TABLE public.listings ADD CONSTRAINT listings_measurements_sane CHECK (
  (pit_to_pit_cm IS NULL OR (pit_to_pit_cm > 0 AND pit_to_pit_cm < 200)) AND
  (length_cm     IS NULL OR (length_cm     > 0 AND length_cm     < 250)) AND
  (sleeve_cm     IS NULL OR (sleeve_cm     > 0 AND sleeve_cm     < 150)) AND
  (waist_cm      IS NULL OR (waist_cm      > 0 AND waist_cm      < 200)) AND
  (inseam_cm     IS NULL OR (inseam_cm     > 0 AND inseam_cm     < 150))
);

-- Required where they matter most, which is where fit is least predictable.
-- Bottoms take waist and inseam instead; accessories and shoes take neither.
CREATE OR REPLACE FUNCTION public.require_measurements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     -- Pinned to the moment the rule came into force. Written as a local date
     -- first, which put it in the future in UTC, so the guard never fired.
     -- Still a cutoff rather than applying to everything: listings that predate
     -- this were created when nothing asked for a measurement, and holding them
     -- to it would make them unapprovable over a field nobody was shown.
     AND NEW.created_at >= TIMESTAMPTZ '2026-09-12 23:30:00+00' THEN
    IF NEW.category IN ('Tops','Outerwear') THEN
      IF NEW.pit_to_pit_cm IS NULL OR NEW.length_cm IS NULL THEN
        RAISE EXCEPTION 'A % needs at least pit-to-pit and length in centimetres before it can go live', NEW.category;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS listings_require_measurements ON public.listings;
CREATE TRIGGER listings_require_measurements
  BEFORE INSERT OR UPDATE OF status ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.require_measurements();

-- ---------------------------------------------------------------------------
-- Ship-fail rate per vendor. MODEL.md §6 calls this the single metric that
-- decides whether the patient lane works at scale, so it is a view rather than
-- a number somebody recalculates in a spreadsheet.
-- ---------------------------------------------------------------------------
-- Denominator is items that actually reached the point of needing to be sent:
-- an item that never sold cannot have failed to ship, and counting it would
-- flatter every vendor with slow stock.
CREATE OR REPLACE VIEW public.vendor_reliability AS
  SELECT
    a.vendor_id,
    count(*) FILTER (WHERE l.is_sold)                                    AS items_sold,
    count(*) FILTER (WHERE f.reason = 'NO_SHIP')                         AS no_ship,
    count(*) FILTER (WHERE f.reason = 'CONDITION_MISMATCH')              AS condition_mismatch,
    count(*) FILTER (WHERE f.reason = 'AUTHENTICITY_CONCERN')            AS authenticity,
    count(*) FILTER (WHERE f.reason IS NOT NULL)                         AS failures,
    CASE WHEN count(*) FILTER (WHERE l.is_sold) = 0 THEN NULL
         ELSE round(
           100.0 * count(*) FILTER (WHERE f.reason = 'NO_SHIP')
                 / count(*) FILTER (WHERE l.is_sold), 1)
    END                                                                   AS ship_fail_pct,
    count(*) FILTER (WHERE a.listing_expired_at IS NOT NULL
                       AND a.delisted_reason = 'no_response_to_possession_checks') AS silent_delistings,
    max(l.lifecycle_updated_at)                                           AS last_activity
  FROM public.acquisitions a
  JOIN public.listings l ON l.id = a.listing_id
  LEFT JOIN public.fulfillment_failures f ON f.listing_id = a.listing_id
  WHERE a.offer_status = 'accepted'
  GROUP BY a.vendor_id;

REVOKE ALL ON public.vendor_reliability FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Condition grade, recorded where it can be compared against the outcome.
-- ---------------------------------------------------------------------------
-- offer_log already copies the condition the vendor claimed. What was missing
-- is what we found when we opened the parcel, which is the half that makes the
-- pair useful: claimed vs actual, against days-to-sell and against returns.
ALTER TABLE public.offer_log
  ADD COLUMN IF NOT EXISTS condition_at_intake text,
  ADD COLUMN IF NOT EXISTS condition_matched boolean;

CREATE OR REPLACE FUNCTION public.log_condition_at_intake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.intake_status IS DISTINCT FROM OLD.intake_status
     AND NEW.intake_status IN ('accepted_into_inventory','not_accepted') THEN
    UPDATE public.offer_log o
       SET condition_at_intake = COALESCE(NEW.hub_notes, NEW.not_accepted_reason),
           condition_matched = (NEW.intake_status = 'accepted_into_inventory')
     WHERE o.listing_id = NEW.listing_id AND o.outcome = 'accepted';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acquisitions_log_condition ON public.acquisitions;
CREATE TRIGGER acquisitions_log_condition
  AFTER UPDATE OF intake_status ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.log_condition_at_intake();
