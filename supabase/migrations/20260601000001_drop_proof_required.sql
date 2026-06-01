-- MVP: buyer pays admin UPI, no proof (UTR/screenshot) required.
-- Admin manually verifies payment in their UPI app.
--
-- The code now sets payment_utr = 'ADMIN_VERIFY' to satisfy the constraint.
-- When you get DB access, run this to clean up the constraint entirely:
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_proof_required;
