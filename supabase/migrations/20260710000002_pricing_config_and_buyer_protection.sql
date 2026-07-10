-- Central pricing config + Buyer Protection fee (docs/REALIGNMENT_PLAN.md §0.2, §0.6).
--
-- Buyer Protection is the MVP revenue model: buyers pay 5% of the item price,
-- minimum Rs. 49, no cap, as a separate line item. The parameters live in a
-- single-row pricing_config table so they can be changed without a code
-- deploy, and the fee is computed server-side inside the existing
-- orders_snapshot_from_listing trigger - the same authoritative path that
-- already derives amount/shipping, so a crafted client insert can't
-- under-charge the fee. The client reads pricing_config only to DISPLAY the
-- same number; the charge always comes from the server-derived total_amount.

-- Single-row config table (id is pinned to 1).
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  buyer_protection_percent numeric NOT NULL DEFAULT 5,
  buyer_protection_floor numeric NOT NULL DEFAULT 49,
  buyer_protection_cap numeric,  -- NULL = no cap (MVP has none, see §0.2)
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pricing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
-- Everyone (including anonymous browsers) may read pricing to display fees;
-- only admins may change them.
DROP POLICY IF EXISTS pricing_config_read ON public.pricing_config;
CREATE POLICY pricing_config_read ON public.pricing_config FOR SELECT
  USING (true);
DROP POLICY IF EXISTS pricing_config_admin_write ON public.pricing_config;
CREATE POLICY pricing_config_admin_write ON public.pricing_config FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());

-- Order rows carry the fee that was charged, snapshotted at purchase time so a
-- later config change never rewrites historical orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buyer_protection_fee numeric NOT NULL DEFAULT 0;

-- Single source of the fee formula: max(floor, round(percent% x price)),
-- optionally capped. Whole rupees (round to 0 dp) per §0.2.
CREATE OR REPLACE FUNCTION public.compute_buyer_protection_fee(item_price numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.pricing_config;
  fee numeric;
BEGIN
  SELECT * INTO cfg FROM public.pricing_config WHERE id = 1;
  IF NOT FOUND THEN
    -- Defensive default matching §0.2 if the config row is somehow missing.
    RETURN GREATEST(49, round(0.05 * item_price));
  END IF;
  fee := GREATEST(cfg.buyer_protection_floor, round(cfg.buyer_protection_percent / 100.0 * item_price));
  IF cfg.buyer_protection_cap IS NOT NULL THEN
    fee := LEAST(cfg.buyer_protection_cap, fee);
  END IF;
  RETURN fee;
END;
$$;

-- Re-derives financial fields from the live listing at insert time. Extends
-- the original (migration 20260623000003) to also snapshot the Buyer
-- Protection fee and fold it into total_amount. Service-role / admin inserts
-- still bypass (they set exact values themselves).
CREATE OR REPLACE FUNCTION public.orders_snapshot_from_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.listings;
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id is required';
  END IF;

  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF l.status <> 'approved' OR l.is_sold THEN
    RAISE EXCEPTION 'Listing is not available for purchase';
  END IF;

  NEW.listing_sku := l.sku;
  NEW.listing_title := l.title;
  NEW.listing_image_url := l.image_url;
  NEW.seller_id := l.seller_id;
  NEW.seller_email := l.seller_email;
  NEW.seller_upi_vpa_snapshot := l.seller_upi_vpa;
  NEW.amount := COALESCE(l.sale_price, l.price);
  NEW.shipping_cost := CASE WHEN l.shipping_mode = 'paid' THEN l.shipping_cost ELSE 0 END;
  NEW.buyer_protection_fee := public.compute_buyer_protection_fee(NEW.amount);
  NEW.total_amount := NEW.amount + NEW.shipping_cost + NEW.buyer_protection_fee;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_snapshot_from_listing ON public.orders;
CREATE TRIGGER orders_snapshot_from_listing
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_snapshot_from_listing();
