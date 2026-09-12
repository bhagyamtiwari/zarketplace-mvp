-- Back to the patient lane, and this time it is the model rather than an
-- assumption. See MODEL.md §3.
--
-- Yesterday's migration (20260912000001_buy_to_hub) moved the item to us the
-- moment a vendor accepted, and refused to let a listing go live until it had
-- been checked in at the hub. MODEL.md calls that the INSTANT lane and defers
-- it explicitly. The patient lane is the opposite and is the only one we build:
--
--   vendor accepts  ->  listing goes live at OUR price  ->  THE VENDOR KEEPS
--   THE ITEM  ->  a buyer buys it  ->  we send a prepaid label and book a
--   doorstep pickup  ->  it reaches us  ->  we check it  ->  we pay
--
-- We hold no inventory and carry no stock risk. The vendor's only obligation
-- between acceptance and a sale is to still have the item and be reachable.
--
-- Not reverted, because MODEL.md wants them: the vendor names no price, the
-- offer amount stays out of email, and submitting an item is acknowledged.

-- ---------------------------------------------------------------------------
-- Lifecycle, back in the order the goods actually move.
-- ---------------------------------------------------------------------------
-- ACQUIRED goes: it meant "ours, on its way to us, before anyone bought it",
-- which is the instant lane and cannot occur here. SUBMITTED stays - it is
-- genuinely useful, and it is where every item now starts.
--
-- LISTED returns to being early rather than late. An item is listed while it
-- sits in the vendor's wardrobe, which is the whole point of the lane.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_lifecycle_state_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_lifecycle_state_check CHECK (
  lifecycle_state IN (
    'SUBMITTED','LISTED','SOLD','LABEL_ISSUED','PICKED_UP','IN_TRANSIT_INBOUND',
    'RECEIVED_AT_HUB','ACCEPTED','PAYOUT_SENT','REPACKED','SHIPPED_OUTBOUND',
    'DELIVERED','FAILED'
  )
);

CREATE OR REPLACE FUNCTION public.lifecycle_can_move(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_to = 'FAILED' THEN p_from <> 'DELIVERED'
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
-- The lane, in MODEL.md's sense of the word.
-- ---------------------------------------------------------------------------
-- Present from today so the instant lane never needs a migration, and never
-- used by anything: every row is 'patient' and no surface offers a choice.
ALTER TABLE public.acquisitions
  ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'patient';
ALTER TABLE public.acquisitions DROP CONSTRAINT IF EXISTS acquisitions_lane_check;
ALTER TABLE public.acquisitions ADD CONSTRAINT acquisitions_lane_check
  CHECK (lane IN ('patient','instant'));

COMMENT ON COLUMN public.acquisitions.lane IS
  'MODEL.md fulfilment lane. patient: the vendor keeps the item until it sells. instant: deferred, do not build.';

-- Both views are SELECT * over this table, so they hold a frozen column list
-- that still contains vendor_pays_inbound. They have to go before the column
-- can be dropped, and they are rebuilt at the end of this file.
DROP VIEW IF EXISTS public.listing_acquisitions;
DROP VIEW IF EXISTS public.vendor_offers;

-- The shipping-method column had to lose the word "lane" before it collided
-- with the one above. It is also no longer a question anyone is asked:
-- MODEL.md §6 is prepaid labels only, because the tracking is worth more than
-- the postage it saves.
DO $$
BEGIN
  ALTER TABLE public.acquisitions ADD COLUMN IF NOT EXISTS shipping_method text;
  UPDATE public.acquisitions SET shipping_method = 'prepaid_label' WHERE shipping_method IS NULL;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='acquisitions'
                AND column_name='vendor_pays_inbound') THEN
    ALTER TABLE public.acquisitions DROP COLUMN vendor_pays_inbound;
  END IF;
END $$;

ALTER TABLE public.acquisitions ALTER COLUMN shipping_method SET DEFAULT 'prepaid_label';
ALTER TABLE public.acquisitions ALTER COLUMN shipping_method SET NOT NULL;
ALTER TABLE public.acquisitions DROP CONSTRAINT IF EXISTS acquisitions_shipping_method_check;
ALTER TABLE public.acquisitions ADD CONSTRAINT acquisitions_shipping_method_check
  CHECK (shipping_method IN ('prepaid_label'));

COMMENT ON COLUMN public.acquisitions.shipping_method IS
  'How the item travels to us once sold. One value on purpose: MODEL.md §6 forbids offering a vendor a choice.';

-- ---------------------------------------------------------------------------
-- The offer model stops asking who pays for the inbound leg.
-- ---------------------------------------------------------------------------
-- We always do, so it is always a cost we carry. (The amounts themselves are
-- still yesterday's; MODEL.md §4's formula lands in the next pass.)
DROP FUNCTION IF EXISTS public.compute_acquisition_offer(numeric, boolean);

CREATE OR REPLACE FUNCTION public.compute_acquisition_offer(resale numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cfg public.acquisition_config;
  tier public.acquisition_margin_tiers;
  inbound numeric; outbound numeric; processing numeric; reserve numeric;
  margin numeric; offer numeric;
BEGIN
  IF resale IS NULL OR resale <= 0 THEN
    RAISE EXCEPTION 'Expected resale must be a positive amount';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition_config is missing';
  END IF;

  SELECT * INTO tier FROM public.acquisition_margin_tiers t
   WHERE resale >= t.min_value AND (t.max_value IS NULL OR resale < t.max_value)
   ORDER BY t.sort_order LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No margin tier covers a resale of %', resale;
  END IF;

  inbound    := cfg.inbound_shipping;
  outbound   := cfg.outbound_shipping;
  processing := cfg.payment_processing_flat + (cfg.payment_processing_factor * resale);
  reserve    := cfg.rto_damage_reserve_flat + (cfg.rto_damage_reserve_factor * resale);
  margin     := tier.margin_flat + (tier.margin_factor * resale);

  offer := floor(resale - inbound - outbound - processing - reserve - margin);

  RETURN jsonb_build_object(
    'offer_amount',      GREATEST(offer, 0),
    'viable',            offer >= cfg.min_offer,
    'expected_resale',   resale,
    'inbound_shipping',  round(inbound),
    'outbound_shipping', round(outbound),
    'payment_processing', round(processing),
    'rto_damage_reserve', round(reserve),
    'target_margin',     round(margin),
    'margin_tier',       tier.label,
    'min_offer',         cfg.min_offer,
    'computed_at',       now()
  );
END $fn$;

REVOKE ALL ON FUNCTION public.compute_acquisition_offer(numeric) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_expected_resale(p_listing_id uuid, p_resale numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  result jsonb; cfg public.acquisition_config; current_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may price a listing';
  END IF;

  SELECT offer_status INTO current_status FROM public.acquisitions WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No acquisition record for that listing';
  END IF;
  IF current_status <> 'pending_pricing' THEN
    RAISE EXCEPTION 'This listing has already been offered at a locked amount';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  result := public.compute_acquisition_offer(p_resale);

  IF NOT (result->>'viable')::boolean THEN
    UPDATE public.acquisitions
       SET expected_resale = p_resale, offer_breakdown = result, offer_status = 'declined'
     WHERE listing_id = p_listing_id;
    RETURN result;
  END IF;

  UPDATE public.acquisitions
     SET expected_resale  = p_resale,
         offer_amount     = (result->>'offer_amount')::numeric,
         offer_breakdown  = result,
         offer_status     = 'offered',
         offered_at       = now(),
         offer_expires_at = now() + make_interval(days => cfg.offer_valid_days)
   WHERE listing_id = p_listing_id;

  RETURN result;
END $fn$;

-- ---------------------------------------------------------------------------
-- Acceptance lists the item. It does not summon it.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS acquisitions_start_intake ON public.acquisitions;
DROP FUNCTION IF EXISTS public.start_intake_on_acceptance();

CREATE OR REPLACE FUNCTION public.list_on_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    -- No ship-by deadline and no intake status: nothing is expected to move
    -- until somebody buys it. Both are set by start_ship_by_clock, on sale.
    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET lifecycle_state = 'LISTED', lifecycle_updated_at = now()
     WHERE id = NEW.listing_id AND lifecycle_state = 'SUBMITTED';
    PERFORM set_config('zarketplace.internal', 'off', true);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acquisitions_list_on_acceptance ON public.acquisitions;
CREATE TRIGGER acquisitions_list_on_acceptance
  BEFORE UPDATE OF offer_status ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.list_on_acceptance();

-- ---------------------------------------------------------------------------
-- The sale is what starts the journey.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_ship_by_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d int; v_deadline timestamptz; v_amount numeric;
BEGIN
  IF NEW.is_sold AND NOT OLD.is_sold THEN
    IF NEW.lifecycle_state = 'LISTED' THEN
      NEW.lifecycle_state := 'SOLD';
      NEW.lifecycle_updated_at := now();
    END IF;
    SELECT COALESCE(a.ship_by_days, c.ship_by_days), a.offer_amount INTO d, v_amount
      FROM public.fulfillment_config c
      LEFT JOIN public.acquisitions a ON a.listing_id = NEW.id
     WHERE c.id = 1;
    v_deadline := now() + make_interval(days => COALESCE(d, 5));

    UPDATE public.acquisitions
       SET ship_by_deadline = v_deadline, intake_status = 'awaiting_pickup'
     WHERE listing_id = NEW.id;

    PERFORM public.enqueue_vendor_notification(NEW.id, 'item_sold',
      jsonb_build_object('ship_by', v_deadline, 'offer_amount', v_amount));
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS listings_start_ship_by ON public.listings;
CREATE TRIGGER listings_start_ship_by BEFORE UPDATE OF is_sold ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.start_ship_by_clock();

-- ---------------------------------------------------------------------------
-- Going live needs an accepted offer, and nothing more.
-- ---------------------------------------------------------------------------
-- Yesterday this also demanded the item be checked in at the hub, which in the
-- patient lane can never happen before a sale. Left in place it would have made
-- every listing permanently unapprovable.
CREATE OR REPLACE FUNCTION public.require_accepted_acquisition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.created_at < TIMESTAMPTZ '2026-08-31 00:00:00+00' THEN
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
END $fn$;

-- ---------------------------------------------------------------------------
-- The vendor's address matters again, so it is required where it is promised.
-- ---------------------------------------------------------------------------
-- A courier will collect from that address once the item sells, so an approval
-- without one is a listing we cannot fulfil. The gate is restored in full.
--
-- The trap that made me move it yesterday was real, and is fixed at the other
-- end instead: acceptance demanded address, city and pincode but not state,
-- while approval demanded state as well, so a vendor could accept and leave the
-- item unapprovable over a field nothing had asked them for. Acceptance now
-- asks for all four. The front end already derives state from the pincode, so
-- no vendor is asked anything new.
CREATE OR REPLACE FUNCTION public.listings_require_pickup_address()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status = 'approved' AND NEW.shipping_mode <> 'self_ship' THEN
    IF NEW.pickup_address IS NULL
       OR coalesce(NEW.pickup_address->>'address','') = ''
       OR coalesce(NEW.pickup_address->>'city','') = ''
       OR coalesce(NEW.pickup_address->>'state','') = ''
       OR coalesce(NEW.pickup_address->>'pincode','') = '' THEN
      RAISE EXCEPTION 'This listing has no complete pickup address (address, city, state, pincode), so a courier pickup could never be booked. Ask the seller to add it before approving.';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

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

  -- State is now required alongside the rest. A courier has to be sent here.
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
    listing_id, vendor_id, offer_amount,
    ack_genuine_and_accurate, ack_return_shipping_payable, ack_sixty_day_forfeit,
    terms_version, terms_text, user_agent
  ) VALUES (
    p_listing_id, auth.uid(), acq.offer_amount, true, true, true,
    p_terms_version, p_terms_text, p_user_agent
  );

  UPDATE public.acquisitions
     SET offer_status = 'accepted', accepted_at = now()
   WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('offer_amount', acq.offer_amount, 'accepted_at', now());
END $fn$;

-- ---------------------------------------------------------------------------
-- Notification vocabulary: send_it_in was the instant lane asking for the item
-- up front. item_sold is the patient lane's equivalent and already exists.
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendor_notifications DROP CONSTRAINT IF EXISTS vendor_notifications_kind_check;
ALTER TABLE public.vendor_notifications ADD CONSTRAINT vendor_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'item_submitted','offer_made','offer_rejected','item_sold','label_issued',
    'ship_by_reminder','received_at_hub','accepted','payout_sent','refused',
    'abandonment_30','abandonment_7','vendor_cancelled'
  ]));

-- ---------------------------------------------------------------------------
-- Views, rebuilt so the new columns are reachable and the old one is gone.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.listing_acquisitions;
CREATE VIEW public.listing_acquisitions WITH (security_invoker = true) AS
  SELECT * FROM public.acquisitions;
GRANT SELECT, INSERT, UPDATE ON public.listing_acquisitions TO authenticated;

DROP VIEW IF EXISTS public.vendor_offers;
CREATE VIEW public.vendor_offers WITH (security_invoker = false) AS
  SELECT
    a.listing_id,
    a.asking_price,
    a.offer_amount,
    a.offer_status,
    a.intake_status,
    a.review_note,
    a.review_reasons,
    a.reviewed_at,
    a.offer_round,
    a.not_accepted_reason,
    a.not_accepted_at,
    a.offered_at,
    a.offer_expires_at,
    a.accepted_at,
    a.paid_at,
    a.ship_by_deadline,
    a.lane
  FROM public.acquisitions a
  WHERE a.vendor_id = auth.uid();

REVOKE ALL ON public.vendor_offers FROM anon;
GRANT SELECT ON public.vendor_offers TO authenticated;
