-- Package profiles: honest weight and dimensions per shipping category,
-- snapshotted onto every order at purchase time.
--
-- WHY: shiprocket-create-order declared a single hardcoded 30x25x5 cm box for
-- every parcel (0.75 kg volumetric) plus a category-guessed weight. Couriers
-- bill max(actual, volumetric), so shoes and jackets were systematically
-- under-declared and re-weighed at the hub, eating a shipping margin that is
-- only Rs. 10-24 per order. The seller is never asked for measurements: the
-- shipping category they already pick IS the package profile.
--
-- !!! APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR, AS ONE SCRIPT. !!!
-- The migration ledger has drifted from this repo (see docs/), so `db push`
-- is not the path here.
--
-- !!! CRITICAL - READ BEFORE EDITING orders_snapshot_from_listing BELOW. !!!
-- The copy of orders_snapshot_from_listing() in this repo's earlier migrations
-- is STALE: it predates the free_shipping work, which was applied to
-- production out of band. The body below was dumped from the LIVE database on
-- 2026-07-29 and then extended. Do NOT regenerate it from an older migration
-- file: doing so silently drops the free_shipping branch and starts charging
-- buyers for shipping on free-delivery listings again.
-- Verify after applying: place a free-delivery order and confirm
-- total_amount excludes shipping.

begin;

-- 1. Package profile per shipping category ----------------------------------
-- Defaults match the old hardcoded constants so the ALTER is safe on existing
-- rows; the seeds below then correct them.
alter table public.shipping_categories
  add column if not exists default_weight_kg numeric not null default 0.5,
  add column if not exists pkg_length_cm  integer not null default 30,
  add column if not exists pkg_breadth_cm integer not null default 25,
  add column if not exists pkg_height_cm  integer not null default 5;

-- Heights are the real fix here: footwear and outerwear were being declared as
-- 5 cm tall, which is what invited the hub re-weigh charges.
update public.shipping_categories set
  default_weight_kg = v.w, pkg_length_cm = v.l, pkg_breadth_cm = v.b, pkg_height_cm = v.h
from (values
  ('accessories', 0.2, 25, 20,  4),
  ('tops',        0.3, 30, 25,  4),
  ('bottoms',     0.5, 30, 25,  6),
  ('footwear',    1.0, 35, 22, 14),
  ('outerwear',   0.8, 35, 28, 10)
) as v(key, w, l, b, h)
where public.shipping_categories.key = v.key;

-- 2. Per-order package snapshot ---------------------------------------------
-- Nullable on purpose: orders placed before this migration keep NULL and the
-- edge function falls back to the live category row, then to its own
-- constants. Snapshotting means a later profile or rate edit can never change
-- what an in-flight or historical order declared - the same immutability
-- orders.shipping_cost already gives the payout math.
alter table public.orders
  add column if not exists package_snapshot jsonb;

comment on column public.orders.package_snapshot is
  'Weight/dimensions/rate captured from shipping_categories at order time. Immutable once shiprocket_order_id is set.';

-- 3. orders_snapshot_from_listing - LIVE body (2026-07-29) + package snapshot -
create or replace function public.orders_snapshot_from_listing()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  l public.listings;
  cat public.shipping_categories;
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

  SELECT * INTO cat FROM public.shipping_categories WHERE key = l.shipping_category;
  IF NOT FOUND OR cat.rate IS NULL THEN
    RAISE EXCEPTION 'Listing has no valid shipping category';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders WHERE listing_id = NEW.listing_id AND status = 'awaiting_payment'
  ) THEN
    RAISE EXCEPTION 'This item is currently reserved by another buyer. Please try again in a few minutes.';
  END IF;

  NEW.listing_sku := l.sku;
  NEW.listing_title := l.title;
  NEW.listing_image_url := l.image_url;
  NEW.seller_id := l.seller_id;
  NEW.seller_email := l.seller_email;
  NEW.seller_upi_vpa_snapshot := l.seller_upi_vpa;
  NEW.pickup_address := l.pickup_address;
  NEW.amount := COALESCE(l.sale_price, l.price);
  NEW.shipping_category := l.shipping_category;
  NEW.shipping_cost := cat.rate;
  NEW.free_shipping := l.free_shipping;
  NEW.buyer_protection_fee := public.compute_buyer_protection_fee(NEW.amount);
  -- Buyer pays shipping only when the seller did NOT offer free shipping.
  NEW.total_amount := NEW.amount + (CASE WHEN l.free_shipping THEN 0 ELSE cat.rate END) + NEW.buyer_protection_fee;
  NEW.reservation_expires_at := now() + interval '20 minutes';
  -- Rate is included alongside the dimensions so one JSON object can
  -- reconstruct a historical order without joining shipping_categories, whose
  -- rates and profiles will change over time.
  NEW.package_snapshot := jsonb_build_object(
    'weight_kg',  cat.default_weight_kg,
    'length_cm',  cat.pkg_length_cm,
    'breadth_cm', cat.pkg_breadth_cm,
    'height_cm',  cat.pkg_height_cm,
    'rate',       cat.rate,
    'source',     'category_estimate'
  );
  RETURN NEW;
END;
$function$;

-- 4. Package data is immutable once the parcel is booked ---------------------
-- Admin corrects estimates from the Pickup Queue while a booking is pending or
-- has failed. After Shiprocket has the order, the declared package is what the
-- courier contracted on, so freeze it. service_role (the edge function) is
-- exempt: it is the thing writing shiprocket_order_id in the first place.
create or replace function public.orders_lock_package_snapshot()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
BEGIN
  IF NEW.package_snapshot IS DISTINCT FROM OLD.package_snapshot
     AND OLD.shiprocket_order_id IS NOT NULL
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'package_snapshot cannot be changed after the shipment is booked';
  END IF;
  RETURN NEW;
END;
$function$;

drop trigger if exists orders_lock_package_snapshot on public.orders;
create trigger orders_lock_package_snapshot
  before update on public.orders
  for each row execute function public.orders_lock_package_snapshot();

commit;
