-- The offer engine, the two clocks, and the possession checks. MODEL.md §4-§6.
--
-- The old engine subtracted a list of costs and a margin from the resale price.
-- It under-offered everywhere and worst at the bottom, which is the exact
-- failure MODEL.md §4 names: flat-ish rates "under-earn on cheap items and
-- grossly over-earn on expensive ones". At a Rs. 1,000 resale it offered about
-- Rs. 285 against the Rs. 515 the model calls for.
--
-- The replacement works backwards from the estimated resale price:
--
--   Offer = (Resale_est x 0.98) - 215 - Required_contribution
--
-- with the contribution a declining percentage over a floor, so fixed costs
-- stop dominating a cheap item and generosity at the top costs us almost
-- nothing.

-- ---------------------------------------------------------------------------
-- Config. Every number MODEL.md names, as a row rather than a constant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.acquisition_config
  -- Payment gateway, as a fraction of resale. The x 0.98 in the formula.
  ADD COLUMN IF NOT EXISTS gateway_factor numeric NOT NULL DEFAULT 0.02,
  -- Two freight legs, packaging, handling and verification, per item.
  ADD COLUMN IF NOT EXISTS fixed_cost numeric NOT NULL DEFAULT 215,
  -- The floor under the declining percentage. Below roughly Rs. 800 the
  -- percentage alone stops covering what an item costs us to handle.
  ADD COLUMN IF NOT EXISTS contribution_floor numeric NOT NULL DEFAULT 200,
  -- An item we cannot list for at least this much is not worth taking.
  ADD COLUMN IF NOT EXISTS min_resale numeric NOT NULL DEFAULT 750,
  -- How long a listing runs once the vendor has accepted.
  ADD COLUMN IF NOT EXISTS listing_window_days int NOT NULL DEFAULT 45,
  -- How often we ask a vendor whether they still have the item.
  ADD COLUMN IF NOT EXISTS possession_check_days int NOT NULL DEFAULT 18,
  -- Unanswered checks in a row before the listing comes down.
  ADD COLUMN IF NOT EXISTS possession_strikes int NOT NULL DEFAULT 2,
  -- How long a vendor has to answer one before it counts as a non-response.
  ADD COLUMN IF NOT EXISTS possession_grace_days int NOT NULL DEFAULT 5;

-- MODEL.md §5: two clocks, and they are not the same clock. Seven days to
-- accept an offer; forty-five days of listing once they have.
UPDATE public.acquisition_config
   SET offer_valid_days = 7,
       min_offer = 300
 WHERE id = 1;

-- ---------------------------------------------------------------------------
-- Required contribution, banded.
-- ---------------------------------------------------------------------------
-- These four rates reproduce MODEL.md §4's table exactly at its four reference
-- points: 25% of 1,000 is 250, 24% of 2,500 is 600, 22% of 5,000 is 1,100, and
-- 20% of 10,000 is 2,000.
CREATE TABLE IF NOT EXISTS public.acquisition_contribution_tiers (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  min_value numeric NOT NULL,           -- inclusive, against expected resale
  max_value numeric,                    -- exclusive; NULL = no ceiling
  contribution_factor numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  CHECK (max_value IS NULL OR max_value > min_value)
);

INSERT INTO public.acquisition_contribution_tiers (label, min_value, max_value, contribution_factor, sort_order)
SELECT * FROM (VALUES
  ('Up to Rs. 1,500',          0::numeric,   1500::numeric, 0.25::numeric, 1),
  ('Rs. 1,500 - Rs. 3,500',  1500::numeric,  3500::numeric, 0.24::numeric, 2),
  ('Rs. 3,500 - Rs. 7,500',  3500::numeric,  7500::numeric, 0.22::numeric, 3),
  ('Above Rs. 7,500',        7500::numeric,   NULL::numeric, 0.20::numeric, 4)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM public.acquisition_contribution_tiers);

ALTER TABLE public.acquisition_contribution_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acquisition_contribution_tiers_admin ON public.acquisition_contribution_tiers;
CREATE POLICY acquisition_contribution_tiers_admin ON public.acquisition_contribution_tiers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- The engine.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_acquisition_offer(resale numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cfg public.acquisition_config;
  tier public.acquisition_contribution_tiers;
  gateway numeric; contribution numeric; pct_contribution numeric; offer numeric;
  below_floor boolean;
BEGIN
  IF resale IS NULL OR resale <= 0 THEN
    RAISE EXCEPTION 'Expected resale must be a positive amount';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'acquisition_config is missing'; END IF;

  SELECT * INTO tier FROM public.acquisition_contribution_tiers t
   WHERE resale >= t.min_value AND (t.max_value IS NULL OR resale < t.max_value)
   ORDER BY t.sort_order LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No contribution tier covers a resale of %', resale; END IF;

  gateway          := cfg.gateway_factor * resale;
  pct_contribution := tier.contribution_factor * resale;
  -- Floor plus declining percentage, exactly as MODEL.md §4 puts it. The floor
  -- is what keeps a Rs. 750 item from being handled at a loss.
  contribution     := GREATEST(cfg.contribution_floor, pct_contribution);

  offer := floor(resale - gateway - cfg.fixed_cost - contribution);

  -- Two separate reasons to say no, reported separately so an operator can see
  -- which one bit: the item is too cheap to be worth listing at all, or the
  -- arithmetic leaves too little to be worth offering.
  below_floor := resale < cfg.min_resale;

  RETURN jsonb_build_object(
    'offer_amount',       GREATEST(offer, 0),
    'viable',             (NOT below_floor) AND offer >= cfg.min_offer,
    'below_resale_floor', below_floor,
    'expected_resale',    resale,
    'gateway',            round(gateway),
    'fixed_cost',         round(cfg.fixed_cost),
    'required_contribution', round(contribution),
    'contribution_at_floor', contribution > pct_contribution,
    'contribution_tier',  tier.label,
    'contribution_factor', tier.contribution_factor,
    'min_offer',          cfg.min_offer,
    'min_resale',         cfg.min_resale,
    'formula_version',    'model-v1',
    'computed_at',        now()
  );
END $fn$;

REVOKE ALL ON FUNCTION public.compute_acquisition_offer(numeric) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- The pricing dataset. Not debug logging: this outlives the listing.
-- ---------------------------------------------------------------------------
-- Every offer we work out, what we sent, and what became of it. The item's
-- attributes are copied in rather than joined, so a deleted listing does not
-- take the observation with it - MODEL.md §4 wants this to become a
-- brand/type/size/condition lookup, and that needs the rows to survive.
CREATE TABLE IF NOT EXISTS public.offer_log (
  id bigserial PRIMARY KEY,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,

  -- What we thought it was worth, and what the engine said to offer.
  expected_resale numeric NOT NULL,
  computed_offer numeric NOT NULL,
  -- What an operator actually sent, which may differ: the engine is a
  -- reference, and condition is a judgement made by looking at photographs.
  offered_amount numeric,
  manually_set boolean NOT NULL DEFAULT false,

  contribution_tier text,
  contribution_factor numeric,
  required_contribution numeric,
  formula_version text,
  breakdown jsonb,

  -- Denormalised so the row stands alone.
  brand text, category text, item_condition text, size text, lane text,

  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending','accepted','declined','expired','withdrawn')),
  outcome_at timestamptz,
  -- Filled in when it eventually sells, which is the other half of the dataset.
  sold_at timestamptz,
  days_to_sell int,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_log_listing_idx ON public.offer_log (listing_id);
CREATE INDEX IF NOT EXISTS offer_log_outcome_idx ON public.offer_log (outcome);
CREATE INDEX IF NOT EXISTS offer_log_created_idx ON public.offer_log (created_at DESC);

ALTER TABLE public.offer_log ENABLE ROW LEVEL SECURITY;
-- Operators only. It holds the expected resale, which a vendor must never see.
DROP POLICY IF EXISTS offer_log_admin ON public.offer_log;
CREATE POLICY offer_log_admin ON public.offer_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_offer_and_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE l public.listings;
BEGIN
  -- An offer going out: one row per offer, including re-offers on a reworked
  -- item, because each one is a separate observation.
  IF NEW.offer_status = 'offered' AND OLD.offer_status IS DISTINCT FROM 'offered' THEN
    SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
    INSERT INTO public.offer_log (
      listing_id, expected_resale, computed_offer, offered_amount, manually_set,
      contribution_tier, contribution_factor, required_contribution, formula_version,
      breakdown, brand, category, item_condition, size, lane
    ) VALUES (
      NEW.listing_id,
      COALESCE(NEW.expected_resale, 0),
      COALESCE((NEW.offer_breakdown->>'offer_amount')::numeric, NEW.offer_amount, 0),
      NEW.offer_amount,
      COALESCE(NEW.offer_manually_set, false),
      NEW.offer_breakdown->>'contribution_tier',
      (NEW.offer_breakdown->>'contribution_factor')::numeric,
      (NEW.offer_breakdown->>'required_contribution')::numeric,
      NEW.offer_breakdown->>'formula_version',
      NEW.offer_breakdown,
      l.brand, l.category, l.condition, l.size, NEW.lane
    );
  END IF;

  -- What became of it. Only the most recent open row, so a reworked item's
  -- earlier rounds keep their own outcomes.
  IF NEW.offer_status IS DISTINCT FROM OLD.offer_status
     AND NEW.offer_status IN ('accepted','offer_rejected','expired','declined') THEN
    UPDATE public.offer_log
       SET outcome = CASE NEW.offer_status
                       WHEN 'accepted'       THEN 'accepted'
                       WHEN 'offer_rejected' THEN 'declined'
                       WHEN 'expired'        THEN 'expired'
                       ELSE 'withdrawn'
                     END,
           outcome_at = now()
     WHERE id = (SELECT id FROM public.offer_log
                  WHERE listing_id = NEW.listing_id AND outcome = 'pending'
                  ORDER BY created_at DESC LIMIT 1);
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acquisitions_log_offer ON public.acquisitions;
CREATE TRIGGER acquisitions_log_offer
  AFTER UPDATE OF offer_status ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.log_offer_and_outcome();

-- Days-to-sell, the other half of the dataset MODEL.md §4 wants.
CREATE OR REPLACE FUNCTION public.log_days_to_sell()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.is_sold AND NOT OLD.is_sold THEN
    UPDATE public.offer_log o
       SET sold_at = now(),
           days_to_sell = GREATEST(0, EXTRACT(day FROM now() - o.outcome_at)::int)
     WHERE o.listing_id = NEW.id AND o.outcome = 'accepted' AND o.sold_at IS NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS listings_log_days_to_sell ON public.listings;
CREATE TRIGGER listings_log_days_to_sell AFTER UPDATE OF is_sold ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.log_days_to_sell();
