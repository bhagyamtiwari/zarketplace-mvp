-- Internal functions were callable by anyone with the public anon key.
--
-- Postgres grants EXECUTE on every new function to PUBLIC. Earlier migrations
-- revoked these from anon, which does nothing while PUBLIC still holds the
-- grant, so through /rest/v1/rpc a signed-out visitor could:
--   - record_fulfillment_failure: cancel a paid order, start a refund,
--     archive the item and cut the vendor's trust score
--   - enqueue_vendor_notification: send any vendor one of our emails, with a
--     payload of their choosing
--   - mark_label_issued / record_pickup_scan: move an order along its legs
--   - the sweeps, the maintenance run and the email dispatcher: run early
--   - compute_acquisition_offer: read the whole offer model
--
-- None is called with a visitor's own rights. Every caller is a SECURITY
-- DEFINER function owned by postgres, a pg_cron job run as postgres, or an
-- edge function using the service role (checked 2026-09-30), so taking the
-- grant away from PUBLIC, anon and authenticated breaks nothing.

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.record_fulfillment_failure(uuid, text, text)',
    'public.enqueue_vendor_notification(uuid, text, jsonb)',
    'public.mark_label_issued(uuid)',
    'public.record_pickup_scan(text, timestamp with time zone)',
    'public.sweep_no_ship()',
    'public.sweep_ship_by_reminders()',
    'public.sweep_expired_offers()',
    'public.sweep_abandonment_reminders()',
    'public.run_listing_maintenance()',
    'public.dispatch_vendor_emails()',
    'public.can_book_leg(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- The offer model is an operator's tool. The admin console previews it
-- through this wrapper, which checks for an operator; the model itself stays
-- open to signed-in accounts only until the console has moved over, and is
-- then closed by 20260930000005.
CREATE OR REPLACE FUNCTION public.preview_acquisition_offer(resale numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Operators only'; END IF;
  RETURN public.compute_acquisition_offer(resale);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.preview_acquisition_offer(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_acquisition_offer(numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.compute_acquisition_offer(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_acquisition_offer(numeric) TO authenticated, service_role;
