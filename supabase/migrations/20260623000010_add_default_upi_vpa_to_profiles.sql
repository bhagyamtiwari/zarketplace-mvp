-- My Profile page lets buyers/sellers save a default UPI ID on their account
-- so it can be reused across listings rather than re-entered each time.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_upi_vpa text;
