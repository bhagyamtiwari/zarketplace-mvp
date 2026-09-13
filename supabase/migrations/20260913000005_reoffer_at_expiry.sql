-- Re-offer at expiry. MODEL.md §5.
--
-- An item that ran its 45 days and did not sell is not a failure and not
-- inventory: nothing was supplied and nothing is owed. The model's answer is
-- one button, offering to relist it lower for a shorter window at a new payout,
-- which gives us a markdown mechanism while holding no stock and generates
-- price-elasticity data per category as a side effect.
--
-- Explicitly NOT auto-purchase. Buying what the market just declined, at our
-- own estimate, is adverse selection by design.

ALTER TABLE public.acquisition_config
  -- Shorter than the first run. A piece that did not move in 45 days at the
  -- higher price is not going to need another 45 at the lower one to tell us
  -- something, and a shorter window gets the answer back sooner.
  ADD COLUMN IF NOT EXISTS reoffer_window_days int NOT NULL DEFAULT 30,
  -- Then it expires for good. A third and fourth markdown is just discovering
  -- that nobody wants it.
  ADD COLUMN IF NOT EXISTS max_reoffers int NOT NULL DEFAULT 2;

ALTER TABLE public.acquisitions
  ADD COLUMN IF NOT EXISTS reoffer_count int NOT NULL DEFAULT 0;

-- An item can be listed again after it lapsed. Nothing else changes about the
-- state machine: EXPIRED stays terminal for everything except this.
CREATE OR REPLACE FUNCTION public.lifecycle_can_move(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_to = 'FAILED' THEN p_from <> 'DELIVERED'
    WHEN p_to = 'EXPIRED' THEN p_from = 'LISTED'
    -- A re-offer accepted on a lapsed listing puts it back on the site.
    WHEN p_from = 'EXPIRED'            THEN p_to = 'LISTED'
    WHEN p_from = 'SUBMITTED'          THEN p_to = 'LISTED'
    WHEN p_from = 'LISTED'             THEN p_to = 'SOLD'
    WHEN p_from = 'SOLD'               THEN p_to = 'LABEL_ISSUED'
    WHEN p_from = 'LABEL_ISSUED'       THEN p_to = 'PICKED_UP'
    WHEN p_from = 'PICKED_UP'          THEN p_to = 'IN_TRANSIT_INBOUND'
    WHEN p_from = 'IN_TRANSIT_INBOUND' THEN p_to = 'RECEIVED_AT_HUB'
    WHEN p_from = 'RECEIVED_AT_HUB'    THEN p_to = 'ACCEPTED'
    WHEN p_from = 'ACCEPTED'           THEN p_to = 'PAYOUT_SENT'
    WHEN p_from = 'PAYOUT_SENT'        THEN p_to = 'REPACKED'
    WHEN p_from = 'REPACKED'           THEN p_to = 'SHIPPED_OUTBOUND'
    WHEN p_from = 'SHIPPED_OUTBOUND'   THEN p_to = 'DELIVERED'
    ELSE false
  END;
$fn$;

-- ---------------------------------------------------------------------------
-- The one narrow hole in the freeze rule.
-- ---------------------------------------------------------------------------
-- "An accepted amount never moves" is the promise the whole schema exists to
-- keep, and it is unchanged for any offer that still stands. What changes is
-- that an agreement discharged by expiry is no longer standing: the listing
-- came down, nothing was supplied, nobody owes anybody. A new offer on that
-- item is a new agreement, not a revision of the old one, and the old one keeps
-- its own row in offer_log and its own signed agreement.
--
-- The hole is exactly this shape: accepted -> offered, and only on a row whose
-- listing has already expired.
CREATE OR REPLACE FUNCTION public.freeze_acquisition_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF OLD.offer_status = 'accepted' THEN
    IF OLD.listing_expired_at IS NOT NULL AND NEW.offer_status = 'offered' THEN
      -- A re-offer. The amount is expected to change; that is the point.
      NULL;
    ELSE
      IF NEW.offer_amount IS DISTINCT FROM OLD.offer_amount THEN
        RAISE EXCEPTION 'An accepted acquisition amount cannot be changed';
      END IF;
      IF NEW.offer_status <> 'accepted' THEN
        RAISE EXCEPTION 'An accepted acquisition cannot be un-accepted';
      END IF;
    END IF;
  END IF;

  IF OLD.offer_status = 'offered' AND NEW.offer_status = 'offered'
     AND NEW.offer_amount IS DISTINCT FROM OLD.offer_amount THEN
    RAISE EXCEPTION 'An open offer cannot be repriced. Withdraw it first.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- A vendor signs once per round, so the agreement is keyed by round rather than
-- by listing. Without this a re-offer could not be accepted at all.
ALTER TABLE public.listing_agreements ADD COLUMN IF NOT EXISTS offer_round int NOT NULL DEFAULT 1;
ALTER TABLE public.listing_agreements DROP CONSTRAINT IF EXISTS listing_agreements_listing_id_key;
DROP INDEX IF EXISTS listing_agreements_listing_round_key;
CREATE UNIQUE INDEX listing_agreements_listing_round_key
  ON public.listing_agreements (listing_id, offer_round);

-- ---------------------------------------------------------------------------
-- Operator action: offer to relist it lower.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.make_reoffer(p_listing_id uuid, p_resale numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  acq public.acquisitions; cfg public.acquisition_config; result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may re-offer';
  END IF;

  SELECT * INTO acq FROM public.acquisitions WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No acquisition for that listing'; END IF;

  IF acq.listing_expired_at IS NULL THEN
    RAISE EXCEPTION 'That listing has not expired, so there is nothing to re-offer';
  END IF;
  -- Only an item that simply did not sell. A vendor who told us it was gone, or
  -- who stopped answering, is not someone to send a fresh offer to.
  IF acq.delisted_reason IS DISTINCT FROM 'listing_window_elapsed' THEN
    RAISE EXCEPTION 'That listing came down for another reason and cannot be re-offered';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  IF acq.reoffer_count >= cfg.max_reoffers THEN
    RAISE EXCEPTION 'This item has already been re-offered % times', acq.reoffer_count;
  END IF;

  result := public.compute_acquisition_offer(p_resale);
  IF NOT (result->>'viable')::boolean THEN
    RETURN result;  -- not worth relisting; the caller sees why
  END IF;

  UPDATE public.acquisitions
     SET offer_status       = 'offered',
         expected_resale    = p_resale,
         offer_amount       = (result->>'offer_amount')::numeric,
         offer_breakdown    = result,
         offered_at         = now(),
         offer_expires_at   = now() + make_interval(days => cfg.offer_valid_days),
         reoffer_count      = acq.reoffer_count + 1,
         offer_round        = acq.offer_round + 1,
         -- Cleared so acceptance starts a fresh window rather than resuming a
         -- dead one.
         listing_expired_at = NULL,
         delisted_reason    = NULL,
         accepted_at        = NULL,
         possession_nonresponses = 0
   WHERE listing_id = p_listing_id;

  PERFORM public.enqueue_vendor_notification(p_listing_id, 'reoffer_made', '{}'::jsonb);

  RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.make_reoffer(uuid, numeric) FROM anon, authenticated;

-- Acceptance has to handle a relist as well as a first listing, and a re-offer
-- runs on the shorter window.
--
-- Two triggers rather than one. Setting the window is a change to the row being
-- written, so it has to happen BEFORE. Moving the listing reads the acquisition
-- back through require_accepted_acquisition, which in a BEFORE trigger still
-- sees the old status - so relisting a lapsed item was refused for not having
-- been accepted, while in the middle of being accepted. That half runs AFTER.
CREATE OR REPLACE FUNCTION public.list_on_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d int; cfg public.acquisition_config;
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
    d := CASE WHEN NEW.reoffer_count > 0
                THEN COALESCE(cfg.reoffer_window_days, 30)
                ELSE COALESCE(cfg.listing_window_days, 45) END;
    NEW.listing_expires_at := now() + make_interval(days => d);
    NEW.possession_confirmed_at := now();
    NEW.possession_nonresponses := 0;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.list_after_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET lifecycle_state = 'LISTED',
           lifecycle_updated_at = now(),
           -- A relist comes back from archived. A first listing stays pending
           -- until an operator approves it, which is unchanged.
           status = CASE WHEN status = 'archived' THEN 'approved' ELSE status END
     WHERE id = NEW.listing_id AND lifecycle_state IN ('SUBMITTED','EXPIRED');
    PERFORM set_config('zarketplace.internal', 'off', true);
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS acquisitions_list_after_acceptance ON public.acquisitions;
CREATE TRIGGER acquisitions_list_after_acceptance
  AFTER UPDATE OF offer_status ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.list_after_acceptance();

-- The agreement records which round it covers.
CREATE OR REPLACE FUNCTION public.accept_acquisition_offer(
  p_listing_id uuid,
  p_terms_version text,
  p_terms_text jsonb,
  p_user_agent text DEFAULT NULL,
  p_pickup_address text DEFAULT NULL,
  p_pickup_pincode text DEFAULT NULL,
  p_pickup_state text DEFAULT NULL,
  p_pickup_state_code text DEFAULT NULL,
  p_pickup_city text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  acq public.acquisitions; existing jsonb;
  v_addr text; v_pin text; v_state text; v_code text; v_city text;
BEGIN
  SELECT * INTO acq FROM public.acquisitions WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No offer for that listing'; END IF;
  IF acq.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'That offer is not yours to accept'; END IF;
  IF acq.offer_status = 'accepted' THEN RAISE EXCEPTION 'You have already accepted this offer'; END IF;
  IF acq.offer_status <> 'offered' THEN RAISE EXCEPTION 'There is no open offer on this item'; END IF;
  IF acq.offer_expires_at IS NOT NULL AND acq.offer_expires_at < now() THEN
    UPDATE public.acquisitions SET offer_status = 'expired' WHERE listing_id = p_listing_id;
    RAISE EXCEPTION 'This offer has expired. Contact us and we will look at it again.';
  END IF;

  SELECT pickup_address INTO existing FROM public.listings WHERE id = p_listing_id;
  v_addr  := COALESCE(NULLIF(btrim(COALESCE(p_pickup_address, '')), ''), existing->>'address');
  v_pin   := COALESCE(NULLIF(btrim(COALESCE(p_pickup_pincode, '')), ''), existing->>'pincode');
  v_city  := COALESCE(NULLIF(btrim(COALESCE(p_pickup_city, '')), ''), existing->>'city');
  v_state := COALESCE(NULLIF(btrim(COALESCE(p_pickup_state, '')), ''), existing->>'state');
  v_code  := NULLIF(btrim(COALESCE(p_pickup_state_code, '')), '');

  IF v_addr IS NULL OR v_city IS NULL OR v_state IS NULL
     OR v_pin IS NULL OR v_pin !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'We need the address, city, state and pincode the courier should collect from.';
  END IF;

  PERFORM set_config('zarketplace.internal', 'on', true);
  UPDATE public.listings
     SET pickup_address = COALESCE(existing, '{}'::jsonb) || jsonb_build_object(
           'address', v_addr, 'city', v_city, 'pincode', v_pin, 'state', v_state,
           'fullName', COALESCE(existing->>'fullName', ''),
           'phone', COALESCE(existing->>'phone', '')),
         pickup_pincode = v_pin,
         pickup_state = COALESCE(v_state, pickup_state),
         pickup_state_code = COALESCE(v_code, pickup_state_code)
   WHERE id = p_listing_id;
  PERFORM set_config('zarketplace.internal', 'off', true);

  INSERT INTO public.listing_agreements (
    listing_id, vendor_id, offer_amount, offer_round,
    ack_genuine_and_accurate, ack_return_shipping_payable, ack_sixty_day_forfeit,
    terms_version, terms_text, user_agent
  ) VALUES (
    p_listing_id, auth.uid(), acq.offer_amount, COALESCE(acq.offer_round, 1), true, true, true,
    p_terms_version, p_terms_text, p_user_agent
  );

  UPDATE public.acquisitions
     SET offer_status = 'accepted', accepted_at = now()
   WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('offer_amount', acq.offer_amount, 'accepted_at', now());
END $fn$;

ALTER TABLE public.vendor_notifications DROP CONSTRAINT IF EXISTS vendor_notifications_kind_check;
ALTER TABLE public.vendor_notifications ADD CONSTRAINT vendor_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'item_submitted','offer_made','offer_rejected','item_sold','label_issued',
    'ship_by_reminder','received_at_hub','accepted','payout_sent','refused',
    'abandonment_30','abandonment_7','vendor_cancelled',
    'possession_check','listing_expired','delisted_no_response','reoffer_made'
  ]));

DROP VIEW IF EXISTS public.vendor_offers;
CREATE VIEW public.vendor_offers WITH (security_invoker = false) AS
  SELECT
    a.listing_id, a.asking_price, a.offer_amount, a.offer_status, a.intake_status,
    a.review_note, a.review_reasons, a.reviewed_at, a.offer_round,
    a.not_accepted_reason, a.not_accepted_at, a.offered_at, a.offer_expires_at,
    a.accepted_at, a.paid_at, a.ship_by_deadline, a.lane,
    a.listing_expires_at, a.listing_expired_at, a.delisted_reason,
    a.possession_confirmed_at, a.reoffer_count
  FROM public.acquisitions a
  WHERE a.vendor_id = auth.uid();

REVOKE ALL ON public.vendor_offers FROM anon;
GRANT SELECT ON public.vendor_offers TO authenticated;
