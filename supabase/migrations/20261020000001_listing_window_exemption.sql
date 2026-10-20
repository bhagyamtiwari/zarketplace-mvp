-- Vendors whose items do not run on the listing clock.
--
-- MODEL.md §5: a vendor keeps the item while it is listed, so we ask every so
-- often whether they still have it, and the listing ends after
-- acquisition_config.listing_window_days (30) if it has not sold. Both rules
-- exist because the item is in someone else's home and we are not paying for
-- it until it sells.
--
-- Neither applies to our own items. Instant Ship stock (listings.is_verified)
-- was already skipped by all three loops, and own-stock acquisitions never get
-- a listing_expires_at because they are inserted as accepted rather than
-- updated into it. What was left is the founder's own pieces, listed through a
-- normal vendor account: real acquisitions, on the clock, about to expire out
-- of the shop for no reason anyone would want.
--
-- A flag on the profile rather than an email in a WHERE clause: the exemption
-- is a fact about an account, and an address in a function is a thing nobody
-- finds when it goes wrong.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exempt_from_listing_window boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.exempt_from_listing_window IS
  'Items from this vendor never expire out of the shop and are never sent a possession check. For our own stock listed through a vendor account, not for ordinary vendors.';

-- Same function as before, with the exemption added to the three loops that
-- act on an item sitting in a vendor''s home: the listing window, the delist
-- after unanswered possession checks, and the asking itself. The second loop
-- only counts a check that was already sent, so it needs no change.
CREATE OR REPLACE FUNCTION public.run_listing_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.acquisition_config;
  v_expired int := 0; v_asked int := 0; v_missed int := 0; v_delisted int := 0;
  r record; v_token uuid; v_due timestamptz;
BEGIN
  SELECT * INTO cfg FROM public.acquisition_config WHERE id = 1;

  FOR r IN
    SELECT a.listing_id FROM public.acquisitions a
     JOIN public.listings l ON l.id = a.listing_id
     LEFT JOIN public.profiles p ON p.id = a.vendor_id
     WHERE a.offer_status = 'accepted'
       AND a.listing_expired_at IS NULL
       AND a.listing_expires_at IS NOT NULL
       AND a.listing_expires_at < now()
       AND l.is_sold = false
       AND l.is_verified = false
       AND l.lifecycle_state = 'LISTED'
       AND NOT COALESCE(p.exempt_from_listing_window, false)
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

  FOR r IN
    SELECT a.listing_id FROM public.acquisitions a
     JOIN public.listings l ON l.id = a.listing_id
     LEFT JOIN public.profiles p ON p.id = a.vendor_id
     WHERE a.possession_nonresponses >= cfg.possession_strikes
       AND a.listing_expired_at IS NULL
       AND l.lifecycle_state = 'LISTED'
       AND l.is_sold = false
       AND l.is_verified = false
       AND NOT COALESCE(p.exempt_from_listing_window, false)
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

  FOR r IN
    SELECT a.listing_id, a.vendor_id FROM public.acquisitions a
     JOIN public.listings l ON l.id = a.listing_id
     LEFT JOIN public.profiles p ON p.id = a.vendor_id
     WHERE a.offer_status = 'accepted'
       AND a.listing_expired_at IS NULL
       AND l.lifecycle_state = 'LISTED'
       AND l.is_sold = false
       AND l.is_verified = false
       AND NOT COALESCE(p.exempt_from_listing_window, false)
       AND NOT EXISTS (
         SELECT 1 FROM public.possession_checks c
          WHERE c.listing_id = a.listing_id
            AND c.responded_at IS NULL AND c.counted_as_nonresponse = false)
       AND COALESCE(
             (SELECT max(c.sent_at) FROM public.possession_checks c WHERE c.listing_id = a.listing_id),
             a.accepted_at
           ) < now() - make_interval(days => cfg.possession_check_days)
  LOOP
    v_due := now() + make_interval(days => cfg.possession_grace_days);
    INSERT INTO public.possession_checks (listing_id, vendor_id, due_at)
    VALUES (r.listing_id, r.vendor_id, v_due)
    RETURNING token INTO v_token;

    PERFORM public.enqueue_vendor_notification(r.listing_id, 'possession_check',
      jsonb_build_object('token', v_token, 'due_at', v_due));
    v_asked := v_asked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', v_expired, 'asked', v_asked,
    'missed', v_missed, 'delisted', v_delisted, 'ran_at', now());
END $function$;

-- The founder's own account. Its items are our stock in all but the table they
-- are recorded in.
UPDATE public.profiles p
   SET exempt_from_listing_window = true
  FROM auth.users u
 WHERE u.id = p.id AND lower(u.email) = 'btiwarinine@gmail.com';
