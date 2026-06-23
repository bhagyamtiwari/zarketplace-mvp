-- Security fix: profiles_self_update RLS policy lets a user update their own
-- profile row, which includes the is_admin column. Without this trigger, any
-- authenticated user can run:
--   supabase.from('profiles').update({ is_admin: true }).eq('id', myOwnId)
-- and grant themselves admin, since auth.uid() = id satisfies the existing
-- RLS USING/WITH CHECK clause. This trigger blocks any change to is_admin
-- unless the actor is already an admin or the request is made with the
-- service role key (server-side scripts/edge functions).

CREATE OR REPLACE FUNCTION public.prevent_admin_self_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND auth.role() <> 'service_role'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change is_admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_admin_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_admin_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_self_escalation();
