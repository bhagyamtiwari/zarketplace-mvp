-- Operator triage and vendor resubmission.
--
-- A submitted item now gets one of three answers, not two: an offer, a
-- decline, or a request for better photos or a better description. The last
-- one is the whole point of this migration - previously an item we could not
-- price yet had nowhere to go but 'declined', which threw away a vendor who
-- was one photograph away from being listed.
--
-- The offer amount an operator sends is typed by hand. The spread model still
-- runs and still produces a number, but as a reference for the operator rather
-- than as the answer: condition is a judgement made by looking at photographs,
-- and no formula sees those.

-- Two new states:
--   'changes_requested' - we have asked for better photos or details and are
--                         waiting on the vendor.
--   'offer_rejected'    - the vendor turned our number down. Not the same as
--                         'declined', which is us turning the item down, and
--                         only one of the two can be reworked and sent back.
ALTER TABLE public.listing_acquisitions DROP CONSTRAINT IF EXISTS listing_acquisitions_offer_status_check;
ALTER TABLE public.listing_acquisitions ADD CONSTRAINT listing_acquisitions_offer_status_check
  CHECK (offer_status IN ('pending_pricing','offered','accepted','declined','offer_rejected','changes_requested','expired'));

ALTER TABLE public.listing_acquisitions
  -- Written to be read by the vendor: what we want improved, or why we are
  -- not taking the item. Never put anything about the resale price in here.
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  -- Bumped each time a vendor resubmits, so a repeatedly reworked item is
  -- visible as one.
  ADD COLUMN IF NOT EXISTS offer_round int NOT NULL DEFAULT 1,
  -- True when the operator typed an amount that differs from the model's.
  ADD COLUMN IF NOT EXISTS offer_manually_set boolean NOT NULL DEFAULT false,
  -- What the spread model would have offered, kept for comparison.
  ADD COLUMN IF NOT EXISTS model_offer_amount numeric;

-- The freeze rule, restated now that an item can go round more than once.
--
--   * An accepted acquisition is immutable, full stop. That is the promise.
--   * An open offer cannot be quietly repriced underneath a vendor.
--   * A rejected or reworked item going back for pricing DOES clear its
--     amount - a fresh look produces a fresh number, and that is the point of
--     resubmitting.
CREATE OR REPLACE FUNCTION public.freeze_acquisition_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF OLD.offer_status = 'accepted' THEN
    IF NEW.offer_amount IS DISTINCT FROM OLD.offer_amount THEN
      RAISE EXCEPTION 'An accepted acquisition amount cannot be changed';
    END IF;
    IF NEW.offer_status <> 'accepted' THEN
      RAISE EXCEPTION 'An accepted acquisition cannot be un-accepted';
    END IF;
  END IF;

  IF OLD.offer_status = 'offered' AND NEW.offer_status = 'offered'
     AND NEW.offer_amount IS DISTINCT FROM OLD.offer_amount THEN
    RAISE EXCEPTION 'An open offer cannot be repriced. Withdraw it first.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- ---------------------------------------------------------------------------
-- Operator: make an offer. The amount is typed in; the model is a reference.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.make_acquisition_offer(
  p_listing_id uuid,
  p_offer numeric,
  p_expected_resale numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cfg public.acquisition_config;
  model jsonb;
  model_amount numeric;
  st text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may make an offer';
  END IF;
  IF p_offer IS NULL OR p_offer <= 0 THEN
    RAISE EXCEPTION 'An offer has to be a positive rupee amount';
  END IF;

  SELECT offer_status INTO st FROM public.listing_acquisitions WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No acquisition record for that listing';
  END IF;
  IF st = 'accepted' THEN
    RAISE EXCEPTION 'This item has already been accepted at a locked amount';
  END IF;
  IF st = 'offered' THEN
    RAISE EXCEPTION 'There is already an open offer on this item';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;

  IF p_expected_resale IS NOT NULL THEN
    model := public.compute_acquisition_offer(p_expected_resale);
    model_amount := (model->>'offer_amount')::numeric;
  END IF;

  UPDATE public.listing_acquisitions
     SET expected_resale     = COALESCE(p_expected_resale, expected_resale),
         offer_amount        = floor(p_offer),
         model_offer_amount  = model_amount,
         offer_manually_set  = (model_amount IS NULL OR floor(p_offer) <> model_amount),
         offer_breakdown     = model,
         offer_status        = 'offered',
         offered_at          = now(),
         reviewed_at         = now(),
         review_note         = NULL,
         offer_expires_at    = now() + make_interval(days => cfg.offer_valid_days)
   WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('offer_amount', floor(p_offer), 'model_offer_amount', model_amount);
END $fn$;

-- ---------------------------------------------------------------------------
-- Operator: ask for better photos or a better description.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_listing_changes(p_listing_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE st text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may review an item';
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'Say what needs improving - the vendor reads this';
  END IF;

  SELECT offer_status INTO st FROM public.listing_acquisitions WHERE listing_id = p_listing_id;
  IF st = 'accepted' THEN RAISE EXCEPTION 'This item has already been accepted'; END IF;

  UPDATE public.listing_acquisitions
     SET offer_status = 'changes_requested',
         review_note  = btrim(p_note),
         reviewed_at  = now(),
         offer_amount = NULL,
         offer_expires_at = NULL
   WHERE listing_id = p_listing_id;
END $fn$;

-- ---------------------------------------------------------------------------
-- Operator: we are not taking this item.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_listing(p_listing_id uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE st text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may review an item';
  END IF;

  SELECT offer_status INTO st FROM public.listing_acquisitions WHERE listing_id = p_listing_id;
  IF st = 'accepted' THEN RAISE EXCEPTION 'This item has already been accepted'; END IF;

  UPDATE public.listing_acquisitions
     SET offer_status = 'declined',
         review_note  = NULLIF(btrim(COALESCE(p_note, '')), ''),
         reviewed_at  = now(),
         offer_amount = NULL,
         offer_expires_at = NULL
   WHERE listing_id = p_listing_id;
END $fn$;

-- ---------------------------------------------------------------------------
-- Vendor: send it back for another look, after improving it or after turning
-- an offer down.
--
-- An item we declined outright cannot be resubmitted: "no" means no, and
-- letting it loop would be a queue that never empties for either side.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resubmit_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE acq public.listing_acquisitions;
BEGIN
  SELECT * INTO acq FROM public.listing_acquisitions
   WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such item'; END IF;
  IF acq.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'That item is not yours'; END IF;

  IF acq.offer_status NOT IN ('changes_requested','offer_rejected','expired') THEN
    RAISE EXCEPTION 'There is nothing to resubmit on this item';
  END IF;

  UPDATE public.listing_acquisitions
     SET offer_status     = 'pending_pricing',
         offer_amount     = NULL,
         offer_breakdown  = NULL,
         model_offer_amount = NULL,
         offer_manually_set = false,
         expected_resale  = NULL,
         review_note      = NULL,
         offered_at       = NULL,
         offer_expires_at = NULL,
         offer_round      = acq.offer_round + 1
   WHERE listing_id = p_listing_id;
END $fn$;

REVOKE ALL ON FUNCTION public.resubmit_listing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resubmit_listing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_acquisition_offer(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.listing_acquisitions
     SET offer_status = 'offer_rejected',
         offer_amount = NULL,
         offer_expires_at = NULL
   WHERE listing_id = p_listing_id
     AND vendor_id = auth.uid()
     AND offer_status = 'offered';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no open offer on this item';
  END IF;
END $fn$;

-- The vendor's view gains the note and the round. Still no resale, still no
-- breakdown, still nothing about the buyer side.
CREATE OR REPLACE VIEW public.vendor_offers
WITH (security_invoker = false) AS
  SELECT
    a.listing_id,
    a.asking_price,
    a.offer_amount,
    a.offer_status,
    a.intake_status,
    a.review_note,
    a.reviewed_at,
    a.offer_round,
    a.not_accepted_reason,
    a.not_accepted_at,
    a.offered_at,
    a.offer_expires_at,
    a.accepted_at,
    a.paid_at
  FROM public.listing_acquisitions a
  WHERE a.vendor_id = auth.uid();

REVOKE ALL ON public.vendor_offers FROM anon;
GRANT SELECT ON public.vendor_offers TO authenticated;
