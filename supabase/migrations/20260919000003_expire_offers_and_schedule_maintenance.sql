-- An offer is open for acquisition_config.offer_valid_days (7). The deadline
-- was stamped on every offer and enforced when a vendor tried to accept late,
-- but nothing moved an ignored offer on: it stayed 'offered' forever, and the
-- admin kept it under "With the vendor" as if an answer might still come.
--
-- This closes them on time. No email: the vendor was shown the closing date
-- on the offer itself, and "your offer has lapsed" is not a message worth an
-- inbox. An operator can reopen an expired item from the admin.
CREATE OR REPLACE FUNCTION public.sweep_expired_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.acquisitions
     SET offer_status = 'expired'
   WHERE offer_status = 'offered'
     AND offer_expires_at IS NOT NULL
     AND offer_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_expired_offers() FROM PUBLIC;

-- run_listing_maintenance (the 30-day listing window and the possession
-- checks) was written and never scheduled, so neither ever ran.
SELECT cron.unschedule(jobname) FROM cron.job
 WHERE jobname IN ('zarketplace-expire-offers', 'zarketplace-listing-maintenance');
SELECT cron.schedule('zarketplace-expire-offers', '*/15 * * * *', 'SELECT public.sweep_expired_offers();');
SELECT cron.schedule('zarketplace-listing-maintenance', '30 2 * * *', 'SELECT public.run_listing_maintenance();');
