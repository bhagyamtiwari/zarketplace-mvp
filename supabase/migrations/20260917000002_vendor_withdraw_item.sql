-- A vendor can withdraw an accepted item, any time until someone buys it.
--
-- The listing form has promised this ("withdraw it at any time from your vendor
-- portal") without anything behind it. This is the thing behind it.
--
-- Why "until someone buys it" and not later: MODEL.md, title passes to us at
-- the moment of buyer purchase. Before that there has been no supply, so a
-- withdrawal settles nothing and costs nobody anything. After it, the item is
-- sold to a customer and is not the vendor's to pull.
--
-- "Bought" includes a buyer who is still paying. Checkout reserves an item with
-- an awaiting_payment order until its reservation expires; letting a vendor
-- withdraw inside that window would sell a customer something we can no longer
-- supply. Orders that are dead (failed, cancelled, refunded, or a reservation
-- that has run out) do not block.
--
-- End state is the same one the possession check produces when a vendor says
-- they no longer have the item: listing archived and off the storefront,
-- LISTED -> EXPIRED, the acquisition closed with its own reason. No trust
-- penalty: pulling an item before anyone has bought it harms no one.
--
-- Verified against production in rolled-back transactions: refused before
-- acceptance, for another user, with a paid order, and with a buyer mid-checkout;
-- allowed with only an expired reservation; takes the item off public_listings;
-- refuses a second withdrawal. anon cannot execute it.
CREATE OR REPLACE FUNCTION public.withdraw_acquisition(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE acq public.acquisitions; l public.listings;
BEGIN
  SELECT * INTO acq FROM public.acquisitions WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'We could not find that item.'; END IF;
  IF acq.vendor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'That item is not yours to withdraw.';
  END IF;
  IF acq.offer_status <> 'accepted' THEN
    RAISE EXCEPTION 'Only an item whose offer you have accepted can be withdrawn.';
  END IF;
  IF acq.listing_expired_at IS NOT NULL THEN
    RAISE EXCEPTION 'This item is already off the site.';
  END IF;

  -- Lock the listing too, so a checkout cannot slip in between the check and
  -- the takedown.
  SELECT * INTO l FROM public.listings WHERE id = p_listing_id FOR UPDATE;
  IF l.is_sold THEN
    RAISE EXCEPTION 'Someone has already bought this item, so it can no longer be withdrawn.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.listing_id = p_listing_id
       AND o.status NOT IN ('payment_failed','cancelled','refunded')
       AND NOT (o.status = 'awaiting_payment' AND o.reservation_expires_at < now())
  ) THEN
    RAISE EXCEPTION 'Someone is buying this item right now, so it can no longer be withdrawn.';
  END IF;

  UPDATE public.acquisitions
     SET delisted_reason = 'vendor_withdrew',
         listing_expired_at = now()
   WHERE listing_id = p_listing_id;

  PERFORM set_config('zarketplace.internal', 'on', true);
  UPDATE public.listings
     SET status = 'archived',
         lifecycle_state = CASE WHEN lifecycle_state = 'LISTED' THEN 'EXPIRED' ELSE lifecycle_state END,
         lifecycle_updated_at = now()
   WHERE id = p_listing_id;
  PERFORM set_config('zarketplace.internal', 'off', true);

  RETURN jsonb_build_object('withdrawn_at', now());
END $function$;

REVOKE ALL ON FUNCTION public.withdraw_acquisition(uuid) FROM public;
REVOKE ALL ON FUNCTION public.withdraw_acquisition(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_acquisition(uuid) TO authenticated;
