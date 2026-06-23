-- PR review finding C2 (Critical): razorpay_order_id, razorpay_payment_id,
-- razorpay_signature, and checkout_group_id were added in
-- 20260623000004_razorpay_columns.sql AFTER orders_enforce_transitions was
-- written, so that trigger's financial/ownership column blocklist never
-- included them. A buyer could directly call:
--   supabase.from('orders').update({ razorpay_order_id: '<someone else's id>' })
-- on their own order row (allowed by RLS, since buyer_id = auth.uid()), and
-- the trigger would not stop it. If that other Razorpay order is later
-- captured (or its webhook redelivered), razorpay-webhook's
-- `WHERE razorpay_order_id = payment.order_id` lookup matches BOTH orders
-- and marks the attacker's order paid for free.
--
-- This re-defines the same trigger function (CREATE OR REPLACE — the
-- trigger itself already exists and keeps pointing at this function name)
-- with those four columns added to the blocked list, alongside the
-- already-protected financial/ownership columns.

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
