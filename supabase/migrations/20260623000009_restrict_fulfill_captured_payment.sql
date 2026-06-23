-- Critical fix, found by Supabase's security advisor immediately after
-- deploying migration 8: fulfill_captured_payment() is a regular callable
-- function (not a trigger function), and Postgres/PostgREST grants EXECUTE
-- on new functions to PUBLIC by default — meaning it was callable by
-- completely unauthenticated visitors via
-- /rest/v1/rpc/fulfill_captured_payment. Since it's SECURITY DEFINER, any
-- anonymous caller could mark any order_id 'paid' directly, without ever
-- touching Razorpay — a full payment bypass.
--
-- This function is only ever meant to be called by the razorpay-webhook
-- edge function, which uses the service role key. Restrict execution to
-- service_role only.

REVOKE EXECUTE ON FUNCTION public.fulfill_captured_payment(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fulfill_captured_payment(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fulfill_captured_payment(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_captured_payment(uuid, text) TO service_role;
