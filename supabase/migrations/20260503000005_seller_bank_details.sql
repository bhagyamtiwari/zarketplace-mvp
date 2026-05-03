-- Migration: Add seller bank/UPI details to listings, plus snapshot fields on
-- payouts so the finance team can settle each payout without joining tables.
-- This is what enables the "manual release" flow: when admin clicks Release in
-- the admin panel, finance can read the destination details directly from the
-- payout row and send money via the Cashfree dashboard / UPI / NEFT.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS seller_bank_account TEXT,
  ADD COLUMN IF NOT EXISTS seller_bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS seller_bank_holder TEXT,
  ADD COLUMN IF NOT EXISTS seller_upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS seller_pan TEXT,
  -- For future Easy Split upgrade: when a seller is onboarded as a Cashfree
  -- vendor, we store the vendor_id here so create-order can pass split details.
  ADD COLUMN IF NOT EXISTS cashfree_vendor_id TEXT;

ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS payout_method TEXT,             -- 'manual' | 'cashfree_payouts' | 'easy_split'
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,          -- UPI ref / UTR / Cashfree transfer id
  ADD COLUMN IF NOT EXISTS destination_upi TEXT,
  ADD COLUMN IF NOT EXISTS destination_account TEXT,
  ADD COLUMN IF NOT EXISTS destination_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS destination_holder TEXT;
