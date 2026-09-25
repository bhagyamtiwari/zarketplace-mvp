-- The vendor email dispatcher is called every minute by pg_cron, through
-- pg_net, with the x-dispatch-secret header the function checks. But the
-- edge function also sits behind Supabase's JWT check (verify_jwt is on by
-- default, and the redeploy on 2026-09-17 left it on), and the gateway
-- refused every call with 401 "Missing authorization header" before the
-- function ever ran. No vendor email went out from then until 2026-09-25:
-- submission confirmations and offers alike sat in vendor_notifications as
-- 'queued'.
--
-- The call now also carries the project's publishable (anon) key as a bearer
-- token, read from internal_config ('functions_auth_key'), so the gateway lets
-- it through. The key is public by design (it ships in the site's bundle);
-- the dispatch secret is still what the function itself checks. Set with:
--   insert into public.internal_config (key, value)
--   values ('functions_auth_key', '<anon key>')
--   on conflict (key) do update set value = excluded.value;

CREATE OR REPLACE FUNCTION public.dispatch_vendor_emails()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_url text; v_secret text; v_auth text; v_request_id bigint;
BEGIN
  SELECT value INTO v_url FROM public.internal_config WHERE key = 'functions_url';
  SELECT value INTO v_secret FROM public.internal_config WHERE key = 'dispatch_secret';
  SELECT value INTO v_auth FROM public.internal_config WHERE key = 'functions_auth_key';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'dispatch_vendor_emails is not configured';
    RETURN NULL;
  END IF;
  IF v_auth IS NULL THEN
    RAISE WARNING 'dispatch_vendor_emails has no functions_auth_key: the function gateway will refuse the call';
  END IF;

  SELECT net.http_post(
    url := v_url || '/dispatch-vendor-emails',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', v_secret,
      'Authorization', CASE WHEN v_auth IS NOT NULL THEN 'Bearer ' || v_auth END,
      'apikey', v_auth
    )),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END $function$;
