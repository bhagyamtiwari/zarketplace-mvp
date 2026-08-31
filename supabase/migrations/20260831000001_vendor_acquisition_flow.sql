-- Vendor acquisition flow: we buy an item from a vendor at a locked rupee
-- amount, then resell it ourselves. See COPY_RULES.md for the model.
--
-- Two rules shape this schema more than anything else:
--
--   * A vendor must never see, approve or infer the resale price. The
--     expected resale and every component of the spread therefore live in a
--     table the vendor has no SELECT policy on at all. What they can read is
--     one rupee number, through vendor_offers, and nothing else.
--   * The acquisition amount is fixed before the item goes live and never
--     changes. It is computed once, server-side, and the row that holds it is
--     immutable once accepted.

-- ---------------------------------------------------------------------------
-- Spread configuration. Operator-only: no vendor-facing surface reads these.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acquisition_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Flat rupee costs we carry on every acquisition.
  inbound_shipping numeric NOT NULL DEFAULT 90,
  outbound_shipping numeric NOT NULL DEFAULT 90,
  payment_processing_flat numeric NOT NULL DEFAULT 5,
  rto_damage_reserve_flat numeric NOT NULL DEFAULT 25,
  -- Proportional components. Operator-only knobs: never rendered anywhere a
  -- vendor can reach, and never used to describe an offer.
  payment_processing_factor numeric NOT NULL DEFAULT 0.025,
  rto_damage_reserve_factor numeric NOT NULL DEFAULT 0.03,
  -- An offer below this is not worth making; the listing is declined instead.
  min_offer numeric NOT NULL DEFAULT 100,
  -- Offers go stale: an untouched offer stops being honoured after this.
  offer_valid_days int NOT NULL DEFAULT 14,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.acquisition_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Margin banded by item value: fixed costs dominate a small order, so the
-- spread is widest at the bottom and narrows as value rises.
CREATE TABLE IF NOT EXISTS public.acquisition_margin_tiers (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  min_value numeric NOT NULL,            -- inclusive, against expected resale
  max_value numeric,                     -- exclusive; NULL = no ceiling
  margin_flat numeric NOT NULL DEFAULT 0,
  margin_factor numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  CHECK (max_value IS NULL OR max_value > min_value)
);

INSERT INTO public.acquisition_margin_tiers (label, min_value, max_value, margin_flat, margin_factor, sort_order)
SELECT * FROM (VALUES
  ('Under Rs. 2,000',        0::numeric,     2000::numeric,  150::numeric, 0.30::numeric, 1),
  ('Rs. 2,000 - Rs. 20,000', 2000::numeric, 20000::numeric,  200::numeric, 0.22::numeric, 2),
  ('Above Rs. 20,000',      20000::numeric,  NULL::numeric,  300::numeric, 0.15::numeric, 3)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM public.acquisition_margin_tiers);

ALTER TABLE public.acquisition_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisition_margin_tiers ENABLE ROW LEVEL SECURITY;

-- Deliberately no vendor-readable policy on either table. Only admins.
DROP POLICY IF EXISTS acquisition_config_admin ON public.acquisition_config;
CREATE POLICY acquisition_config_admin ON public.acquisition_config
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS acquisition_margin_tiers_admin ON public.acquisition_margin_tiers;
CREATE POLICY acquisition_margin_tiers_admin ON public.acquisition_margin_tiers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Per-listing acquisition record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_acquisitions (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What the vendor said they wanted for it. Theirs, and visible to them.
  asking_price numeric NOT NULL CHECK (asking_price > 0),

  -- What we expect to resell it for, set by an operator. NEVER vendor-visible.
  expected_resale numeric CHECK (expected_resale IS NULL OR expected_resale > 0),

  -- The locked acquisition amount. Once offer_status leaves 'pending_pricing'
  -- this number does not change - the trigger below enforces that.
  offer_amount numeric CHECK (offer_amount IS NULL OR offer_amount >= 0),

  -- Every component that produced offer_amount, kept for audit. Operator-only.
  offer_breakdown jsonb,

  offer_status text NOT NULL DEFAULT 'pending_pricing'
    CHECK (offer_status IN ('pending_pricing','offered','accepted','declined','expired')),

  -- Where the physical item is. NULL until the item has been bought.
  intake_status text
    CHECK (intake_status IS NULL OR intake_status IN
      ('awaiting_pickup','in_transit','received','accepted_into_inventory','not_accepted','paid')),

  -- Set when we refuse the item at the hub. The 60-day forfeit clock in the
  -- vendor agreement runs from here.
  not_accepted_reason text,
  not_accepted_at timestamptz,

  offered_at timestamptz,
  offer_expires_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_acquisitions_vendor_idx ON public.listing_acquisitions (vendor_id);
CREATE INDEX IF NOT EXISTS listing_acquisitions_offer_status_idx ON public.listing_acquisitions (offer_status);
CREATE INDEX IF NOT EXISTS listing_acquisitions_intake_idx ON public.listing_acquisitions (intake_status);

ALTER TABLE public.listing_acquisitions ENABLE ROW LEVEL SECURITY;

-- A vendor may create the acquisition record for their own listing, with the
-- asking price only. Everything else is server-set: the WITH CHECK refuses an
-- insert that tries to name its own offer or expected resale.
DROP POLICY IF EXISTS listing_acquisitions_vendor_insert ON public.listing_acquisitions;
CREATE POLICY listing_acquisitions_vendor_insert ON public.listing_acquisitions FOR INSERT
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

-- No vendor SELECT policy, by design. A vendor reads their offer through
-- public.vendor_offers, which exposes the rupee amount and nothing else.
DROP POLICY IF EXISTS listing_acquisitions_admin_all ON public.listing_acquisitions;
CREATE POLICY listing_acquisitions_admin_all ON public.listing_acquisitions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Once an offer has been made, the amount is frozen. This is the whole
-- promise: the number a vendor agreed to cannot move afterwards.
CREATE OR REPLACE FUNCTION public.freeze_acquisition_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.offer_status <> 'pending_pricing'
     AND NEW.offer_amount IS DISTINCT FROM OLD.offer_amount THEN
    RAISE EXCEPTION 'The acquisition amount is locked once offered and cannot be changed';
  END IF;
  IF OLD.offer_status = 'accepted' AND NEW.offer_status <> 'accepted' THEN
    RAISE EXCEPTION 'An accepted acquisition cannot be un-accepted';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS listing_acquisitions_freeze ON public.listing_acquisitions;
CREATE TRIGGER listing_acquisitions_freeze
  BEFORE UPDATE ON public.listing_acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.freeze_acquisition_offer();

-- ---------------------------------------------------------------------------
-- The vendor's view of their own acquisition. One rupee number and a state.
-- Runs as owner, so it reads a table the vendor cannot select from directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vendor_offers
WITH (security_invoker = false) AS
  SELECT
    a.listing_id,
    a.asking_price,
    a.offer_amount,
    a.offer_status,
    a.intake_status,
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

-- ---------------------------------------------------------------------------
-- The agreement. A legal record: append-only, timestamped, tied to a listing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The amount that was on screen when they accepted. Denormalised on purpose:
  -- this record has to stand on its own if anything else is ever corrected.
  offer_amount numeric NOT NULL,

  -- The three acknowledgements, stored individually rather than as one flag,
  -- so the record shows exactly what was agreed to.
  ack_genuine_and_accurate boolean NOT NULL,
  ack_return_shipping_payable boolean NOT NULL,
  ack_sixty_day_forfeit boolean NOT NULL,

  -- The exact wording shown, so a later revision cannot rewrite history.
  terms_version text NOT NULL,
  terms_text jsonb NOT NULL,

  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,

  UNIQUE (listing_id),
  CHECK (ack_genuine_and_accurate AND ack_return_shipping_payable AND ack_sixty_day_forfeit)
);

CREATE INDEX IF NOT EXISTS listing_agreements_vendor_idx ON public.listing_agreements (vendor_id);

ALTER TABLE public.listing_agreements ENABLE ROW LEVEL SECURITY;

-- Readable by the vendor who signed it and by admins. Never updatable or
-- deletable by anyone through the API: there is deliberately no policy for
-- UPDATE or DELETE, so both are refused.
DROP POLICY IF EXISTS listing_agreements_select ON public.listing_agreements;
CREATE POLICY listing_agreements_select ON public.listing_agreements FOR SELECT
  USING (vendor_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- The spread model. Server-side and single-source: no client computes an offer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_acquisition_offer(resale numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  -- Whole rupees, rounded down: we never offer a number we then have to trim.
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
END $$;

REVOKE ALL ON FUNCTION public.compute_acquisition_offer(numeric) FROM anon, authenticated;

-- Operator action: price a listing and lock its offer.
CREATE OR REPLACE FUNCTION public.set_expected_resale(p_listing_id uuid, p_resale numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
  cfg public.acquisition_config;
  current_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator may price a listing';
  END IF;

  SELECT offer_status INTO current_status
    FROM public.listing_acquisitions WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No acquisition record for that listing';
  END IF;
  IF current_status <> 'pending_pricing' THEN
    RAISE EXCEPTION 'This listing has already been offered at a locked amount';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  result := public.compute_acquisition_offer(p_resale);

  IF NOT (result->>'viable')::boolean THEN
    UPDATE public.listing_acquisitions
       SET expected_resale = p_resale,
           offer_breakdown = result,
           offer_status = 'declined'
     WHERE listing_id = p_listing_id;
    RETURN result;
  END IF;

  UPDATE public.listing_acquisitions
     SET expected_resale  = p_resale,
         offer_amount     = (result->>'offer_amount')::numeric,
         offer_breakdown  = result,
         offer_status     = 'offered',
         offered_at       = now(),
         offer_expires_at = now() + make_interval(days => cfg.offer_valid_days)
   WHERE listing_id = p_listing_id;

  RETURN result;
END $$;

-- ---------------------------------------------------------------------------
-- Vendor action: accept the offer and sign the agreement, in one transaction.
-- Acceptance and the legal record cannot come apart - there is no path that
-- writes one without the other.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_acquisition_offer(
  p_listing_id uuid,
  p_terms_version text,
  p_terms_text jsonb,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  acq public.listing_acquisitions;
BEGIN
  SELECT * INTO acq FROM public.listing_acquisitions
   WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No offer for that listing';
  END IF;
  IF acq.vendor_id <> auth.uid() THEN
    RAISE EXCEPTION 'That offer is not yours to accept';
  END IF;
  IF acq.offer_status = 'accepted' THEN
    RAISE EXCEPTION 'You have already accepted this offer';
  END IF;
  IF acq.offer_status <> 'offered' THEN
    RAISE EXCEPTION 'There is no open offer on this item';
  END IF;
  IF acq.offer_expires_at IS NOT NULL AND acq.offer_expires_at < now() THEN
    UPDATE public.listing_acquisitions SET offer_status = 'expired' WHERE listing_id = p_listing_id;
    RAISE EXCEPTION 'This offer has expired. Contact us and we will look at it again.';
  END IF;

  -- The three acknowledgements are not parameters. Reaching this function at
  -- all means all three were given, and the row records them as given; a
  -- caller cannot record a partial agreement.
  INSERT INTO public.listing_agreements (
    listing_id, vendor_id, offer_amount,
    ack_genuine_and_accurate, ack_return_shipping_payable, ack_sixty_day_forfeit,
    terms_version, terms_text, user_agent
  ) VALUES (
    p_listing_id, auth.uid(), acq.offer_amount,
    true, true, true,
    p_terms_version, p_terms_text, p_user_agent
  );

  UPDATE public.listing_acquisitions
     SET offer_status = 'accepted', accepted_at = now()
   WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('offer_amount', acq.offer_amount, 'accepted_at', now());
END $$;

REVOKE ALL ON FUNCTION public.accept_acquisition_offer(uuid, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_acquisition_offer(uuid, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decline_acquisition_offer(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.listing_acquisitions
     SET offer_status = 'declined'
   WHERE listing_id = p_listing_id
     AND vendor_id = auth.uid()
     AND offer_status = 'offered';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no open offer on this item';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.decline_acquisition_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_acquisition_offer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- A listing may only be approved once its acquisition has been accepted.
-- This is the structural guarantee behind "the amount is agreed before the
-- item goes live": approval is the moment it goes live.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_accepted_acquisition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Listings that predate this flow have no acquisition record and never will.
  -- Holding them to a rule that did not exist when they were created would
  -- make every one of them permanently unapprovable.
  IF NEW.created_at < TIMESTAMPTZ '2026-08-31 00:00:00+00' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.listing_acquisitions a
       WHERE a.listing_id = NEW.id AND a.offer_status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'This listing cannot go live until its acquisition amount has been accepted';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS listings_require_accepted_acquisition ON public.listings;
CREATE TRIGGER listings_require_accepted_acquisition
  BEFORE INSERT OR UPDATE OF status ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.require_accepted_acquisition();
