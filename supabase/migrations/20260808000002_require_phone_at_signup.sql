-- Capture a phone number at signup, in E.164.
--
-- DLT approval is still pending so no SMS can be sent and there is no OTP
-- login yet. This migration only guarantees the data exists: linking a phone
-- to an account after the fact means chasing each user individually, and the
-- cost of that grows with every account created without one.
--
-- The number is collected by the signup form and passed through
-- raw_user_meta_data, because with email confirmation ON there is no session
-- at signup time - the client cannot write the profile row itself, so the
-- handle_new_user trigger has to do it.

-- 1. Normalize what is already on file.
--    Existing values are bare 10-digit Indian mobile numbers; E.164 them.
--    Anything already in E.164 is left alone, and accounts with no number at
--    all stay NULL - we cannot invent one, and those are the users who will
--    have to be asked directly.
UPDATE public.profiles
SET phone = '+91' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND btrim(phone) <> ''
  AND phone !~ '^\+[1-9]\d{7,14}$'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^[6-9]\d{9}$';

-- 2. Enforce the format from here on. NULL stays legal precisely because of
--    the pre-existing accounts above; the signup form is what makes it
--    required for anyone new.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_e164;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{7,14}$');

-- 3. Carry the phone from signup metadata onto the profile row.
--    Same shape as before, with phone added. Still ON CONFLICT DO NOTHING, so
--    a repeated trigger firing cannot clobber an existing profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  meta_phone text := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
BEGIN
  -- Never let a malformed value from the client reach the column and trip the
  -- CHECK: signup would fail with a database error instead of creating the
  -- account. The form validates first; this is the backstop.
  IF meta_phone IS NOT NULL AND meta_phone !~ '^\+[1-9]\d{7,14}$' THEN
    meta_phone := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(meta_phone, NULLIF(btrim(COALESCE(NEW.phone, '')), '')))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
