-- Migration: Create orders and seller_payouts tables
-- Run this in Supabase SQL Editor

-- ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,

  -- Listing reference
  listing_id TEXT NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  listing_sku TEXT,
  listing_title TEXT,
  listing_image_url TEXT,

  -- Buyer details
  buyer_email TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT,
  shipping_address JSONB NOT NULL,
  billing_address JSONB,

  -- Seller
  seller_email TEXT NOT NULL,

  -- Pricing (in INR; stored as integers, paise-free for INR rounded values)
  amount NUMERIC(10,2) NOT NULL,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  seller_payout_amount NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Order lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','shipped','delivered','cancelled','refunded')),

  -- Shipping/tracking
  tracking_number TEXT,
  courier_name TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Cashfree details
  cashfree_order_id TEXT,
  cashfree_payment_session_id TEXT,
  payment_status TEXT,
  payment_method TEXT,
  payment_completed_at TIMESTAMPTZ,
  cashfree_payment_response JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON public.orders(LOWER(buyer_email));
CREATE INDEX IF NOT EXISTS idx_orders_seller_email ON public.orders(LOWER(seller_email));
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_listing_id ON public.orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Function to generate order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_num TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_num := 'ZKT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_num);
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique order_number';
    END IF;
  END LOOP;
  RETURN v_num;
END;
$$;

-- Trigger to auto-set order_number
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := public.generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_number ON public.orders;
CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();


-- SELLER PAYOUTS TABLE
CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_email TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','released','held','cancelled')),
  hold_reason TEXT,
  released_at TIMESTAMPTZ,
  released_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_payouts_seller_email ON public.seller_payouts(LOWER(seller_email));
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.seller_payouts(status);

DROP TRIGGER IF EXISTS trg_payouts_updated_at ON public.seller_payouts;
CREATE TRIGGER trg_payouts_updated_at
  BEFORE UPDATE ON public.seller_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
