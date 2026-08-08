-- Payout details move out of the listing flow and into the first sale.
--
-- Before: every listing carried seller_instagram + seller_upi_vpa + a full
-- pickup address, all NOT NULL, so a seller had to hand over ~10 fields of
-- payout data before they could publish anything at all. That is the largest
-- drop-off point in the product, for money that does not exist yet.
--
-- After: payout details live on the seller's profile and are collected once,
-- as a blocking step before they can act on their FIRST sale. Listings may be
-- published with no payout data at all.
--
-- Three pieces:
--   1. profiles gains instagram / pickup_address / payout_locked_at, so the
--      details are seller-level rather than per-listing.
--   2. listings.seller_instagram and .seller_upi_vpa become nullable.
--   3. submit_seller_payout_details() - one SECURITY DEFINER entry point that
--      saves the details, backfills the seller's own listings and orders that
--      are still missing them (so the existing snapshot -> admin payout ->
--      Shiprocket pickup chain keeps working untouched), and locks UPI +
--      Instagram against later edits. That lock is the same rule as before,
--      just applied at first-sale submission instead of at publish.

-- 1. Profile-level payout details -------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS pickup_address jsonb,
  ADD COLUMN IF NOT EXISTS payout_locked_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_default_upi_vpa_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_default_upi_vpa_format
  CHECK (default_upi_vpa IS NULL OR default_upi_vpa ~ '^[A-Za-z0-9._\-]{2,255}@[A-Za-z]{2,64}$');

-- Once payout details are submitted at first sale, UPI and Instagram are
-- frozen: the money destination cannot be changed after a sale is in flight.
-- Name, phone and pickup address stay editable - those legitimately change,
-- and neither redirects a payout.
CREATE OR REPLACE FUNCTION public.profiles_lock_payout_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF OLD.payout_locked_at IS NOT NULL AND (
       NEW.default_upi_vpa IS DISTINCT FROM OLD.default_upi_vpa
       OR NEW.instagram IS DISTINCT FROM OLD.instagram
     ) THEN
    RAISE EXCEPTION 'UPI ID and Instagram lock once your payout details are submitted. Contact support to change them.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_lock_payout_identity() FROM PUBLIC;
DROP TRIGGER IF EXISTS profiles_lock_payout_identity ON public.profiles;
CREATE TRIGGER profiles_lock_payout_identity BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_lock_payout_identity();

-- 2. Listings no longer demand payout data ----------------------------------

ALTER TABLE public.listings ALTER COLUMN seller_instagram DROP NOT NULL;
ALTER TABLE public.listings ALTER COLUMN seller_upi_vpa DROP NOT NULL;

-- The immutability rule stays, with one narrow addition: a NULL may be filled
-- in once. That is the backfill below writing details that never existed.
-- Changing an existing value is still admin-only.
CREATE OR REPLACE FUNCTION public.listings_lock_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR (OLD.seller_upi_vpa IS NOT NULL AND NEW.seller_upi_vpa IS DISTINCT FROM OLD.seller_upi_vpa)
     OR (OLD.seller_instagram IS NOT NULL AND NEW.seller_instagram IS DISTINCT FROM OLD.seller_instagram) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'seller_id, seller_upi_vpa and seller_instagram are immutable on listings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.listings_lock_immutable() FROM PUBLIC;

-- 3. Orders: allow a missing payout snapshot to be filled in once -----------
--
-- Same reasoning as listings. An order created before its seller had payout
-- details has a NULL snapshot; the first-sale submission fills it. A snapshot
-- that already holds a value remains admin-only, which is what stops a seller
-- redirecting a payout after the sale.
CREATE OR REPLACE FUNCTION public.orders_enforce_transitions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() = OLD.buyer_id AND OLD.status = 'awaiting_payment' AND NEW.status = 'awaiting_verification' THEN
      NULL; -- buyer submitting payment proof
    ELSIF auth.uid() = OLD.seller_id AND OLD.status = 'paid' AND NEW.status = 'shipped' THEN
      NULL; -- seller shipping a paid order
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status = 'payment_failed'
          AND OLD.reservation_expires_at IS NOT NULL AND OLD.reservation_expires_at < now() THEN
      NULL; -- expired reservation lapsing; releases the listing, never lets anyone fake a payment
    ELSE
      RAISE EXCEPTION 'Not allowed to change order status from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR (OLD.seller_upi_vpa_snapshot IS NOT NULL
         AND NEW.seller_upi_vpa_snapshot IS DISTINCT FROM OLD.seller_upi_vpa_snapshot)
     OR (OLD.seller_upi_vpa_snapshot IS NULL
         AND NEW.seller_upi_vpa_snapshot IS NOT NULL
         AND NEW.seller_upi_vpa_snapshot IS DISTINCT FROM
             (SELECT p.default_upi_vpa FROM public.profiles p WHERE p.id = OLD.seller_id))
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id
     OR NEW.razorpay_signature IS DISTINCT FROM OLD.razorpay_signature
     OR NEW.checkout_group_id IS DISTINCT FROM OLD.checkout_group_id THEN
    RAISE EXCEPTION 'Only admins can modify financial, ownership, or payment-provider fields on an order';
  END IF;

  IF auth.uid() = OLD.seller_id AND (
       NEW.payment_utr IS DISTINCT FROM OLD.payment_utr
       OR NEW.payment_receipt_url IS DISTINCT FROM OLD.payment_receipt_url
       OR NEW.payment_submitted_at IS DISTINCT FROM OLD.payment_submitted_at
       OR NEW.buyer_note IS DISTINCT FROM OLD.buyer_note
     ) THEN
    RAISE EXCEPTION 'Sellers cannot modify buyer payment fields';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.orders_enforce_transitions() FROM PUBLIC;

-- 4. The single entry point the first-sale gate calls ------------------------

CREATE OR REPLACE FUNCTION public.submit_seller_payout_details(
  p_full_name text,
  p_phone text,
  p_instagram text,
  p_upi_vpa text,
  p_pickup_address jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  existing public.profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  IF p_upi_vpa !~ '^[A-Za-z0-9._\-]{2,255}@[A-Za-z]{2,64}$' THEN
    RAISE EXCEPTION 'Enter a valid UPI ID';
  END IF;
  IF p_instagram IS NULL OR btrim(p_instagram) = '' THEN
    RAISE EXCEPTION 'Enter your Instagram handle';
  END IF;
  IF COALESCE(p_pickup_address->>'address', '') = ''
     OR COALESCE(p_pickup_address->>'city', '') = ''
     OR COALESCE(p_pickup_address->>'state', '') = ''
     OR COALESCE(p_pickup_address->>'pincode', '') !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Enter a complete pickup address with a 6-digit pincode';
  END IF;

  SELECT * INTO existing FROM public.profiles WHERE id = uid FOR UPDATE;

  -- The lock rule, applied here instead of at publish.
  IF existing.payout_locked_at IS NOT NULL THEN
    IF existing.default_upi_vpa IS DISTINCT FROM p_upi_vpa
       OR existing.instagram IS DISTINCT FROM p_instagram THEN
      RAISE EXCEPTION 'UPI ID and Instagram lock once your payout details are submitted. Contact support to change them.';
    END IF;
  END IF;

  UPDATE public.profiles SET
    full_name = COALESCE(NULLIF(btrim(p_full_name), ''), full_name),
    phone = COALESCE(NULLIF(btrim(p_phone), ''), phone),
    instagram = p_instagram,
    default_upi_vpa = p_upi_vpa,
    pickup_address = p_pickup_address,
    payout_locked_at = COALESCE(payout_locked_at, now())
  WHERE id = uid;

  -- Backfill everything this seller already has in flight that was published
  -- without payout data, so the snapshot -> payout -> pickup chain downstream
  -- is unchanged from before this migration.
  UPDATE public.listings SET
    seller_upi_vpa = COALESCE(seller_upi_vpa, p_upi_vpa),
    seller_instagram = COALESCE(seller_instagram, p_instagram),
    pickup_address = COALESCE(pickup_address, p_pickup_address),
    seller_display_name = COALESCE(seller_display_name, NULLIF(btrim(p_full_name), ''))
  WHERE seller_id = uid
    AND (seller_upi_vpa IS NULL OR seller_instagram IS NULL OR pickup_address IS NULL);

  UPDATE public.orders SET
    seller_upi_vpa_snapshot = COALESCE(seller_upi_vpa_snapshot, p_upi_vpa),
    pickup_address = COALESCE(pickup_address, p_pickup_address)
  WHERE seller_id = uid
    AND (seller_upi_vpa_snapshot IS NULL OR pickup_address IS NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_seller_payout_details(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_seller_payout_details(text, text, text, text, jsonb) TO authenticated;
