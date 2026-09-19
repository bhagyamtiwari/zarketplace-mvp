-- Buyer protection is included in the item price (decided 2026-08-31,
-- confirmed 2026-09-19). A retailer does not itemise a protection charge:
-- the price on the product page is the price at checkout. The fee machinery
-- stays in place and computes zero, so historical orders keep their recorded
-- fee and the checkout line hides itself.
UPDATE public.pricing_config
   SET buyer_protection_percent = 0,
       buyer_protection_floor = 0,
       updated_at = now()
 WHERE id = 1;
