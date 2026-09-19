-- Checkout holds an item for 5 minutes, not 20. Twenty minutes kept one
-- buyer's abandoned checkout blocking everyone else for a third of an hour.
--
-- Two ways a hold now ends early:
--   * the buyer clears their cart or removes the item (release_my_reservations)
--   * the same buyer checks the item out again, which replaces their own
--     earlier hold instead of telling them "reserved by another buyer".
--
-- A hold is released by expiring it and then marking it payment_failed, the
-- same two states a hold that simply ran out passes through, so
-- orders_enforce_transitions allows it for the buyer. Nothing with a payment
-- attached is ever touched.

CREATE OR REPLACE FUNCTION public.release_my_reservations(p_listing_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;

  UPDATE public.orders
     SET reservation_expires_at = now() - interval '1 second'
   WHERE buyer_id = auth.uid()
     AND status = 'awaiting_payment'
     AND razorpay_payment_id IS NULL
     AND (p_listing_ids IS NULL OR listing_id = ANY (p_listing_ids));

  UPDATE public.orders
     SET status = 'payment_failed'
   WHERE buyer_id = auth.uid()
     AND status = 'awaiting_payment'
     AND razorpay_payment_id IS NULL
     AND reservation_expires_at < now()
     AND (p_listing_ids IS NULL OR listing_id = ANY (p_listing_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_my_reservations(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_my_reservations(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.orders_snapshot_from_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l public.listings;
  cat public.shipping_categories;
  self_ship boolean;
  ship_charge numeric;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id is required';
  END IF;

  UPDATE public.orders
    SET status = 'payment_failed'
    WHERE listing_id = NEW.listing_id
      AND status = 'awaiting_payment'
      AND reservation_expires_at < now();

  -- The same buyer checking this item out again replaces their own hold.
  IF NEW.buyer_id IS NOT NULL THEN
    PERFORM public.release_my_reservations(ARRAY[NEW.listing_id]);
  END IF;

  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF l.status <> 'approved' OR l.is_sold THEN
    RAISE EXCEPTION 'Listing is not available for purchase';
  END IF;

  IF NEW.buyer_id IS NOT NULL AND NEW.buyer_id = l.seller_id THEN
    RAISE EXCEPTION 'You cannot buy your own listing';
  END IF;

  self_ship := (l.shipping_mode = 'self_ship');

  SELECT * INTO cat FROM public.shipping_categories WHERE key = l.shipping_category;
  IF NOT FOUND OR cat.rate IS NULL THEN
    RAISE EXCEPTION 'Listing has no valid shipping category';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders WHERE listing_id = NEW.listing_id AND status = 'awaiting_payment'
  ) THEN
    RAISE EXCEPTION 'Someone is checking out with this item right now. It is held for 5 minutes, so try again shortly.';
  END IF;

  ship_charge := CASE
    WHEN self_ship THEN 0
    WHEN l.free_shipping THEN 0
    ELSE cat.rate
  END;

  NEW.listing_sku := l.sku;
  NEW.listing_title := l.title;
  NEW.listing_image_url := l.image_url;
  NEW.seller_id := l.seller_id;
  NEW.seller_email := l.seller_email;
  NEW.seller_upi_vpa_snapshot := l.seller_upi_vpa;
  NEW.pickup_address := l.pickup_address;
  NEW.amount := COALESCE(l.sale_price, l.price);
  NEW.shipping_category := l.shipping_category;
  NEW.shipping_mode := l.shipping_mode;
  NEW.shipping_cost := CASE WHEN self_ship THEN 0 ELSE cat.rate END;
  NEW.free_shipping := l.free_shipping;
  NEW.buyer_protection_fee := public.compute_buyer_protection_fee(NEW.amount);
  NEW.total_amount := NEW.amount + ship_charge + NEW.buyer_protection_fee;
  NEW.reservation_expires_at := now() + interval '5 minutes';
  NEW.package_snapshot := CASE WHEN self_ship THEN
    jsonb_build_object('source', 'self_ship')
  ELSE
    jsonb_build_object(
      'weight_kg',  cat.default_weight_kg,
      'length_cm',  cat.pkg_length_cm,
      'breadth_cm', cat.pkg_breadth_cm,
      'height_cm',  cat.pkg_height_cm,
      'rate',       cat.rate,
      'source',     'category_estimate'
    )
  END;
  RETURN NEW;
END;
$function$;
