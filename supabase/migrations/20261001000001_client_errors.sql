-- Errors visitors hit in their browser, kept where an operator can see them.
--
-- The site had no error reporting in production (src/lib/log.ts is dev-only),
-- so a checkout that broke for a customer was invisible unless they wrote in.
-- The browser reports through log_client_error, never by writing the table:
-- the same failure on the same page within an hour is one row with a count,
-- a flood stops at 60 new rows a minute, and rows older than 30 days go.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id bigserial PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences int NOT NULL DEFAULT 1,
  kind text NOT NULL,
  message text NOT NULL,
  path text,
  stack text,
  user_agent text,
  release text,
  user_id uuid
);

CREATE INDEX IF NOT EXISTS client_errors_last_seen_idx ON public.client_errors (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS client_errors_dedupe_idx ON public.client_errors (kind, message, path);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_errors_operators_read ON public.client_errors;
CREATE POLICY client_errors_operators_read ON public.client_errors FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS client_errors_operators_clear ON public.client_errors;
CREATE POLICY client_errors_operators_clear ON public.client_errors FOR DELETE USING (public.is_admin());

REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.client_errors TO authenticated;

CREATE OR REPLACE FUNCTION public.log_client_error(
  p_kind text, p_message text, p_path text, p_stack text, p_user_agent text, p_release text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_kind text := left(coalesce(nullif(btrim(p_kind), ''), 'error'), 20);
  v_msg  text := left(coalesce(nullif(btrim(p_message), ''), '(no message)'), 500);
  v_path text := left(p_path, 300);
  n int;
BEGIN
  UPDATE public.client_errors
     SET occurrences = occurrences + 1, last_seen_at = now()
   WHERE id = (
     SELECT id FROM public.client_errors
      WHERE kind = v_kind AND message = v_msg AND path IS NOT DISTINCT FROM v_path
        AND last_seen_at > now() - interval '1 hour'
      ORDER BY last_seen_at DESC LIMIT 1);
  IF FOUND THEN RETURN; END IF;

  SELECT count(*) INTO n FROM public.client_errors WHERE first_seen_at > now() - interval '1 minute';
  IF n >= 60 THEN RETURN; END IF;

  INSERT INTO public.client_errors (kind, message, path, stack, user_agent, release, user_id)
  VALUES (v_kind, v_msg, v_path, left(p_stack, 4000), left(p_user_agent, 300), left(p_release, 80), auth.uid());

  DELETE FROM public.client_errors
   WHERE id IN (SELECT id FROM public.client_errors WHERE last_seen_at < now() - interval '30 days' LIMIT 100);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text) TO anon, authenticated, service_role;
