-- The listing window drops from 45 days to 30.
--
-- Safe to apply as a plain config change: no acquisition had been accepted
-- when this ran (accepted_at was null on every row), so no listing already had
-- a window computed from the old number. Anything accepted from here takes 30.
--
-- offer_valid_days stays at 7. They are two different clocks: 7 days to accept
-- the offer, then 30 days on the site.
update public.acquisition_config set listing_window_days = 30, updated_at = now() where id = 1;

alter table public.acquisition_config alter column listing_window_days set default 30;
