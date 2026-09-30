-- The site now accepts offers through the signature that also takes the
-- vendor's name, mobile number and UPI ID (20260925000003). The old one
-- stayed only while the previous site was live; dropped so an offer can no
-- longer be accepted without them.
DROP FUNCTION IF EXISTS public.accept_acquisition_offer(uuid, text, jsonb, text, text, text, text, text, text);
