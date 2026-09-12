-- The 45-day listing window, and asking a vendor whether they still have the
-- item. MODEL.md §5.
--
-- The patient lane's whole risk is that an item we have promised a buyer is no
-- longer in the wardrobe we think it is in. Nothing in the schema noticed that
-- before: a listing sat live forever, and we would only find out it was gone
-- when a courier turned up to collect it.

-- ---------------------------------------------------------------------------
-- Expiry is not failure.
-- ---------------------------------------------------------------------------
-- An item that does not sell has not gone wrong, and nobody is owed anything:
-- no supply occurred. It gets its own terminal state rather than being folded
-- into FAILED, which carries fault and docks a vendor's trust score.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_lifecycle_state_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_lifecycle_state_check CHECK (
  lifecycle_state IN (
    'SUBMITTED','LISTED','SOLD','LABEL_ISSUED','PICKED_UP','IN_TRANSIT_INBOUND',
    'RECEIVED_AT_HUB','ACCEPTED','PAYOUT_SENT','REPACKED','SHIPPED_OUTBOUND',
    'DELIVERED','EXPIRED','FAILED'
  )
);

CREATE OR REPLACE FUNCTION public.lifecycle_can_move(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_to = 'FAILED' THEN p_from <> 'DELIVERED'
    -- Only a live listing can lapse, and nothing comes back from it.
    WHEN p_to = 'EXPIRED' THEN p_from = 'LISTED'
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

ALTER TABLE public.acquisitions
  -- Set at acceptance, which is when the listing window starts. Not at
  -- submission and not when the offer went out: MODEL.md §5 is explicit that
  -- these are two separate clocks.
  ADD COLUMN IF NOT EXISTS listing_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS listing_expired_at timestamptz,
  -- Unanswered possession checks in a row. Reset by any answer.
  ADD COLUMN IF NOT EXISTS possession_nonresponses int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS possession_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delisted_reason text;

CREATE INDEX IF NOT EXISTS acquisitions_listing_expires_idx
  ON public.acquisitions (listing_expires_at)
  WHERE listing_expires_at IS NOT NULL AND listing_expired_at IS NULL;

-- Acceptance now starts the listing window as well as listing the item.
CREATE OR REPLACE FUNCTION public.list_on_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d int;
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    SELECT listing_window_days INTO d FROM public.acquisition_config WHERE id = 1;
    NEW.listing_expires_at := now() + make_interval(days => COALESCE(d, 45));
    -- Accepting is itself a statement that they have the item.
    NEW.possession_confirmed_at := now();
    NEW.possession_nonresponses := 0;

    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET lifecycle_state = 'LISTED', lifecycle_updated_at = now()
     WHERE id = NEW.listing_id AND lifecycle_state = 'SUBMITTED';
    PERFORM set_config('zarketplace.internal', 'off', true);
  END IF;
  RETURN NEW;
END $fn$;

-- ---------------------------------------------------------------------------
-- "Do you still have it?"
-- ---------------------------------------------------------------------------
-- One row per asking. The token is the whole authentication: it arrives in the
-- vendor's inbox and answers one question about one item, so it carries no
-- session and grants nothing else.
CREATE TABLE IF NOT EXISTS public.possession_checks (
  id bigserial PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- After this, silence is treated as a non-response.
  due_at timestamptz NOT NULL,
  responded_at timestamptz,
  response text CHECK (response IS NULL OR response IN ('yes','no')),
  counted_as_nonresponse boolean NOT NULL DEFAULT false,
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS possession_checks_listing_idx ON public.possession_checks (listing_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS possession_checks_open_idx ON public.possession_checks (due_at)
  WHERE responded_at IS NULL AND counted_as_nonresponse = false;

ALTER TABLE public.possession_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS possession_checks_admin ON public.possession_checks;
CREATE POLICY possession_checks_admin ON public.possession_checks
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS possession_checks_vendor_select ON public.possession_checks;
CREATE POLICY possession_checks_vendor_select ON public.possession_checks FOR SELECT
  USING (vendor_id = auth.uid() OR public.is_admin());

-- Answering. Callable by anyone holding the token, because the link is opened
-- from an email and we will not make someone sign in to say "yes, still here".
-- It reveals nothing: a wrong token is indistinguishable from an expired one.
CREATE OR REPLACE FUNCTION public.respond_to_possession_check(p_token uuid, p_response text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE chk public.possession_checks; v_title text;
BEGIN
  IF p_response NOT IN ('yes','no') THEN
    RAISE EXCEPTION 'Answer must be yes or no';
  END IF;

  SELECT * INTO chk FROM public.possession_checks WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;

  SELECT title INTO v_title FROM public.listings WHERE id = chk.listing_id;

  IF chk.responded_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true,
                              'response', chk.response, 'item_title', v_title);
  END IF;

  UPDATE public.possession_checks
     SET responded_at = now(), response = p_response
   WHERE id = chk.id;

  IF p_response = 'yes' THEN
    -- Any answer clears the run of silence, including a late one.
    UPDATE public.acquisitions
       SET possession_confirmed_at = now(), possession_nonresponses = 0
     WHERE listing_id = chk.listing_id;
  ELSE
    -- They no longer have it. That is not a failure, it is information, and the
    -- listing has to come down before somebody buys it.
    UPDATE public.acquisitions
       SET possession_nonresponses = 0,
           delisted_reason = 'vendor_no_longer_has_item',
           listing_expired_at = now()
     WHERE listing_id = chk.listing_id;

    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET status = 'archived',
           lifecycle_state = CASE WHEN lifecycle_state = 'LISTED' THEN 'EXPIRED' ELSE lifecycle_state END,
           lifecycle_updated_at = now()
     WHERE id = chk.listing_id;
    PERFORM set_config('zarketplace.internal', 'off', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false,
                            'response', p_response, 'item_title', v_title);
END $fn$;

REVOKE ALL ON FUNCTION public.respond_to_possession_check(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.respond_to_possession_check(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- The sweep. Idempotent, so running it twice in a day changes nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_listing_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cfg public.acquisition_config;
  v_expired int := 0; v_asked int := 0; v_missed int := 0; v_delisted int := 0;
  r record;
BEGIN
  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;

  -- 1. Listings past their 45 days. No supply happened, so nothing to settle.
  FOR r IN
    SELECT a.listing_id FROM public.acquisitions a
     JOIN public.listings l ON l.id = a.listing_id
     WHERE a.offer_status = 'accepted'
       AND a.listing_expired_at IS NULL
       AND a.listing_expires_at IS NOT NULL
       AND a.listing_expires_at < now()
       AND l.is_sold = false
       AND l.lifecycle_state = 'LISTED'
  LOOP
    UPDATE public.acquisitions
       SET listing_expired_at = now(), delisted_reason = 'listing_window_elapsed'
     WHERE listing_id = r.listing_id;
    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET status = 'archived', lifecycle_state = 'EXPIRED', lifecycle_updated_at = now()
     WHERE id = r.listing_id;
    PERFORM set_config('zarketplace.internal', 'off', true);
    PERFORM public.enqueue_vendor_notification(r.listing_id, 'listing_expired', '{}'::jsonb);
    v_expired := v_expired + 1;
  END LOOP;

  -- 2. Unanswered checks that have run out of time become non-responses.
  FOR r IN
    SELECT c.id, c.listing_id FROM public.possession_checks c
     WHERE c.responded_at IS NULL AND c.counted_as_nonresponse = false AND c.due_at < now()
  LOOP
    UPDATE public.possession_checks SET counted_as_nonresponse = true WHERE id = r.id;
    UPDATE public.acquisitions
       SET possession_nonresponses = possession_nonresponses + 1
     WHERE listing_id = r.listing_id;
    v_missed := v_missed + 1;
  END LOOP;

  -- 3. Two in a row and the listing comes down. We cannot sell a buyer
  --    something we are no longer sure exists.
  FOR r IN
    SELECT a.listing_id FROM public.acquisitions a
     JOIN public.listings l ON l.id = a.listing_id
     WHERE a.possession_nonresponses >= cfg.possession_strikes
       AND a.listing_expired_at IS NULL
       AND l.lifecycle_state = 'LISTED'
       AND l.is_sold = false
  LOOP
    UPDATE public.acquisitions
       SET listing_expired_at = now(), delisted_reason = 'no_response_to_possession_checks'
     WHERE listing_id = r.listing_id;
    PERFORM set_config('zarketplace.internal', 'on', true);
    UPDATE public.listings
       SET status = 'archived', lifecycle_state = 'EXPIRED', lifecycle_updated_at = now()
     WHERE id = r.listing_id;
    PERFORM set_config('zarketplace.internal', 'off', true);
    PERFORM public.enqueue_vendor_notification(r.listing_id, 'delisted_no_response', '{}'::jsonb);
    v_delisted := v_delisted + 1;
  END LOOP;

  -- 4. Ask anyone who is due. One open question per listing at a time.
  FOR r IN
    SELECT a.listing_id, a.vendor_id FROM public.acquisitions a
     JOIN public.listings l ON l.id = a.listing_id
     WHERE a.offer_status = 'accepted'
       AND a.listing_expired_at IS NULL
       AND l.lifecycle_state = 'LISTED'
       AND l.is_sold = false
       AND NOT EXISTS (
         SELECT 1 FROM public.possession_checks c
          WHERE c.listing_id = a.listing_id
            AND c.responded_at IS NULL AND c.counted_as_nonresponse = false)
       AND COALESCE(
             (SELECT max(c.sent_at) FROM public.possession_checks c WHERE c.listing_id = a.listing_id),
             a.accepted_at
           ) < now() - make_interval(days => cfg.possession_check_days)
  LOOP
    INSERT INTO public.possession_checks (listing_id, vendor_id, due_at)
    VALUES (r.listing_id, r.vendor_id, now() + make_interval(days => cfg.possession_grace_days));

    PERFORM public.enqueue_vendor_notification(r.listing_id, 'possession_check',
      jsonb_build_object(
        'token', (SELECT token FROM public.possession_checks
                   WHERE listing_id = r.listing_id ORDER BY sent_at DESC LIMIT 1),
        'due_at', now() + make_interval(days => cfg.possession_grace_days)));
    v_asked := v_asked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', v_expired, 'asked', v_asked,
    'missed', v_missed, 'delisted', v_delisted, 'ran_at', now());
END $fn$;

REVOKE ALL ON FUNCTION public.run_listing_maintenance() FROM anon, authenticated;

-- The two new things we send a vendor.
ALTER TABLE public.vendor_notifications DROP CONSTRAINT IF EXISTS vendor_notifications_kind_check;
ALTER TABLE public.vendor_notifications ADD CONSTRAINT vendor_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'item_submitted','offer_made','offer_rejected','item_sold','label_issued',
    'ship_by_reminder','received_at_hub','accepted','payout_sent','refused',
    'abandonment_30','abandonment_7','vendor_cancelled',
    'possession_check','listing_expired','delisted_no_response'
  ]));

-- The vendor's own view gains the window and the possession state, so their
-- dashboard can show what is expected of them. Still no resale price.
DROP VIEW IF EXISTS public.vendor_offers;
CREATE VIEW public.vendor_offers WITH (security_invoker = false) AS
  SELECT
    a.listing_id, a.asking_price, a.offer_amount, a.offer_status, a.intake_status,
    a.review_note, a.review_reasons, a.reviewed_at, a.offer_round,
    a.not_accepted_reason, a.not_accepted_at, a.offered_at, a.offer_expires_at,
    a.accepted_at, a.paid_at, a.ship_by_deadline, a.lane,
    a.listing_expires_at, a.listing_expired_at, a.delisted_reason,
    a.possession_confirmed_at
  FROM public.acquisitions a
  WHERE a.vendor_id = auth.uid();

REVOKE ALL ON public.vendor_offers FROM anon;
GRANT SELECT ON public.vendor_offers TO authenticated;
