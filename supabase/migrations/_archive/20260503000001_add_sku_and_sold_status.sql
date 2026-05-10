-- Migration: Add SKU and sold status to listings
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

-- Add SKU column (unique product code) and is_sold flag
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT FALSE;

-- Function to generate a SKU like ZV-BTM-123456 based on category
CREATE OR REPLACE FUNCTION public.generate_listing_sku(p_category TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_sku TEXT;
  v_attempts INT := 0;
BEGIN
  v_prefix := CASE LOWER(COALESCE(p_category, ''))
    WHEN 'tops' THEN 'TOP'
    WHEN 'bottoms' THEN 'BTM'
    WHEN 'outerwear' THEN 'OUT'
    WHEN 'shoes' THEN 'SHO'
    WHEN 'accessories' THEN 'ACC'
    WHEN 'miscellaneous' THEN 'MSC'
    ELSE 'ITM'
  END;

  LOOP
    v_sku := 'ZV-' || v_prefix || '-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.listings WHERE sku = v_sku);
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique SKU after 50 attempts';
    END IF;
  END LOOP;

  RETURN v_sku;
END;
$$;

-- Trigger to auto-assign SKU on insert if not provided
CREATE OR REPLACE FUNCTION public.set_listing_sku()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sku IS NULL OR NEW.sku = '' THEN
    NEW.sku := public.generate_listing_sku(NEW.category);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_listing_sku ON public.listings;
CREATE TRIGGER trg_set_listing_sku
  BEFORE INSERT ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_listing_sku();

-- Backfill SKUs for existing listings
UPDATE public.listings
SET sku = public.generate_listing_sku(category)
WHERE sku IS NULL;

-- Index for SKU lookups
CREATE INDEX IF NOT EXISTS idx_listings_sku ON public.listings(sku);
CREATE INDEX IF NOT EXISTS idx_listings_is_sold ON public.listings(is_sold);
