-- Self-review follow-up on the previous commit (cde28bb): claiming the
-- listing (UPDATE listings SET is_sold) and marking the order paid were two
-- separate network round-trips from the webhook, batched across all orders
-- in the event before either batch ran. If the function crashed between
-- claiming order A's listing and recording order A as 'paid' (timeout,
-- redeploy, OOM — anything), a redelivered webhook would retry the claim for
-- order A, find is_sold already true (from A's own prior, uncommitted-as-far
-- -as-orders-are-concerned attempt), and wrongly conclude a different buyer
-- had claimed it — marking A's own legitimate order 'payment_conflict' by
-- mistake.
--
-- Fix: do the claim and the order-status update for a single order inside
-- one Postgres function, so they commit together in one transaction. From
-- the webhook's perspective this RPC call either fully happens or fully
-- doesn't — there is no crash window between the two steps anymore.

CREATE OR REPLACE FUNCTION public.fulfill_captured_payment(p_order_id uuid, p_payment_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_listing_id uuid;
  v_claimed boolean := true;
  v_result text;
BEGIN
  SELECT listing_id INTO v_listing_id FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_listing_id IS NOT NULL THEN
    UPDATE public.listings SET is_sold = true WHERE id = v_listing_id AND is_sold = false;
    IF NOT FOUND THEN
      v_claimed := false;
    END IF;
  END IF;

  IF v_claimed THEN
    UPDATE public.orders
      SET status = 'paid', razorpay_payment_id = p_payment_id, payment_submitted_at = now()
      WHERE id = p_order_id AND status <> 'paid';
    v_result := 'paid';
  ELSE
    UPDATE public.orders
      SET status = 'payment_conflict', razorpay_payment_id = p_payment_id
      WHERE id = p_order_id AND status NOT IN ('paid', 'payment_conflict');
    v_result := 'payment_conflict';
  END IF;

  RETURN v_result;
END;
$$;
