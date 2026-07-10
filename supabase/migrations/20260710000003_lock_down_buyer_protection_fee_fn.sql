-- Follow-up to migration 20260710000002: compute_buyer_protection_fee() is
-- SECURITY DEFINER but was never explicitly locked down, so Postgres/
-- PostgREST's default grant made it callable by anyone via
-- /rest/v1/rpc/compute_buyer_protection_fee - the exact class of mistake
-- migration 20260623000009 already fixed once for fulfill_captured_payment().
--
-- Low severity here (the function is pure math over a caller-supplied price,
-- no side effects, no secret data), but it should never have been publicly
-- callable and nothing legitimate needs it to be: the order-insert trigger
-- calls it internally (as the owning role, unaffected by this revoke), and
-- the client computes the identical formula itself in src/lib/pricing.ts for
-- display. Verified live via the anon key both before (200, computed a
-- value) and after (401, permission denied) this migration.

REVOKE EXECUTE ON FUNCTION public.compute_buyer_protection_fee(numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_buyer_protection_fee(numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_buyer_protection_fee(numeric) FROM authenticated;
