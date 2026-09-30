-- Second half of 20260930000004: the admin console now previews offers
-- through preview_acquisition_offer, so the model itself is no longer granted
-- to signed-in accounts. Its callers are SECURITY DEFINER functions owned by
-- postgres (make_acquisition_offer, make_reoffer, set_expected_resale).
REVOKE EXECUTE ON FUNCTION public.compute_acquisition_offer(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_acquisition_offer(numeric) TO service_role;
