-- Buy-to-hub.
--
-- Until now an accepted item stayed in the vendor's home, went live from
-- there, and only travelled once a buyer had paid for it. That is consignment
-- wearing an acquisition's clothes: we owned the item on paper but could not
-- see it, could not photograph it, and could not promise a buyer anything
-- about it that the vendor had not told us.
--
-- The order of events is now the order the money and the goods actually move:
--
--   vendor accepts  ->  item ships to us  ->  we check it in  ->  we pay
--   ->  it goes live  ->  a buyer buys  ->  we ship it out
--
-- Two consequences worth stating plainly, because the rest of this file only
-- makes sense in their light:
--
--   * We now carry the risk that an item never sells. That was the vendor's
--     risk before and it is ours now. It is the thing we are selling them.
--   * A buyer never waits on a vendor. Everything on the site is in our hands
--     when they buy it.

-- ---------------------------------------------------------------------------
-- Lifecycle, reordered.
-- ---------------------------------------------------------------------------
-- SUBMITTED is new and is where every item now starts: sent to us, not yet
-- priced, not ours. LISTED stops being the first state and becomes a late one,
-- because an item is not listed until it is sitting on our shelf.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_lifecycle_state_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_lifecycle_state_check CHECK (
  lifecycle_state IN (
    'SUBMITTED','ACQUIRED','LABEL_ISSUED','PICKED_UP','IN_TRANSIT_INBOUND',
    'RECEIVED_AT_HUB','ACCEPTED','PAYOUT_SENT','LISTED','SOLD','REPACKED',
    'SHIPPED_OUTBOUND','DELIVERED','FAILED'
  )
);
ALTER TABLE public.listings ALTER COLUMN lifecycle_state SET DEFAULT 'SUBMITTED';

-- The inbound legs differ by lane: a vendor on our prepaid label waits for the
-- label, a vendor shipping with their own courier does not, so ACQUIRED can
-- reach PICKED_UP either through LABEL_ISSUED or directly.
CREATE OR REPLACE FUNCTION public.lifecycle_can_move(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_to = 'FAILED' THEN p_from <> 'DELIVERED'
    WHEN p_from = 'SUBMITTED'          THEN p_to = 'ACQUIRED'
    WHEN p_from = 'ACQUIRED'           THEN p_to IN ('LABEL_ISSUED','PICKED_UP')
    WHEN p_from = 'LABEL_ISSUED'       THEN p_to = 'PICKED_UP'
    WHEN p_from = 'PICKED_UP'          THEN p_to = 'IN_TRANSIT_INBOUND'
    WHEN p_from = 'IN_TRANSIT_INBOUND' THEN p_to = 'RECEIVED_AT_HUB'
    WHEN p_from = 'RECEIVED_AT_HUB'    THEN p_to = 'ACCEPTED'
    WHEN p_from = 'ACCEPTED'           THEN p_to = 'PAYOUT_SENT'
    WHEN p_from = 'PAYOUT_SENT'        THEN p_to = 'LISTED'
    WHEN p_from = 'LISTED'             THEN p_to = 'SOLD'
    WHEN p_from = 'SOLD'               THEN p_to = 'REPACKED'
    WHEN p_from = 'REPACKED'           THEN p_to = 'SHIPPED_OUTBOUND'
    WHEN p_from = 'SHIPPED_OUTBOUND'   THEN p_to = 'DELIVERED'
    ELSE false
  END;
$fn$;

-- ---------------------------------------------------------------------------
-- The inbound lane. Chosen by the vendor when they list, not when they accept.
-- ---------------------------------------------------------------------------
-- Deliberately at listing time. The lane changes what the item costs us, so it
-- has to be known before the offer is computed - otherwise the amount would
-- have to move after the vendor had seen it, and the one promise this whole
-- schema exists to keep is that it never does.
--
-- There is no way to cheat this. A vendor who claims the free lane to get the
-- higher amount is simply never sent a label, so they ship it themselves or
-- the item never arrives.
ALTER TABLE public.acquisitions
  ADD COLUMN IF NOT EXISTS vendor_pays_inbound boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.acquisitions.vendor_pays_inbound IS
  'True when the vendor sends the item to us at their own cost. Raises their offer, because our inbound shipping cost drops to zero.';

-- ---------------------------------------------------------------------------
-- The spread model, now aware of the lane.
-- ---------------------------------------------------------------------------
-- The single-argument version has to go rather than sit alongside the new one:
-- the lane argument carries a default, so leaving both in place would make
-- every existing one-argument call ambiguous rather than merely stale.
DROP FUNCTION IF EXISTS public.compute_acquisition_offer(numeric);

CREATE OR REPLACE FUNCTION public.compute_acquisition_offer(
  resale numeric,
  p_vendor_pays_inbound boolean DEFAULT false
)
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

  -- The only difference between the two lanes. Everything else we carry
  -- either way.
  inbound    := CASE WHEN p_vendor_pays_inbound THEN 0 ELSE cfg.inbound_shipping END;
  outbound   := cfg.outbound_shipping;
  processing := cfg.payment_processing_flat + (cfg.payment_processing_factor * resale);
  reserve    := cfg.rto_damage_reserve_flat + (cfg.rto_damage_reserve_factor * resale);
  margin     := tier.margin_flat + (tier.margin_factor * resale);

  offer := floor(resale - inbound - outbound - processing - reserve - margin);

  RETURN jsonb_build_object(
    'offer_amount',      GREATEST(offer, 0),
    'viable',            offer >= cfg.min_offer,
    'expected_resale',   resale,
    'vendor_pays_inbound', p_vendor_pays_inbound,
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

REVOKE ALL ON FUNCTION public.compute_acquisition_offer(numeric, boolean) FROM anon, authenticated;

-- Pricing reads the lane off the row rather than taking it as an argument, so
-- an operator cannot price an item against a lane the vendor did not pick.
CREATE OR REPLACE FUNCTION public.set_expected_resale(p_listing_id uuid, p_resale numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  result jsonb;
  cfg public.acquisition_config;
  current_status text;
  v_lane boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may price a listing';
  END IF;

  SELECT offer_status, vendor_pays_inbound INTO current_status, v_lane
    FROM public.acquisitions WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No acquisition record for that listing';
  END IF;
  IF current_status <> 'pending_pricing' THEN
    RAISE EXCEPTION 'This listing has already been offered at a locked amount';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  result := public.compute_acquisition_offer(p_resale, COALESCE(v_lane, false));

  IF NOT (result->>'viable')::boolean THEN
    UPDATE public.acquisitions
       SET expected_resale = p_resale,
           offer_breakdown = result,
           offer_status = 'declined'
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
-- The asking price is gone.
-- ---------------------------------------------------------------------------
-- It was never read by the offer model, and asking someone to name a number we
-- then ignore invites them to read our offer as a counter to theirs. Kept as a
-- nullable column so the rows that already carry one are not rewritten.
ALTER TABLE public.acquisitions ALTER COLUMN asking_price DROP NOT NULL;
ALTER TABLE public.acquisitions DROP CONSTRAINT IF EXISTS listing_acquisitions_asking_price_check;
ALTER TABLE public.acquisitions ADD CONSTRAINT acquisitions_asking_price_check
  CHECK (asking_price IS NULL OR asking_price > 0);

-- The vendor insert policy, restated: they may now name their lane, and they
-- no longer have to name a price. Everything about the offer stays server-set.
DROP POLICY IF EXISTS listing_acquisitions_vendor_insert ON public.acquisitions;
CREATE POLICY listing_acquisitions_vendor_insert ON public.acquisitions FOR INSERT
  WITH CHECK (
    vendor_id = auth.uid()
    AND expected_resale IS NULL
    AND offer_amount IS NULL
    AND offer_breakdown IS NULL
    AND offer_status = 'pending_pricing'
    AND intake_status IS NULL
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Acceptance starts the journey. This is the change the file is named for.
-- ---------------------------------------------------------------------------
-- Previously the ship-by clock started when a buyer bought the item. Now it
-- starts when the vendor accepts, because that is when the item becomes ours
-- and when we want it in our hands.
DROP TRIGGER IF EXISTS listings_start_ship_by ON public.listings;

CREATE OR REPLACE FUNCTION public.start_intake_on_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d int; v_deadline timestamptz;
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    SELECT COALESCE(NEW.ship_by_days, c.ship_by_days) INTO d
      FROM public.fulfillment_config c WHERE c.id = 1;
    v_deadline := now() + make_interval(days => COALESCE(d, 5));

    NEW.ship_by_deadline := v_deadline;
    NEW.intake_status    := 'awaiting_pickup';

    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET lifecycle_state = 'ACQUIRED', lifecycle_updated_at = now()
     WHERE id = NEW.listing_id AND lifecycle_state = 'SUBMITTED';
    PERFORM set_config('zarketplace.internal', 'off', true);

    PERFORM public.enqueue_vendor_notification(NEW.listing_id, 'send_it_in',
      jsonb_build_object(
        'ship_by', v_deadline,
        'vendor_pays_inbound', NEW.vendor_pays_inbound));
  END IF;
  RETURN NEW;
END $fn$;

-- BEFORE, so the deadline and intake state are part of the same write that
-- accepts the offer rather than a second one that could fail on its own.
DROP TRIGGER IF EXISTS acquisitions_start_intake ON public.acquisitions;
CREATE TRIGGER acquisitions_start_intake
  BEFORE UPDATE OF offer_status ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.start_intake_on_acceptance();

-- ---------------------------------------------------------------------------
-- An item goes live when we have it, not when it is promised to us.
-- ---------------------------------------------------------------------------
-- The old rule was that an accepted offer was enough to approve a listing. It
-- is no longer enough, and this is the structural half of "everything on the
-- site is in our hands": approval is refused until the item has been checked
-- in at the hub.
CREATE OR REPLACE FUNCTION public.require_accepted_acquisition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Listings that predate the acquisition flow entirely.
  IF NEW.created_at < TIMESTAMPTZ '2026-08-31 00:00:00+00' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.acquisitions a
       WHERE a.listing_id = NEW.id
         AND a.offer_status = 'accepted'
         AND a.intake_status IN ('accepted_into_inventory','paid')
    ) THEN
      RAISE EXCEPTION 'This item cannot go live until it has reached us and been checked in';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

-- ---------------------------------------------------------------------------
-- Submission is acknowledged, and always was.
-- ---------------------------------------------------------------------------
-- acquisitions_notify_submitted has enqueued item_submitted on every
-- submission all along. What was missing was the template to render it, so the
-- queued row was dropped as undeliverable and the vendor heard nothing back at
-- all. That template now exists (see dispatch-vendor-emails/templates.ts), so
-- no trigger is added here: a second one would only send the email twice.

-- ---------------------------------------------------------------------------
-- The compatibility view has to be rebuilt, not just left alone.
-- ---------------------------------------------------------------------------
-- listing_acquisitions was defined as SELECT * before vendor_pays_inbound
-- existed, and a view does not gain columns added to its table afterwards.
-- Every caller still goes through it, so without this the listing form cannot
-- write the lane and the pricing screen cannot read it.
DROP VIEW IF EXISTS public.listing_acquisitions;
CREATE VIEW public.listing_acquisitions WITH (security_invoker = true) AS
  SELECT * FROM public.acquisitions;
GRANT SELECT, INSERT, UPDATE ON public.listing_acquisitions TO authenticated;

-- ---------------------------------------------------------------------------
-- The notification vocabulary.
-- ---------------------------------------------------------------------------
-- send_it_in is the buy-to-hub replacement for item_sold: it asks a vendor to
-- post the item once we have bought it, rather than once someone has bought it
-- from us. item_sold stays in the list only because rows carrying it already
-- exist; nothing produces it any more.
--
-- item_submitted was already allowed here and had no template behind it, which
-- is why submitting an item used to be met with silence.
ALTER TABLE public.vendor_notifications DROP CONSTRAINT IF EXISTS vendor_notifications_kind_check;
ALTER TABLE public.vendor_notifications ADD CONSTRAINT vendor_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'item_submitted','offer_made','offer_rejected','send_it_in','item_sold',
    'label_issued','ship_by_reminder','received_at_hub','accepted','payout_sent',
    'refused','abandonment_30','abandonment_7','vendor_cancelled'
  ]));

-- ---------------------------------------------------------------------------
-- The vendor's own view of their offer, now carrying the lane.
-- ---------------------------------------------------------------------------
-- The offer page has to say what happens next, and that differs by lane: one
-- vendor waits for a label, the other posts the item themselves. ship_by is
-- exposed for the same reason - it is a commitment made on acceptance, so they
-- should be able to look it up afterwards.
--
-- Appended rather than reordered, because CREATE OR REPLACE VIEW can only add
-- columns at the end. Still one rupee number and nothing about the resale.
CREATE OR REPLACE VIEW public.vendor_offers
WITH (security_invoker = false) AS
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
    a.vendor_pays_inbound,
    a.ship_by_deadline
  FROM public.acquisitions a
  WHERE a.vendor_id = auth.uid();

REVOKE ALL ON public.vendor_offers FROM anon;
GRANT SELECT ON public.vendor_offers TO authenticated;

-- ---------------------------------------------------------------------------
-- The pickup-address gate follows the goods.
-- ---------------------------------------------------------------------------
-- It gated approval, which made sense when approval was the moment a courier
-- would eventually collect from the vendor. Under buy-to-hub approval happens
-- after the item is already on our shelf, and the outbound leg goes out from
-- the hub, so the vendor's address has stopped being operationally relevant by
-- then. It matters for the INBOUND leg, and accept_acquisition_offer already
-- refuses an acceptance without one.
--
-- This also closes a trap. The acceptance check requires address, city and
-- pincode but not state, while this one required state as well: a vendor could
-- accept an offer, send us the item, and leave it permanently unapprovable
-- over a field nothing had ever asked them for.
CREATE OR REPLACE FUNCTION public.listings_require_pickup_address()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status = 'approved' AND NEW.shipping_mode <> 'self_ship' THEN
    IF EXISTS (
      SELECT 1 FROM public.acquisitions a
       WHERE a.listing_id = NEW.id
         AND a.intake_status IN ('received','accepted_into_inventory','paid')
    ) THEN
      RETURN NEW;
    END IF;

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
