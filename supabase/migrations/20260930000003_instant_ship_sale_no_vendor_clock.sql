-- An Instant Ship item is already with us (is_verified: "in hand and ready to
-- dispatch", 20260913000006). Selling one must not ask its vendor to send it.
--
-- start_ship_by_clock treated every sale the same: a hand-over deadline on the
-- vendor, intake 'awaiting_pickup', and the "hand it over by" email. For an
-- item on our shelf that was wrong three times over: the vendor was told to
-- post something we hold, the reminder sweep would chase them two days before
-- the date, and sweep_no_ship would then record NO_SHIP (no inbound pickup
-- scan, because there is no inbound leg), cancelling a paid order, refunding
-- the buyer and taking 25 off the vendor's trust score.
--
-- Now an Instant Ship sale only moves the listing to SOLD. There is no
-- deadline, so neither sweep sees it (both require ship_by_deadline), and no
-- email. The hub then receives and accepts it as usual (hub_receive_item
-- walks SOLD through to RECEIVED_AT_HUB), which is what raises the payout.
--
-- The item_sold payload also stops carrying the offer amount: the email no
-- longer states it, and a payload should hold only what the template uses.

CREATE OR REPLACE FUNCTION public.start_ship_by_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d int; v_deadline timestamptz;
BEGIN
  IF NEW.is_sold AND NOT OLD.is_sold THEN
    IF NEW.lifecycle_state = 'LISTED' THEN
      NEW.lifecycle_state := 'SOLD';
      NEW.lifecycle_updated_at := now();
    END IF;

    -- Already with us: nothing for the vendor to send.
    IF NEW.is_verified THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(a.ship_by_days, c.ship_by_days) INTO d
      FROM public.fulfillment_config c
      LEFT JOIN public.acquisitions a ON a.listing_id = NEW.id
     WHERE c.id = 1;
    v_deadline := now() + make_interval(days => COALESCE(d, 5));

    UPDATE public.acquisitions
       SET ship_by_deadline = v_deadline, intake_status = 'awaiting_pickup'
     WHERE listing_id = NEW.id;

    PERFORM public.enqueue_vendor_notification(NEW.id, 'item_sold',
      jsonb_build_object('ship_by', v_deadline));
  END IF;
  RETURN NEW;
END $fn$;

-- Instant Ship items already sold under the old rule, with no inbound leg
-- booked: take the vendor's clock off them so the sweeps leave them alone.
UPDATE public.acquisitions a
   SET ship_by_deadline = NULL, intake_status = NULL
  FROM public.listings l
 WHERE l.id = a.listing_id AND l.is_sold AND l.is_verified
   AND a.intake_status = 'awaiting_pickup'
   AND NOT EXISTS (
     SELECT 1 FROM public.shipments s WHERE s.listing_id = a.listing_id AND s.leg = 'INBOUND');
