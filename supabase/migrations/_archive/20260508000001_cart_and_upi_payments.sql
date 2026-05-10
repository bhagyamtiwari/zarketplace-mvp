-- Migration: Cart persistence + UPI two-stage payment fields
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.cart_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id   UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items(user_id);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own cart read" ON public.cart_items;
CREATE POLICY "own cart read"  ON public.cart_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own cart write" ON public.cart_items;
CREATE POLICY "own cart write" ON public.cart_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Listing shipping mode (existing shipping_cost stays; 0 = free)
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT NOT NULL DEFAULT 'free'
    CHECK (shipping_mode IN ('free','paid'));

-- Orders: UPI two-stage payment fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_utr     TEXT,
  ADD COLUMN IF NOT EXISTS seller_utr       TEXT,
  ADD COLUMN IF NOT EXISTS platform_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seller_paid_at   TIMESTAMPTZ;

-- Extend status enum to include intermediate UPI states
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD  CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'awaiting_platform_payment',
    'awaiting_seller_payment',
    'awaiting_verification',
    'paid','shipped','delivered','cancelled','refunded'
  ));
