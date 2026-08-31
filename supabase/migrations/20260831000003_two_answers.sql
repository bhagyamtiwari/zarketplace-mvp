-- Two answers, not three.
--
-- 'changes_requested' and 'declined' were doing the same job from the vendor's
-- side: we are not making an offer right now, and here is why. Splitting them
-- meant an operator had to decide up front whether a problem was fixable, and
-- a decline was final - so getting that judgement wrong cost us an item the
-- vendor could easily have improved.
--
-- Now there is an offer, or a rejection. Every rejection can be reworked and
-- sent back. The reasons live on the rejection rather than in the choice of
-- verb, which is where they were always more useful.

-- Anything mid-flight under the old split becomes a plain rejection.
UPDATE public.listing_acquisitions
   SET offer_status = 'declined'
 WHERE offer_status = 'changes_requested';

ALTER TABLE public.listing_acquisitions DROP CONSTRAINT IF EXISTS listing_acquisitions_offer_status_check;
ALTER TABLE public.listing_acquisitions ADD CONSTRAINT listing_acquisitions_offer_status_check
  CHECK (offer_status IN ('pending_pricing','offered','accepted','declined','offer_rejected','expired'));

-- The canned reasons an operator ticked. Free text stays in review_note and is
-- now the exception rather than the default: a note typed in a hurry is where
-- a resale figure or a negotiating phrase would end up, and neither belongs in
-- front of a vendor.
ALTER TABLE public.listing_acquisitions
  ADD COLUMN IF NOT EXISTS review_reasons text[];

DROP FUNCTION IF EXISTS public.request_listing_changes(uuid, text);

-- Reject an item, with optional reasons and an optional note. Never final:
-- the vendor can fix what we named and send it straight back.
CREATE OR REPLACE FUNCTION public.reject_listing(
  p_listing_id uuid,
  p_reasons text[] DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE st text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may review an item';
  END IF;

  SELECT offer_status INTO st FROM public.listing_acquisitions WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No acquisition record for that listing'; END IF;
  IF st = 'accepted' THEN RAISE EXCEPTION 'This item has already been accepted'; END IF;

  UPDATE public.listing_acquisitions
     SET offer_status     = 'declined',
         review_reasons   = NULLIF(p_reasons, '{}'),
         review_note      = NULLIF(btrim(COALESCE(p_note, '')), ''),
         reviewed_at      = now(),
         offer_amount     = NULL,
         offer_expires_at = NULL
   WHERE listing_id = p_listing_id;
END $fn$;

DROP FUNCTION IF EXISTS public.decline_listing(uuid, text);

-- A rejection is now something a vendor can answer, so it joins the states
-- that can be resubmitted.
CREATE OR REPLACE FUNCTION public.resubmit_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE acq public.listing_acquisitions;
BEGIN
  SELECT * INTO acq FROM public.listing_acquisitions
   WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such item'; END IF;
  IF acq.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'That item is not yours'; END IF;

  IF acq.offer_status NOT IN ('declined','offer_rejected','expired') THEN
    RAISE EXCEPTION 'There is nothing to resubmit on this item';
  END IF;

  UPDATE public.listing_acquisitions
     SET offer_status       = 'pending_pricing',
         offer_amount       = NULL,
         offer_breakdown    = NULL,
         model_offer_amount = NULL,
         offer_manually_set = false,
         expected_resale    = NULL,
         review_note        = NULL,
         review_reasons     = NULL,
         offered_at         = NULL,
         offer_expires_at   = NULL,
         offer_round        = acq.offer_round + 1
   WHERE listing_id = p_listing_id;
END $fn$;

REVOKE ALL ON FUNCTION public.resubmit_listing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resubmit_listing(uuid) TO authenticated;

-- The vendor sees the reasons alongside the note. Still no resale figure, no
-- model number and no part of the spread.
CREATE OR REPLACE VIEW public.vendor_offers
WITH (security_invoker = false) AS
  SELECT
    a.listing_id, a.asking_price, a.offer_amount, a.offer_status, a.intake_status,
    a.review_note, a.review_reasons, a.reviewed_at, a.offer_round,
    a.not_accepted_reason, a.not_accepted_at,
    a.offered_at, a.offer_expires_at, a.accepted_at, a.paid_at
  FROM public.listing_acquisitions a
  WHERE a.vendor_id = auth.uid();

REVOKE ALL ON public.vendor_offers FROM anon;
GRANT SELECT ON public.vendor_offers TO authenticated;

-- ---------------------------------------------------------------------------
-- Queue age. Without it we have no way of knowing we are breaking the 24-hour
-- promise until a vendor tells us.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.acquisition_queue AS
  SELECT
    a.listing_id,
    l.title,
    l.seller_email AS vendor_email,
    a.asking_price,
    a.offer_round,
    a.created_at AS submitted_at,
    -- Waiting since the last thing that put it back in our court.
    GREATEST(a.created_at, COALESCE(a.updated_at, a.created_at)) AS waiting_since,
    round(EXTRACT(EPOCH FROM (now() - GREATEST(a.created_at, COALESCE(a.updated_at, a.created_at)))) / 3600.0, 1) AS hours_waiting,
    (now() - GREATEST(a.created_at, COALESCE(a.updated_at, a.created_at))) > interval '24 hours' AS overdue
  FROM public.listing_acquisitions a
  JOIN public.listings l ON l.id = a.listing_id
 WHERE a.offer_status = 'pending_pricing';

REVOKE ALL ON public.acquisition_queue FROM anon, authenticated;
