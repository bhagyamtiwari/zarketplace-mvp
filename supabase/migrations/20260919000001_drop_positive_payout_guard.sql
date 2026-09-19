-- listings_require_positive_payout is a marketplace-era guard. It assumed a
-- seller set their own price and that free delivery was deducted from their
-- payout, so a price at or below the shipping rate "would pay you nothing".
--
-- Neither is true any more. The sell flow sends no price (the row goes in at
-- 0) and always sets free_shipping, so the guard rejected every new submission
-- with copy that talks about the vendor's price and payout. The vendor's
-- payout is the locked acquisition offer, nothing is deducted from it, and
-- make_acquisition_offer already refuses an offer at or above the resale
-- price.
DROP TRIGGER IF EXISTS listings_require_positive_payout ON public.listings;
DROP FUNCTION IF EXISTS public.listings_require_positive_payout();
