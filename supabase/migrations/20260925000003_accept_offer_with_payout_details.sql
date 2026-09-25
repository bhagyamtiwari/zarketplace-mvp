-- Accepting an offer now also collects what we need to pay the vendor, and to
-- raise the purchase invoice if we buy the item: their full name, mobile
-- number and UPI ID, beside the collection address it already asked for.
--
-- Until now nothing in the flow asked for a UPI ID before we owed money.
-- hub_advance() pays whatever vendors.upi_vpa holds, and that row is copied
-- from the profile once, at the vendor's first submission, and never
-- refreshed: an ID typed later, or never typed, did not reach it.
--
-- The UPI ID is confirmed at the vendor's first acceptance (typed twice on the
-- page) and fixed from then on. Later acceptances show it and cannot change
-- it, and neither can the vendor through the API: vendors.upi_vpa is pinned
-- like the standing columns already were. To change it, they contact us.
--
-- Added as a second signature rather than a replacement, so the site that is
-- live while this is applied keeps accepting with the old call (the new one
-- has three required arguments the old call does not send, so the two never
-- compete). The old signature is dropped once the new site is live
-- (20260925000004).

-- Who agreed, and where we pay them, exactly as given at acceptance.
ALTER TABLE public.listing_agreements
  ADD COLUMN IF NOT EXISTS vendor_details jsonb;

COMMENT ON COLUMN public.listing_agreements.vendor_details IS
  'As given at acceptance, for the purchase invoice: full_name, phone, email, upi_vpa, pickup_address. Null before 2026-09-25.';

CREATE OR REPLACE FUNCTION public.accept_acquisition_offer(
  p_listing_id uuid,
  p_terms_version text,
  p_terms_text jsonb,
  p_full_name text,
  p_phone text,
  p_upi_vpa text,
  p_user_agent text DEFAULT NULL,
  p_pickup_address text DEFAULT NULL,
  p_pickup_landmark text DEFAULT NULL,
  p_pickup_city text DEFAULT NULL,
  p_pickup_pincode text DEFAULT NULL,
  p_pickup_state text DEFAULT NULL,
  p_pickup_state_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  acq public.acquisitions;
  prof public.profiles;
  existing jsonb;
  v_name text := NULLIF(regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g'), '');
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_upi text := lower(btrim(COALESCE(p_upi_vpa, '')));
  v_locked boolean;
  v_email text;
  v_addr text; v_landmark text; v_pin text; v_state text; v_code text; v_city text;
  v_pickup jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;

  SELECT * INTO acq FROM public.acquisitions WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No offer for that listing'; END IF;
  IF acq.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'That offer is not yours to accept'; END IF;
  IF acq.offer_status = 'accepted' THEN RAISE EXCEPTION 'You have already accepted this offer'; END IF;
  IF acq.offer_status <> 'offered' THEN RAISE EXCEPTION 'There is no open offer on this item'; END IF;
  IF acq.offer_expires_at IS NOT NULL AND acq.offer_expires_at < now() THEN
    UPDATE public.acquisitions SET offer_status = 'expired' WHERE listing_id = p_listing_id;
    RAISE EXCEPTION 'This offer has expired. Contact us and we will look at it again.';
  END IF;

  -- Who they are: for the invoice, and for the courier at collection.
  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Enter your full name.';
  END IF;
  IF length(v_phone) = 12 AND left(v_phone, 2) = '91' THEN v_phone := right(v_phone, 10); END IF;
  IF length(v_phone) = 11 AND left(v_phone, 1) = '0' THEN v_phone := right(v_phone, 10); END IF;
  IF v_phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Enter your 10-digit mobile number.';
  END IF;

  -- Where we pay them: confirmed at the first acceptance, then fixed.
  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  v_locked := prof.payout_locked_at IS NOT NULL AND prof.default_upi_vpa IS NOT NULL;
  IF v_locked THEN
    IF v_upi <> '' AND v_upi <> lower(prof.default_upi_vpa) THEN
      RAISE EXCEPTION 'Your UPI ID is already on file. To change it, contact us.';
    END IF;
    v_upi := prof.default_upi_vpa;
  ELSIF v_upi !~ '^[a-z0-9._-]{2,255}@[a-z]{2,64}$' THEN
    RAISE EXCEPTION 'Enter a valid UPI ID, like name@okaxis.';
  END IF;
  v_email := COALESCE(prof.email, (SELECT email FROM auth.users WHERE id = auth.uid()));

  -- Where the courier collects from, as before, now with a landmark.
  SELECT pickup_address INTO existing FROM public.listings WHERE id = p_listing_id;
  v_addr     := COALESCE(NULLIF(btrim(COALESCE(p_pickup_address, '')), ''), existing->>'address');
  v_landmark := NULLIF(btrim(COALESCE(p_pickup_landmark, '')), '');
  v_pin      := COALESCE(NULLIF(btrim(COALESCE(p_pickup_pincode, '')), ''), existing->>'pincode');
  v_city     := COALESCE(NULLIF(btrim(COALESCE(p_pickup_city, '')), ''), existing->>'city');
  v_state    := COALESCE(NULLIF(btrim(COALESCE(p_pickup_state, '')), ''), existing->>'state');
  v_code     := NULLIF(btrim(COALESCE(p_pickup_state_code, '')), '');
  IF v_addr IS NULL OR v_city IS NULL OR v_state IS NULL
     OR v_pin IS NULL OR v_pin !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'We need the address, city, state and pincode the courier should collect from.';
  END IF;
  v_pickup := jsonb_build_object(
    'fullName', v_name, 'phone', '+91' || v_phone,
    'address', v_addr, 'landmark', COALESCE(v_landmark, ''),
    'city', v_city, 'state', v_state, 'pincode', v_pin);

  PERFORM set_config('zarketplace.internal', 'on', true);

  UPDATE public.listings
     SET pickup_address = COALESCE(existing, '{}'::jsonb) || v_pickup,
         pickup_pincode = v_pin,
         pickup_state = COALESCE(v_state, pickup_state),
         pickup_state_code = COALESCE(v_code, pickup_state_code),
         seller_upi_vpa = v_upi,
         seller_display_name = v_name
   WHERE id = p_listing_id;

  UPDATE public.profiles
     SET full_name = v_name,
         phone = '+91' || v_phone,
         default_upi_vpa = CASE WHEN v_locked THEN default_upi_vpa ELSE v_upi END,
         payout_locked_at = COALESCE(payout_locked_at, now()),
         pickup_address = v_pickup
   WHERE id = auth.uid();

  -- The row hub_advance() pays from.
  UPDATE public.vendors
     SET full_name = v_name,
         phone = '+91' || v_phone,
         upi_vpa = CASE WHEN v_locked THEN COALESCE(upi_vpa, v_upi) ELSE v_upi END,
         pickup_address = v_pickup
   WHERE id = auth.uid();
  IF NOT FOUND THEN
    INSERT INTO public.vendors (id, email, full_name, phone, upi_vpa, pickup_address)
    VALUES (auth.uid(), v_email, v_name, '+91' || v_phone, v_upi, v_pickup);
  END IF;

  PERFORM set_config('zarketplace.internal', 'off', true);

  INSERT INTO public.listing_agreements (
    listing_id, vendor_id, offer_amount, offer_round,
    ack_genuine_and_accurate, ack_return_shipping_payable, ack_sixty_day_forfeit,
    terms_version, terms_text, user_agent, vendor_details
  ) VALUES (
    p_listing_id, auth.uid(), acq.offer_amount, COALESCE(acq.offer_round, 1), true, true, true,
    p_terms_version, p_terms_text, p_user_agent,
    jsonb_build_object(
      'full_name', v_name, 'phone', '+91' || v_phone, 'email', v_email,
      'upi_vpa', v_upi, 'pickup_address', v_pickup)
  );

  UPDATE public.acquisitions
     SET offer_status = 'accepted', accepted_at = now()
   WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object('offer_amount', acq.offer_amount, 'accepted_at', now(), 'upi_vpa', v_upi);
END $function$;

REVOKE ALL ON FUNCTION public.accept_acquisition_offer(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_acquisition_offer(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, text) TO authenticated;

-- The acceptance above moves a listing's UPI ID to the one just confirmed.
-- Internal functions may; a vendor on their own still may not.
CREATE OR REPLACE FUNCTION public.listings_lock_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR (OLD.seller_upi_vpa IS NOT NULL AND NEW.seller_upi_vpa IS DISTINCT FROM OLD.seller_upi_vpa)
     OR (OLD.seller_instagram IS NOT NULL AND NEW.seller_instagram IS DISTINCT FROM OLD.seller_instagram) THEN
    IF NOT public.is_admin()
       AND COALESCE(current_setting('zarketplace.internal', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'seller_id, seller_upi_vpa and seller_instagram are immutable on listings';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Where we pay a vendor changes only through us once it is set. The vendors
-- row was open to its owner's updates in full, payout details included.
CREATE OR REPLACE FUNCTION public.protect_vendor_standing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin()
     AND coalesce(current_setting('zarketplace.internal', true), '') <> 'on' THEN
    NEW.trust_score        := OLD.trust_score;
    NEW.listing_restricted := OLD.listing_restricted;
    NEW.restricted_at      := OLD.restricted_at;
    NEW.restricted_reason  := OLD.restricted_reason;
    NEW.banned             := OLD.banned;
    NEW.banned_at          := OLD.banned_at;
    NEW.banned_reason      := OLD.banned_reason;
    IF OLD.upi_vpa IS NOT NULL THEN
      NEW.upi_vpa := OLD.upi_vpa;
    END IF;
    IF OLD.bank_account_number IS NOT NULL THEN
      NEW.bank_account_name   := OLD.bank_account_name;
      NEW.bank_account_number := OLD.bank_account_number;
      NEW.bank_ifsc           := OLD.bank_ifsc;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
