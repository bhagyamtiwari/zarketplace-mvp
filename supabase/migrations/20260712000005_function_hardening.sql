-- Function hardening (Finding 10).
--
-- 1. Pin search_path on the four advisor-flagged trigger functions
--    (function_search_path_mutable lint). Behavior-neutral: they already resolve
--    unqualified names in public.
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_sku() SET search_path = public;
ALTER FUNCTION public.generate_order_number() SET search_path = public;
ALTER FUNCTION public.listings_lock_immutable() SET search_path = public;

-- 2. Revoke direct EXECUTE from anon/authenticated on functions that only ever
--    run in a trigger or event-trigger context (or self-guard and have no
--    frontend RPC caller). This removes needless /rpc surface and clears the
--    definer_function_executable lints.
--
--    CRITICAL EXCLUSION: public.is_admin() is called inside RLS USING/WITH CHECK
--    clauses, so its EXECUTE grant to anon/authenticated is intentionally LEFT
--    IN PLACE. Revoking it would break every policy that references it.
--
--    The frontend makes zero supabase.rpc() calls (verified), so none of these
--    revokes can break an app code path; they run only as triggers/internally.
--    NB: anon/authenticated hold EXECUTE via the default PUBLIC grant, so we
--    revoke FROM PUBLIC (revoking only anon/authenticated leaves the PUBLIC
--    grant intact). Trigger/event-trigger functions fire regardless of the
--    caller's EXECUTE privilege, and service_role/postgres keep their explicit
--    grants, so payment/webhook/signup paths are unaffected.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sku() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_order_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listings_lock_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_admin_self_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_enforce_transitions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_snapshot_from_listing() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listings_enforce_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_order_delivered() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_lock_claim_open() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_existing_records_to_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
-- admin_pending_listings self-guards (raises unless is_admin) and had explicit
-- anon/authenticated grants (no PUBLIC grant, no frontend RPC caller); revoke
-- those so it is reachable only by postgres/service_role.
REVOKE EXECUTE ON FUNCTION public.admin_pending_listings() FROM anon, authenticated;
