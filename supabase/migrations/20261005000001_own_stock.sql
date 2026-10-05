-- Own stock: items zarketplace has already bought outright (from a thrift
-- source, a bulk lot, a person who sold to us in cash) and holds at the hub.
--
-- They skip the offer entirely: there is no vendor to make an offer to and
-- nothing to accept. What they must still have is the purchase record, because
-- under the margin scheme (Rule 32(5)) GST is paid on resale price minus
-- purchase price, so every item needs what we paid, when, and from whom.
--
-- The acquisition row carries that record: offer_amount is what we paid,
-- source = 'own_stock', lane = 'instant', and intake is already
-- accepted_into_inventory, because the item is on our shelf. No vendor email,
-- no payout, no listing window, no possession checks.
--
-- Also fixes the nightly maintenance for every Instant Ship item (is_verified):
-- an item at our hub is not in a vendor's home, so it must never be asked
-- "do you still have it?" nor be taken down when a vendor's listing window
-- ends.

-- 1. The purchase record.
ALTER TABLE public.acquisitions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'vendor',
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_contact text,
  ADD COLUMN IF NOT EXISTS purchased_on date,
  ADD COLUMN IF NOT EXISTS purchase_note text;

DO $$ BEGIN
  ALTER TABLE public.acquisitions
    ADD CONSTRAINT acquisitions_source_check CHECK (source IN ('vendor', 'own_stock'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Where own stock is held: the address every hub-held listing carries as
--    its pickup address. Set by an operator, not in this file.
ALTER TABLE public.fulfillment_config
  ADD COLUMN IF NOT EXISTS hub_address jsonb;

-- 3. An admin account may list own stock through admin_add_own_stock (which
--    sets zarketplace.internal); it still cannot send items as a vendor.
CREATE OR REPLACE FUNCTION public.refuse_admin_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin()
     AND COALESCE(current_setting('zarketplace.internal', true), 'off') <> 'on' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = CASE TG_TABLE_NAME
        WHEN 'orders' THEN 'Admin accounts cannot place orders. Use a customer account to test buying.'
        ELSE 'Admin accounts cannot send items. Use a vendor account to test selling.'
      END;
  END IF;
  RETURN NEW;
END $function$;

-- 4. No "item received" email for own stock: there is no vendor to tell.
CREATE OR REPLACE FUNCTION public.notify_item_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source = 'own_stock' THEN
    RETURN NULL;
  END IF;
  PERFORM public.enqueue_vendor_notification(NEW.listing_id, 'item_submitted', '{}'::jsonb);
  RETURN NULL;
END $function$;

-- 5. No payout for own stock: it was paid for when it was bought.
CREATE OR REPLACE FUNCTION public.raise_payout_on_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source = 'own_stock' THEN
    RETURN NEW;
  END IF;
  IF NEW.intake_status = 'accepted_into_inventory'
     AND OLD.intake_status IS DISTINCT FROM 'accepted_into_inventory' THEN
    INSERT INTO public.payouts (acquisition_id, vendor_id, amount)
    VALUES (NEW.listing_id, NEW.vendor_id, COALESCE(NEW.offer_amount, 0))
    ON CONFLICT (acquisition_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

-- 6. Nightly maintenance: the listing window and possession checks are about
--    items in a vendor's home. Instant Ship items (is_verified) are at the hub,
--    so all three loops now skip them.
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
     WHERE a.offer_status = 'accepted'
       AND a.listing_expired_at IS NULL
       AND a.listing_expires_at IS NOT NULL
       AND a.listing_expires_at < now()
       AND l.is_sold = false
       AND l.is_verified = false
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
     WHERE a.possession_nonresponses >= cfg.possession_strikes
       AND a.listing_expired_at IS NULL
       AND l.lifecycle_state = 'LISTED'
       AND l.is_sold = false
       AND l.is_verified = false
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
     WHERE a.offer_status = 'accepted'
       AND a.listing_expired_at IS NULL
       AND l.lifecycle_state = 'LISTED'
       AND l.is_sold = false
       AND l.is_verified = false
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

-- 7. Add one item of own stock, live and Instant Ship, in one transaction.
--    p_item: title, brand, description, category, gender, size_type, size,
--            condition, price, sale_price, image_url, image_urls,
--            pit_to_pit_cm, length_cm, sleeve_cm, waist_cm, inseam_cm,
--            outseam_cm, has_flaws, flaws_description, authenticity_confirmed,
--            original_tags_attached
--    p_purchase: amount (what we paid), purchased_on (date), supplier_name,
--            supplier_contact, note
CREATE OR REPLACE FUNCTION public.admin_add_own_stock(p_item jsonb, p_purchase jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_hub jsonb;
  v_id uuid;
  v_sku text;
  v_cost numeric := NULLIF(p_purchase->>'amount', '')::numeric;
  v_price numeric := NULLIF(p_item->>'price', '')::numeric;
  v_category text := NULLIF(p_item->>'category', '');
  v_ship_cat text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an operator can add our own stock';
  END IF;
  IF coalesce(trim(p_item->>'title'), '') = '' THEN RAISE EXCEPTION 'Add a title'; END IF;
  IF coalesce(p_item->>'image_url', '') = '' THEN RAISE EXCEPTION 'Add at least one photo'; END IF;
  IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'Add the price we sell it at'; END IF;
  IF v_cost IS NULL OR v_cost < 0 THEN RAISE EXCEPTION 'Add what we paid for it'; END IF;
  IF coalesce(p_purchase->>'purchased_on', '') = '' THEN RAISE EXCEPTION 'Add the date we bought it'; END IF;
  IF coalesce(trim(p_purchase->>'supplier_name'), '') = '' THEN RAISE EXCEPTION 'Add who we bought it from'; END IF;

  SELECT hub_address INTO v_hub FROM public.fulfillment_config WHERE id = 1;
  IF v_hub IS NULL OR coalesce(v_hub->>'address', '') = '' OR coalesce(v_hub->>'pincode', '') = '' THEN
    RAISE EXCEPTION 'The hub address is not set (fulfillment_config.hub_address)';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  v_ship_cat := CASE v_category
    WHEN 'Bottoms' THEN 'bottoms' WHEN 'Outerwear' THEN 'outerwear'
    WHEN 'Shoes' THEN 'footwear' WHEN 'Accessories' THEN 'accessories' ELSE 'tops' END;

  PERFORM set_config('zarketplace.internal', 'on', true);

  INSERT INTO public.listings (
    seller_id, seller_email, title, brand, description, price, sale_price,
    category, gender, size_type, size, condition, image_url, image_urls,
    shipping_mode, shipping_category, free_shipping, pickup_address,
    pit_to_pit_cm, length_cm, sleeve_cm, waist_cm, inseam_cm, outseam_cm,
    has_flaws, flaws_description, original_tags_attached, authenticity_confirmed,
    is_verified, status
  ) VALUES (
    v_uid, coalesce(v_email, ''), trim(p_item->>'title'), NULLIF(trim(p_item->>'brand'), ''),
    NULLIF(p_item->>'description', ''), v_price, NULLIF(p_item->>'sale_price', '')::numeric,
    v_category, NULLIF(p_item->>'gender', ''), NULLIF(p_item->>'size_type', ''), NULLIF(p_item->>'size', ''),
    NULLIF(p_item->>'condition', ''), p_item->>'image_url',
    CASE WHEN jsonb_typeof(p_item->'image_urls') = 'array' AND jsonb_array_length(p_item->'image_urls') > 0
         THEN ARRAY(SELECT jsonb_array_elements_text(p_item->'image_urls'))
         ELSE ARRAY[p_item->>'image_url'] END,
    'platform', v_ship_cat, true, v_hub,
    NULLIF(p_item->>'pit_to_pit_cm', '')::numeric, NULLIF(p_item->>'length_cm', '')::numeric,
    NULLIF(p_item->>'sleeve_cm', '')::numeric, NULLIF(p_item->>'waist_cm', '')::numeric,
    NULLIF(p_item->>'inseam_cm', '')::numeric, NULLIF(p_item->>'outseam_cm', '')::numeric,
    coalesce((p_item->>'has_flaws')::boolean, false), NULLIF(p_item->>'flaws_description', ''),
    coalesce((p_item->>'original_tags_attached')::boolean, false),
    coalesce((p_item->>'authenticity_confirmed')::boolean, false),
    true, 'pending'
  ) RETURNING id, sku INTO v_id, v_sku;

  INSERT INTO public.acquisitions (
    listing_id, vendor_id, offer_amount, offer_status, offered_at, accepted_at,
    intake_status, received_at, accepted_into_inventory_at, paid_at, lane, source,
    supplier_name, supplier_contact, purchased_on, purchase_note, offer_manually_set
  ) VALUES (
    v_id, v_uid, v_cost, 'accepted', now(), now(),
    'accepted_into_inventory', now(), now(), (p_purchase->>'purchased_on')::date, 'instant', 'own_stock',
    trim(p_purchase->>'supplier_name'), NULLIF(trim(p_purchase->>'supplier_contact'), ''),
    (p_purchase->>'purchased_on')::date, NULLIF(trim(p_purchase->>'note'), ''), true
  );

  UPDATE public.listings
     SET lifecycle_state = 'LISTED', lifecycle_updated_at = now(), status = 'approved'
   WHERE id = v_id;

  PERFORM set_config('zarketplace.internal', 'off', true);

  INSERT INTO public.admin_audit_log (admin_id, admin_email, entity, entity_id, action, new_state, reason)
  VALUES (v_uid, v_email, 'listing', v_id::text, 'own_stock.add',
          jsonb_build_object('sku', v_sku, 'cost', v_cost, 'price', v_price,
                             'supplier', trim(p_purchase->>'supplier_name'), 'purchased_on', p_purchase->>'purchased_on'),
          'Own stock added');

  RETURN jsonb_build_object('id', v_id, 'sku', v_sku);
END $function$;

REVOKE ALL ON FUNCTION public.admin_add_own_stock(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_own_stock(jsonb, jsonb) TO authenticated;
