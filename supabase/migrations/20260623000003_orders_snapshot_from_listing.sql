-- Security fix: orders_buyer_insert RLS policy only checks buyer_id = auth.uid(),
-- not whether amount/shipping_cost/total_amount/seller_id actually match the
-- listing being bought. Checkout.tsx sends these from client-held cart data,
-- so a crafted insert could set amount to anything, or misroute seller_id.
-- This becomes the amount that will be charged via Razorpay, so it must be
-- authoritative before that integration lands.
--
-- This trigger re-derives all financial/ownership fields from the live
-- listings row at insert time, ignoring whatever the client sent for them.
-- Admins and the service role (trusted backend paths, e.g. a future
-- create-razorpay-order function) are exempt and may insert exact values.

CREATE OR REPLACE FUNCTION public.orders_snapshot_from_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.listings;
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id is required';
  END IF;

  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF l.status <> 'approved' OR l.is_sold THEN
    RAISE EXCEPTION 'Listing is not available for purchase';
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_snapshot_from_listing ON public.orders;
CREATE TRIGGER orders_snapshot_from_listing
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_snapshot_from_listing();
