-- Reconcile migration drift (Finding 4).
--
-- The live prod DB (wfaxtxprngyrxsmahxxa) contained several security-relevant
-- objects that were never versioned in supabase/migrations/, so a clean rebuild
-- from the repo would not reproduce prod. This migration captures those live-only
-- objects as source of truth, and consolidates a duplicated signup wiring.
--
-- Ground truth found live (2026-07-13):
--   auth.users had TWO AFTER INSERT triggers both creating a profile row:
--     on_auth_user_created     -> public.handle_new_user()       (repo canonical)
--     trg_on_auth_user_created -> public.handle_new_auth_user()  (live-only drift)
--   Both simply INSERT ... ON CONFLICT (id) DO NOTHING into public.profiles, so
--   they were double-firing harmlessly. We consolidate to the repo-canonical
--   handle_new_user / on_auth_user_created and drop the redundant pair.
--
--   public.link_existing_records_to_profile() existed but was attached to NO
--   trigger (inert). See the security note on it below.
--
--   public.rls_auto_enable() + event trigger ensure_rls auto-enable RLS on new
--   public tables. public.admin_pending_listings() is an admin-guarded reader.
--   Both captured here as-is.

-- 1. Canonical profile-creation function (repo canonical, kept).
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Ensure the canonical trigger exists (idempotent).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop the redundant, live-only duplicate so profile creation fires once.
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- 2. link_existing_records_to_profile (Finding 4.2 security review).
--
-- Original live body reassigned listings.seller_id, orders.buyer_id and
-- orders.seller_id from NULL to a newly created user whose email matches
-- (case-insensitively). Analysis:
--   * listings.seller_id is NOT NULL, so the listings claim can never match a
--     row and is inert.
--   * orders.buyer_id / orders.seller_id are nullable and are ON DELETE SET NULL
--     against auth.users, so an order's owner id becomes NULL when that user
--     deletes their account. If this function were wired to signup and email
--     reuse were permitted, a new account registering with a deleted user's
--     email would auto-claim that user's historical orders (order PII + payout
--     association). That is a real privilege-escalation vector.
--   * The function was attached to NO trigger in prod (inert today), and there
--     are currently zero NULL-owner orders. So the live risk is latent, not active.
--
-- Smallest safe hardening: drop the by-email orders-claiming entirely. No email
-- guard (created_at / email_confirmed_at) actually defends against reuse-after-
-- deletion, because the deleted user's orders always predate the new account and
-- an attacker can confirm their own email. The listings claim is retained purely
-- for parity but stays inert given the NOT NULL constraint. The function remains
-- unwired; this definition is captured so a rebuild matches prod and any future
-- wiring inherits the safe body.
CREATE OR REPLACE FUNCTION public.link_existing_records_to_profile()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.email IS NOT NULL THEN
    -- Inert under the current schema (listings.seller_id is NOT NULL); kept for
    -- parity only. Deliberately does NOT claim orders by email (see header note).
    UPDATE public.listings
       SET seller_id = NEW.id
     WHERE seller_id IS NULL AND LOWER(seller_email) = LOWER(NEW.email);
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. rls_auto_enable event trigger (auto-enables RLS on new public tables).
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();

-- 4. admin_pending_listings (admin-guarded reader, captured as-is).
CREATE OR REPLACE FUNCTION public.admin_pending_listings()
  RETURNS SETOF public.listings
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY SELECT * FROM public.listings WHERE status = 'pending' ORDER BY created_at ASC;
END;
$function$;
