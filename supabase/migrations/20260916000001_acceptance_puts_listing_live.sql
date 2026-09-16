-- Acceptance is what puts an item on the site.
--
-- Before this, accepting an offer set lifecycle_state to LISTED but left
-- status at 'pending' on a first listing, waiting for a second operator
-- approval. The storefront reads status = 'approved'. So a seller accepted an
-- offer, was told the item was live, and it was not on the site at all. Only a
-- relist (coming back from 'archived') was put live automatically.
--
-- The second approval was redundant: the operator who sends the offer is the
-- one who reviewed and priced the item. There is nothing left for them to
-- decide once the seller says yes.
CREATE OR REPLACE FUNCTION public.list_after_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    PERFORM set_config('zarketplace.internal', 'on', true);

    UPDATE public.listings
       SET lifecycle_state = 'LISTED',
           lifecycle_updated_at = now()
     WHERE id = NEW.listing_id
       AND lifecycle_state IN ('SUBMITTED','EXPIRED');

    -- Separate statement, and deliberately not gated on lifecycle_state: an
    -- item already LISTED but still pending is exactly the stuck case this is
    -- meant to clear.
    UPDATE public.listings
       SET status = 'approved'
     WHERE id = NEW.listing_id
       AND status IN ('pending','archived');

    PERFORM set_config('zarketplace.internal', 'off', true);
  END IF;
  RETURN NULL;
END $function$;


-- Moving the go-live to acceptance moves the risk with it. require_measurements
-- raises when status becomes 'approved', which now happens inside the seller's
-- acceptance: a missing measurement would turn "accept your offer" into a hard
-- error the seller can do nothing about.
--
-- So the check moves to where it can be acted on. An operator cannot send an
-- offer on an item that could not go live, and they can fix it on the spot.
--
-- The other two approval guards need no equivalent. The pickup address is
-- collected and validated by accept_acquisition_offer itself, before the
-- acquisition row is touched; and listings_require_positive_payout already
-- fires on the price write inside this function, so it is caught at offer time
-- as it stands.
CREATE OR REPLACE FUNCTION public.make_acquisition_offer(p_listing_id uuid, p_offer numeric, p_expected_resale numeric DEFAULT NULL::numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cfg public.acquisition_config; model jsonb; model_amount numeric; st text; v_expires timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an operator may make an offer'; END IF;
  IF p_offer IS NULL OR p_offer <= 0 THEN RAISE EXCEPTION 'An offer has to be a positive rupee amount'; END IF;
  IF p_expected_resale IS NULL OR p_expected_resale <= 0 THEN
    RAISE EXCEPTION 'Set what we expect to resell this for. It becomes the listed price, and without it the item would go live at the vendor''s own number.';
  END IF;
  IF p_offer >= p_expected_resale THEN
    RAISE EXCEPTION 'The offer cannot be at or above the resale price';
  END IF;

  SELECT offer_status INTO st FROM public.acquisitions WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No acquisition record for that listing'; END IF;
  IF st = 'accepted' THEN RAISE EXCEPTION 'This item has already been accepted at a locked amount'; END IF;
  IF st = 'offered' THEN RAISE EXCEPTION 'There is already an open offer on this item'; END IF;

  PERFORM 1 FROM public.listings l
   WHERE l.id = p_listing_id
     AND l.created_at >= TIMESTAMPTZ '2026-09-12 23:30:00+00'
     AND l.category IN ('Tops','Outerwear')
     AND (l.pit_to_pit_cm IS NULL OR l.length_cm IS NULL);
  IF FOUND THEN
    RAISE EXCEPTION 'This item needs pit-to-pit and length in centimetres before an offer goes out. Accepting the offer is what puts it live, and it cannot go live without them.';
  END IF;

  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;
  model := public.compute_acquisition_offer(p_expected_resale);
  model_amount := (model->>'offer_amount')::numeric;
  v_expires := now() + make_interval(days => cfg.offer_valid_days);

  UPDATE public.acquisitions
     SET expected_resale = p_expected_resale,
         offer_amount = floor(p_offer),
         model_offer_amount = model_amount,
         offer_manually_set = (floor(p_offer) <> model_amount),
         offer_breakdown = model,
         offer_status = 'offered', offered_at = now(), reviewed_at = now(),
         review_note = NULL, review_reasons = NULL,
         offer_expires_at = v_expires
   WHERE listing_id = p_listing_id;

  PERFORM set_config('zarketplace.internal', 'on', true);
  UPDATE public.listings
     SET price = floor(p_expected_resale), sale_price = NULL
   WHERE id = p_listing_id;
  PERFORM set_config('zarketplace.internal', 'off', true);

  PERFORM public.enqueue_vendor_notification(p_listing_id, 'offer_made',
    jsonb_build_object('offer_amount', floor(p_offer), 'expires_at', v_expires));

  RETURN jsonb_build_object('offer_amount', floor(p_offer), 'model_offer_amount', model_amount);
END $function$;
