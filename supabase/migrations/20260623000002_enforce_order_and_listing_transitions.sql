-- Security fix: orders_party_update and listings_owner_update RLS policies only
-- check row ownership (buyer_id/seller_id/seller_id = auth.uid()), not which
-- column changed or what the new value is. That means, with no application
-- code at all, a buyer or seller could call the Supabase client directly and:
--   - set their own order's status straight to 'paid'/'shipped'/'refunded'
--     without ever paying or shipping
--   - rewrite amount/total_amount/buyer_id/seller_id on their own order
--   - self-approve their own pending/rejected listing
-- These triggers add the missing rules on top of the existing RLS policies.
-- Admins and the service role (used by edge functions, e.g. the future
-- Razorpay webhook) are unrestricted; everyone else is limited to the
-- specific transitions and columns their role is supposed to touch.

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
     OR NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Only admins can modify financial or ownership fields on an order';
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

DROP TRIGGER IF EXISTS orders_enforce_transitions ON public.orders;
CREATE TRIGGER orders_enforce_transitions
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_enforce_transitions();

CREATE OR REPLACE FUNCTION public.listings_enforce_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.role() <> 'service_role'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change listing status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_enforce_status ON public.listings;
CREATE TRIGGER listings_enforce_status
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_enforce_status();
