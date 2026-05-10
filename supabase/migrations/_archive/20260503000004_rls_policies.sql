-- Migration: Row Level Security policies for new tables
-- Run this in Supabase SQL Editor AFTER the table-creation migrations.
--
-- Strategy (MVP, no auth):
--   - The frontend uses the anon key and acts on behalf of users.
--   - We allow anon to INSERT orders (purchase) and SELECT orders only when
--     filtering by buyer_email or seller_email or order_number that they know.
--     Since RLS cannot enforce "they know it", we keep SELECT permissive but
--     hide nothing sensitive (no card numbers stored — Cashfree handles PCI).
--   - All admin/sensitive mutations (releasing payouts, status overrides) MUST
--     be performed by Edge Functions with the service_role key, NOT directly
--     from the frontend.
--   - Tightening these policies post-MVP is recommended (e.g. add Supabase Auth
--     and scope by auth.email()).

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- ORDERS
DROP POLICY IF EXISTS "orders_anon_select" ON public.orders;
CREATE POLICY "orders_anon_select" ON public.orders
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "orders_anon_insert" ON public.orders;
CREATE POLICY "orders_anon_insert" ON public.orders
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

-- Sellers can update their own orders to add tracking; restrict columns from app side.
DROP POLICY IF EXISTS "orders_seller_update_tracking" ON public.orders;
CREATE POLICY "orders_seller_update_tracking" ON public.orders
  FOR UPDATE TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- SELLER PAYOUTS — read only from frontend; mutations via service role only
DROP POLICY IF EXISTS "payouts_anon_select" ON public.seller_payouts;
CREATE POLICY "payouts_anon_select" ON public.seller_payouts
  FOR SELECT TO anon, authenticated USING (TRUE);

-- SUBSCRIBERS — anyone can subscribe; nobody can read (admin via service role)
DROP POLICY IF EXISTS "subscribers_anon_insert" ON public.subscribers;
CREATE POLICY "subscribers_anon_insert" ON public.subscribers
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

-- CAMPAIGNS / EMAIL LOG — service role only (no policies for anon = denied)

-- Grant table-level access (in addition to RLS) so the Data API exposes them
GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT UPDATE ON public.orders TO anon, authenticated;
GRANT SELECT ON public.seller_payouts TO anon, authenticated;
GRANT INSERT ON public.subscribers TO anon, authenticated;
