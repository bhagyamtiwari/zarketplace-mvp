-- Enforce the intra-state rule on the delivery pincode, not a dropdown.
--
-- Place of supply for goods is where the movement terminates for delivery.
-- The previous check compared the buyer's SELECTED state against the seller's
-- state, so a buyer could pick "Delhi", type a Gurgaon pincode, and complete
-- an inter-state supply an unregistered seller may not make. Delhi, Gurgaon
-- and Noida are one metro to a buyer and three states to GST.
--
-- What changes here:
--   1. GST numeric state codes alongside the existing names. Names stay for
--      display; the code is what any tax or validation logic compares. Names
--      were never safe for that - "Delhi" and "New Delhi" are one state and
--      two strings, and a code is not a spelling.
--   2. A pickup pincode on the listing, so the seller's supply origin is a
--      pincode rather than a typed state.
--   3. State codes snapshotted onto the order, so a historical order stays
--      readable after a seller moves.
--   4. blocked_checkouts, so every refusal is measurable. That log is how the
--      cost of the restriction gets sized and which state to recruit in next.

-- 1. State codes. Kept as a lookup rather than a column on listings, since a
--    state's code never changes and the mapping belongs in one place.
CREATE TABLE IF NOT EXISTS public.gst_states (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE
);

INSERT INTO public.gst_states (code, name) VALUES
  ('01','Jammu and Kashmir'), ('02','Himachal Pradesh'), ('03','Punjab'),
  ('04','Chandigarh'), ('05','Uttarakhand'), ('06','Haryana'), ('07','Delhi'),
  ('08','Rajasthan'), ('09','Uttar Pradesh'), ('10','Bihar'), ('11','Sikkim'),
  ('12','Arunachal Pradesh'), ('13','Nagaland'), ('14','Manipur'),
  ('15','Mizoram'), ('16','Tripura'), ('17','Meghalaya'), ('18','Assam'),
  ('19','West Bengal'), ('20','Jharkhand'), ('21','Odisha'),
  ('22','Chhattisgarh'), ('23','Madhya Pradesh'), ('24','Gujarat'),
  ('26','Dadra and Nagar Haveli and Daman and Diu'), ('27','Maharashtra'),
  ('29','Karnataka'), ('30','Goa'), ('31','Lakshadweep'), ('32','Kerala'),
  ('33','Tamil Nadu'), ('34','Puducherry'), ('35','Andaman and Nicobar Islands'),
  ('36','Telangana'), ('37','Andhra Pradesh'), ('38','Ladakh')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.gst_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gst_states_public_read ON public.gst_states;
CREATE POLICY gst_states_public_read ON public.gst_states FOR SELECT USING (true);
GRANT SELECT ON public.gst_states TO anon, authenticated;

-- 2. The seller's supply origin, as a pincode. Nullable for now: the six rows
--    on file are backfilled below, but making it NOT NULL is a separate step
--    once the listing form has been shipping it for a while.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pickup_pincode text;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_pickup_pincode_format;
ALTER TABLE public.listings ADD CONSTRAINT listings_pickup_pincode_format
  CHECK (pickup_pincode IS NULL OR pickup_pincode ~ '^[1-9][0-9]{5}$');

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pickup_state_code text
  REFERENCES public.gst_states(code);

-- Backfill: every current listing is BT's own stock, picked up from 110085
-- (Rohini, Delhi). Confirmed by him rather than inferred from the address.
UPDATE public.listings
SET pickup_pincode = COALESCE(pickup_pincode, '110085')
WHERE pickup_pincode IS NULL;

UPDATE public.listings l
SET pickup_state_code = g.code
FROM public.gst_states g
WHERE l.pickup_state_code IS NULL AND g.name = l.pickup_state;

-- 3. Order snapshots. Written at creation and never recomputed, so a seller
--    changing state later cannot rewrite what was true at the time.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_state_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_delivery_state_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_delivery_pincode text;

-- 4. Every refusal, logged. Service-role writes only; admins read.
CREATE TABLE IF NOT EXISTS public.blocked_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  buyer_id uuid,
  listing_id uuid,
  seller_id uuid,
  attempted_pincode text,
  resolved_state_code text,
  resolved_state_name text,
  seller_state_code text,
  seller_state_name text,
  reason text NOT NULL,
  item_value numeric
);

CREATE INDEX IF NOT EXISTS blocked_checkouts_created_idx
  ON public.blocked_checkouts (created_at DESC);
CREATE INDEX IF NOT EXISTS blocked_checkouts_state_idx
  ON public.blocked_checkouts (resolved_state_code, seller_state_code);

ALTER TABLE public.blocked_checkouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blocked_checkouts_admin_read ON public.blocked_checkouts;
CREATE POLICY blocked_checkouts_admin_read ON public.blocked_checkouts
  FOR SELECT USING (public.is_admin());

-- 5. Expose the pincode and code on the buyer-facing view. pickup_pincode is
--    the seller's collection point, not their home address - the full address
--    stays out of the view as before.
CREATE OR REPLACE VIEW public.public_listings AS
SELECT
  id, sku, seller_id, seller_display_name, seller_instagram, title, brand,
  description, price, sale_price, category, gender, size_type, size, condition,
  image_url, image_urls, shipping_category, has_flaws, flaws_description,
  original_tags_attached, original_packaging, item_altered, wear_frequency,
  authenticity_confirmed, seller_declared_at, status, is_sold, created_at,
  updated_at, free_shipping, pickup_state, shipping_mode, pickup_pincode,
  pickup_state_code
FROM public.listings
WHERE status = 'approved' AND is_sold = false;

GRANT SELECT ON public.public_listings TO anon, authenticated;
