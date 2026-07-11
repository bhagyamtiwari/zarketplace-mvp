-- =============================================================================
-- Zarketplace clean-slate (no fees, single-stage UPI, buyer proof of payment).
-- This file consolidates and replaces every earlier migration. The earlier
-- pre-consolidation files are available in git history if ever needed.
-- =============================================================================

-- (Wipe step — already applied to remote DB; left here for local resets.)
-- DROP TABLE IF EXISTS public.cart_items, public.seller_payouts, public.orders,
--   public.listings, public.subscribers, public.email_campaigns, public.email_log,
--   public.sellers, public.profiles CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_new_user, public.generate_sku,
--   public.generate_order_number, public.set_updated_at, public.is_admin CASCADE;
-- DELETE FROM auth.users;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  is_admin boolean NOT NULL DEFAULT false,
  default_address jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- listings
CREATE OR REPLACE FUNCTION public.generate_sku()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate text; attempts int := 0;
BEGIN
  IF NEW.sku IS NOT NULL AND NEW.sku <> '' THEN RETURN NEW; END IF;
  LOOP
    candidate := 'ZV-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    PERFORM 1 FROM public.listings WHERE sku = candidate;
    IF NOT FOUND THEN NEW.sku := candidate; RETURN NEW; END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      NEW.sku := 'ZV-' || substr(gen_random_uuid()::text, 1, 8); RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_email text NOT NULL,
  seller_display_name text,
  seller_instagram text NOT NULL,
  seller_upi_vpa text NOT NULL CHECK (seller_upi_vpa ~ '^[A-Za-z0-9._\-]{2,255}@[A-Za-z]{2,64}$'),
  title text NOT NULL,
  brand text,
  description text,
  price numeric NOT NULL,
  sale_price numeric,
  category text,
  gender text,
  size_type text,
  size text,
  condition text,
  image_url text NOT NULL,
  image_urls text[] NOT NULL DEFAULT '{}',
  shipping_mode text NOT NULL DEFAULT 'free' CHECK (shipping_mode IN ('free','paid')),
  shipping_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  is_sold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_status_sold_idx ON public.listings (status, is_sold);
CREATE INDEX IF NOT EXISTS listings_seller_idx ON public.listings (seller_id);
DROP TRIGGER IF EXISTS listings_sku ON public.listings;
CREATE TRIGGER listings_sku BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.generate_sku();
DROP TRIGGER IF EXISTS listings_updated_at ON public.listings;
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.listings_lock_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.seller_upi_vpa IS DISTINCT FROM OLD.seller_upi_vpa
     OR NEW.seller_instagram IS DISTINCT FROM OLD.seller_instagram THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'seller_id, seller_upi_vpa and seller_instagram are immutable on listings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listings_lock_immutable ON public.listings;
CREATE TRIGGER listings_lock_immutable BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_lock_immutable();

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listings_public_select ON public.listings;
DROP POLICY IF EXISTS listings_owner_insert ON public.listings;
DROP POLICY IF EXISTS listings_owner_update ON public.listings;
DROP POLICY IF EXISTS listings_owner_delete ON public.listings;
CREATE POLICY listings_public_select ON public.listings FOR SELECT
  USING ((status = 'approved' AND is_sold = false) OR seller_id = auth.uid() OR public.is_admin());
CREATE POLICY listings_owner_insert ON public.listings FOR INSERT
  WITH CHECK (seller_id = auth.uid());
CREATE POLICY listings_owner_update ON public.listings FOR UPDATE
  USING (seller_id = auth.uid() OR public.is_admin())
  WITH CHECK (seller_id = auth.uid() OR public.is_admin());
CREATE POLICY listings_owner_delete ON public.listings FOR DELETE
  USING (seller_id = auth.uid() OR public.is_admin());

-- cart_items
CREATE TABLE IF NOT EXISTS public.cart_items (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_items_owner_all ON public.cart_items;
CREATE POLICY cart_items_owner_all ON public.cart_items FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- orders
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate text; attempts int := 0;
BEGIN
  IF NEW.order_number IS NOT NULL AND NEW.order_number <> '' THEN RETURN NEW; END IF;
  LOOP
    candidate := 'ZKT-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    PERFORM 1 FROM public.orders WHERE order_number = candidate;
    IF NOT FOUND THEN NEW.order_number := candidate; RETURN NEW; END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      NEW.order_number := 'ZKT-' || substr(gen_random_uuid()::text, 1, 8); RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  listing_sku text,
  listing_title text,
  listing_image_url text,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email text NOT NULL,
  buyer_name text NOT NULL,
  buyer_phone text,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_email text,
  seller_upi_vpa_snapshot text,
  shipping_address jsonb,
  billing_address jsonb,
  amount numeric NOT NULL,
  shipping_cost numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL,
  payment_utr text,
  payment_receipt_url text,
  payment_submitted_at timestamptz,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','awaiting_verification','paid','shipped','cancelled','refunded')),
  tracking_url text,
  tracking_number text,
  courier text,
  package_image_url text,
  shipped_at timestamptz,
  last_nudge_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_proof_required CHECK (
    status = 'awaiting_payment' OR payment_utr IS NOT NULL OR payment_receipt_url IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS orders_buyer_idx ON public.orders (buyer_id);
CREATE INDEX IF NOT EXISTS orders_seller_idx ON public.orders (seller_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
DROP TRIGGER IF EXISTS orders_order_number ON public.orders;
CREATE TRIGGER orders_order_number BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();
DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_buyer_insert ON public.orders;
DROP POLICY IF EXISTS orders_party_select ON public.orders;
DROP POLICY IF EXISTS orders_party_update ON public.orders;
CREATE POLICY orders_buyer_insert ON public.orders FOR INSERT
  WITH CHECK (buyer_id = auth.uid());
CREATE POLICY orders_party_select ON public.orders FOR SELECT
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());
CREATE POLICY orders_party_update ON public.orders FOR UPDATE
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin())
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin());

-- Storage buckets configured separately (see 20260510000002_storage.sql).
