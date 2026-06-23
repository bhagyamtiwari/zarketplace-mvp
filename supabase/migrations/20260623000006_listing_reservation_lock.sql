-- PR review finding C3 (Critical): nothing stopped two different buyers
-- from both creating an awaiting_payment order for the same one-of-one
-- listing, then both successfully paying — a real double-sale of a
-- physical item that only one person can own.
--
-- Fix: a hard reservation lock. The first buyer to create an order for a
-- listing reserves it for 20 minutes (reservation_expires_at). A second
-- buyer cannot create a second awaiting_payment order for the same listing
-- while that reservation is active — enforced by a Postgres UNIQUE index,
-- not just application logic, so it holds even under concurrent requests.
-- If the first buyer never pays, the reservation lapses automatically the
-- next time anyone attempts to check out that listing (lazy expiry) — no
-- background job required.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

-- The actual guarantee: at most one 'awaiting_payment' order may exist per
-- listing at any time. This is what makes double-selling impossible, not
-- the application-level checks below (those just give a friendlier error
-- and clean up stale reservations).
CREATE UNIQUE INDEX IF NOT EXISTS orders_listing_one_active_reservation_idx
  ON public.orders (listing_id) WHERE status = 'awaiting_payment';

-- Allow the "reservation lapsed" transition for anyone (not just
-- admin/service_role): releasing a stale reservation only frees inventory,
-- it can never be used to fake a payment, so it's safe for any actor to
-- trigger as a side effect of trying to check out that listing.
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
     OR NEW.seller_upi_vpa_snapshot IS DISTINCT FROM OLD.seller_upi_vpa_snapshot
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

  IF auth.uid() = OLD.buyer_id AND (
       NEW.tracking_url IS DISTINCT FROM OLD.tracking_url
       OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
       OR NEW.courier IS DISTINCT FROM OLD.courier
       OR NEW.package_image_url IS DISTINCT FROM OLD.package_image_url
       OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
     ) THEN
    RAISE EXCEPTION 'Buyers cannot modify shipping fields';
  END IF;

  RETURN NEW;
END;
$$;

-- Release any expired reservation for this listing before checking
-- availability (lazy expiry — no cron needed), then reserve it for the new
-- order. The friendly EXISTS check below gives a clear error message in the
-- common case; the unique index above is what actually guarantees
-- correctness under concurrent requests.
CREATE OR REPLACE FUNCTION public.orders_snapshot_from_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.listings;
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    NEW.reservation_expires_at := COALESCE(NEW.reservation_expires_at, now() + interval '20 minutes');
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id is required';
  END IF;

  UPDATE public.orders
    SET status = 'payment_failed'
    WHERE listing_id = NEW.listing_id
      AND status = 'awaiting_payment'
      AND reservation_expires_at < now();

  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF l.status <> 'approved' OR l.is_sold THEN
    RAISE EXCEPTION 'Listing is not available for purchase';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders WHERE listing_id = NEW.listing_id AND status = 'awaiting_payment'
  ) THEN
    RAISE EXCEPTION 'This item is currently reserved by another buyer. Please try again in a few minutes.';
  END IF;

  NEW.listing_sku := l.sku;
  NEW.listing_title := l.title;
  NEW.listing_image_url := l.image_url;
  NEW.seller_id := l.seller_id;
  NEW.seller_email := l.seller_email;
  NEW.seller_upi_vpa_snapshot := l.seller_upi_vpa;
  NEW.amount := COALESCE(l.sale_price, l.price);
  NEW.shipping_cost := CASE WHEN l.shipping_mode = 'paid' THEN l.shipping_cost ELSE 0 END;
  NEW.total_amount := NEW.amount + NEW.shipping_cost;
  NEW.reservation_expires_at := now() + interval '20 minutes';
  RETURN NEW;
END;
$$;
