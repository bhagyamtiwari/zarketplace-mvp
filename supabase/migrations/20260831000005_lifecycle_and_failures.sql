-- The order lifecycle, and the one system that handles every way it can fail.

-- ---------------------------------------------------------------------------
-- Lifecycle state. It lives on the item, because the item is the thing that
-- travels: it is bought from a vendor, comes to us, and goes out to a buyer.
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'LISTED',
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_lifecycle_state_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_lifecycle_state_check CHECK (
  lifecycle_state IN (
    'LISTED','SOLD','LABEL_ISSUED','PICKED_UP','IN_TRANSIT_INBOUND',
    'RECEIVED_AT_HUB','ACCEPTED','PAYOUT_SENT','REPACKED','SHIPPED_OUTBOUND',
    'DELIVERED','FAILED'
  )
);

CREATE INDEX IF NOT EXISTS listings_lifecycle_idx ON public.listings (lifecycle_state);

-- Every move, with who and why. An operator answering "where is this item and
-- how did it get here" should not have to infer it from timestamps scattered
-- across four tables.
CREATE TABLE IF NOT EXISTS public.lifecycle_events (
  id bigserial PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  note text,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lifecycle_events_listing_idx ON public.lifecycle_events (listing_id, created_at DESC);
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lifecycle_events_admin ON public.lifecycle_events;
CREATE POLICY lifecycle_events_admin ON public.lifecycle_events FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- A vendor can follow their own item. The states are the same ones their
-- dashboard already shows them; nothing here is about the buyer.
DROP POLICY IF EXISTS lifecycle_events_vendor_select ON public.lifecycle_events;
CREATE POLICY lifecycle_events_vendor_select ON public.lifecycle_events FOR SELECT
  USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.acquisitions a
     WHERE a.listing_id = lifecycle_events.listing_id AND a.vendor_id = auth.uid()));

-- The legal moves. Anything can fail; nothing comes back from DELIVERED.
CREATE OR REPLACE FUNCTION public.lifecycle_can_move(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_to = 'FAILED' THEN p_from <> 'DELIVERED'
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

CREATE OR REPLACE FUNCTION public.enforce_lifecycle_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
    IF NOT public.lifecycle_can_move(OLD.lifecycle_state, NEW.lifecycle_state) THEN
      RAISE EXCEPTION 'An item cannot go from % to %', OLD.lifecycle_state, NEW.lifecycle_state;
    END IF;
    NEW.lifecycle_updated_at := now();
    INSERT INTO public.lifecycle_events (listing_id, from_state, to_state, actor)
    VALUES (NEW.id, OLD.lifecycle_state, NEW.lifecycle_state, auth.uid());
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS listings_enforce_lifecycle ON public.listings;
CREATE TRIGGER listings_enforce_lifecycle BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lifecycle_transition();

-- Selling an item moves it to SOLD and starts the ship-by clock. The duration
-- was fixed when the vendor accepted; only the start is known now, because a
-- vendor cannot post an item nobody has bought.
CREATE OR REPLACE FUNCTION public.start_ship_by_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d int;
BEGIN
  IF NEW.is_sold AND NOT OLD.is_sold THEN
    IF NEW.lifecycle_state = 'LISTED' THEN
      NEW.lifecycle_state := 'SOLD';
      NEW.lifecycle_updated_at := now();
    END IF;
    SELECT COALESCE(a.ship_by_days, c.ship_by_days) INTO d
      FROM public.fulfillment_config c
      LEFT JOIN public.acquisitions a ON a.listing_id = NEW.id
     WHERE c.id = 1;
    UPDATE public.acquisitions
       SET ship_by_deadline = now() + make_interval(days => COALESCE(d, 5)),
           intake_status = 'awaiting_pickup'
     WHERE listing_id = NEW.id;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS listings_start_ship_by ON public.listings;
CREATE TRIGGER listings_start_ship_by BEFORE UPDATE OF is_sold ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.start_ship_by_clock();

-- ---------------------------------------------------------------------------
-- One failure path, whatever the reason.
--
-- Records the failure, refunds the buyer if there was one, moves the item to
-- FAILED, docks the vendor's trust, restricts them if they fall through the
-- floor, and starts the abandonment clock on a hub rejection. Every caller -
-- the NO_SHIP sweeper, the hub screen, a vendor cancelling - goes through
-- this, so none of them can implement a slightly different version.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_fulfillment_failure(
  p_listing_id uuid,
  p_reason text,
  p_detail text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cfg public.fulfillment_config;
  v_vendor uuid;
  v_order uuid;
  v_failure uuid;
  v_penalty int := 0;
  v_new_trust int;
BEGIN
  SELECT * INTO cfg FROM public.fulfillment_config WHERE id = 1;
  SELECT vendor_id INTO v_vendor FROM public.acquisitions WHERE listing_id = p_listing_id;

  -- The live sale for this item, if it had already sold.
  SELECT id INTO v_order FROM public.orders
   WHERE listing_id = p_listing_id AND status NOT IN ('cancelled','refunded')
   ORDER BY created_at DESC LIMIT 1;

  v_penalty := CASE p_reason
    WHEN 'NO_SHIP'              THEN cfg.trust_penalty_no_ship
    WHEN 'CONDITION_MISMATCH'   THEN cfg.trust_penalty_condition_mismatch
    WHEN 'AUTHENTICITY_CONCERN' THEN cfg.trust_penalty_authenticity
    WHEN 'VENDOR_CANCELLED'     THEN cfg.trust_penalty_vendor_cancelled
    ELSE 0  -- LOST_IN_TRANSIT is the courier's fault, not the vendor's.
  END;

  INSERT INTO public.fulfillment_failures (
    listing_id, order_id, vendor_id, reason, detail,
    refund_status, trust_penalty_applied, created_by,
    return_offered_at, abandonment_deadline
  ) VALUES (
    p_listing_id, v_order, v_vendor, p_reason, p_detail,
    CASE WHEN v_order IS NULL THEN 'not_applicable' ELSE 'pending' END,
    v_penalty, auth.uid(),
    CASE WHEN p_reason IN ('CONDITION_MISMATCH','AUTHENTICITY_CONCERN') THEN now() END,
    CASE WHEN p_reason IN ('CONDITION_MISMATCH','AUTHENTICITY_CONCERN')
         THEN now() + make_interval(days => cfg.abandonment_days) END
  ) RETURNING id INTO v_failure;

  -- The item is out of circulation either way.
  UPDATE public.listings
     SET lifecycle_state = 'FAILED', is_sold = false, status = 'archived'
   WHERE id = p_listing_id AND lifecycle_state <> 'DELIVERED';

  IF p_reason IN ('CONDITION_MISMATCH','AUTHENTICITY_CONCERN') THEN
    UPDATE public.acquisitions
       SET intake_status = 'not_accepted',
           not_accepted_reason = COALESCE(p_detail, p_reason),
           not_accepted_at = now()
     WHERE listing_id = p_listing_id;
  END IF;

  -- Trust, and the automatic restriction that follows from it.
  IF v_vendor IS NOT NULL AND v_penalty > 0 THEN
    UPDATE public.vendors
       SET trust_score = GREATEST(0, trust_score - v_penalty)
     WHERE id = v_vendor
    RETURNING trust_score INTO v_new_trust;

    IF v_new_trust IS NOT NULL AND v_new_trust < cfg.trust_score_floor THEN
      UPDATE public.vendors
         SET listing_restricted = true,
             restricted_at = COALESCE(restricted_at, now()),
             restricted_reason = COALESCE(restricted_reason,
               'Automatically restricted after repeated fulfillment failures.')
       WHERE id = v_vendor AND NOT listing_restricted;
    END IF;
  END IF;

  RETURN v_failure;
END $fn$;

REVOKE ALL ON FUNCTION public.record_fulfillment_failure(uuid, text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- NO_SHIP, without a human chasing anyone.
--
-- The signal is the absence of a Shiprocket pickup scan by the deadline. It
-- reads shipments.picked_up_at rather than a status string, because a status
-- can be reworded by an integration and a scan timestamp cannot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_no_ship()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT a.listing_id
      FROM public.acquisitions a
      JOIN public.listings l ON l.id = a.listing_id
      LEFT JOIN public.shipments s ON s.listing_id = a.listing_id AND s.leg = 'INBOUND'
     WHERE a.ship_by_deadline IS NOT NULL
       AND a.ship_by_deadline < now()
       AND s.picked_up_at IS NULL
       AND l.lifecycle_state IN ('SOLD','LABEL_ISSUED')
       AND NOT EXISTS (
         SELECT 1 FROM public.fulfillment_failures f WHERE f.listing_id = a.listing_id)
  LOOP
    PERFORM public.record_fulfillment_failure(
      r.listing_id, 'NO_SHIP', 'No pickup scan by the ship-by deadline.');
    n := n + 1;
  END LOOP;
  RETURN n;
END $fn$;

REVOKE ALL ON FUNCTION public.sweep_no_ship() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- A vendor pulling out on purpose, before the deadline. Better for everyone
-- than a silent NO_SHIP: the buyer is refunded sooner and it costs the vendor
-- far less trust.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_cancel_item(p_listing_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_vendor uuid; v_state text;
BEGIN
  SELECT a.vendor_id, l.lifecycle_state INTO v_vendor, v_state
    FROM public.acquisitions a JOIN public.listings l ON l.id = a.listing_id
   WHERE a.listing_id = p_listing_id;

  IF v_vendor IS NULL THEN RAISE EXCEPTION 'No such item'; END IF;
  IF v_vendor <> auth.uid() THEN RAISE EXCEPTION 'That item is not yours'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Tell us why, so we can sort the buyer out properly';
  END IF;
  IF v_state NOT IN ('LISTED','SOLD','LABEL_ISSUED') THEN
    RAISE EXCEPTION 'This item is already on its way to us. Contact us instead.';
  END IF;

  PERFORM public.record_fulfillment_failure(p_listing_id, 'VENDOR_CANCELLED', btrim(p_reason));
END $fn$;

REVOKE ALL ON FUNCTION public.vendor_cancel_item(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_item(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Rejected items whose 60 days have run out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.abandoned_items AS
  SELECT f.id AS failure_id, f.listing_id, f.vendor_id, f.reason,
         f.return_offered_at, f.abandonment_deadline,
         l.title, v.email AS vendor_email
    FROM public.fulfillment_failures f
    JOIN public.listings l ON l.id = f.listing_id
    LEFT JOIN public.vendors v ON v.id = f.vendor_id
   WHERE f.abandonment_deadline IS NOT NULL
     AND f.abandonment_deadline < now()
     AND f.disposed_at IS NULL;

REVOKE ALL ON public.abandoned_items FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- sales. zarketplace SELLING to a buyer.
--
-- The physical table is still `orders`: it carries live Razorpay records and
-- is wired into six edge functions, so renaming it is a migration of its own
-- rather than something to slip into this one. This view is the model's name
-- for it and the shape the two-transaction reading needs - a buyer, an item,
-- a resale price, a payment.
--
-- Note what it does not join to: no vendor, no acquisition, no payout. The
-- outbound sale stands on its own, and so does the inbound purchase.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.sales AS
  SELECT
    o.id            AS sale_id,
    o.order_number,
    o.listing_id,
    o.buyer_id,
    o.buyer_email,
    o.amount        AS resale_price,
    o.shipping_cost,
    o.total_amount  AS buyer_paid,
    o.razorpay_payment_id AS payment_reference,
    o.status,
    o.created_at    AS sold_at
  FROM public.orders o;

REVOKE ALL ON public.sales FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Applied as follow-up migrations against the live database; recorded here so
-- the file matches what actually ran. See 20260831000006 and _000007.
-- ---------------------------------------------------------------------------
