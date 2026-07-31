-- Block listings where free delivery would zero out the seller's payout.
--
-- WHY A DB TRIGGER AND NOT JUST THE SELL FORM:
-- The Sell form already blocks this at listing time, and admin approval was
-- meant to be the backstop. Neither is sufficient. The listings_owner_update
-- RLS policy is `seller_id = auth.uid() OR is_admin()` with no status
-- restriction, and listings_lock_immutable only freezes seller_id,
-- seller_upi_vpa and seller_instagram. So a seller can list at Rs. 1000 with
-- free delivery, pass the form guard, get approved, and then edit the price
-- down to Rs. 100 with no re-approval.
--
-- The result: handle_order_delivered pays GREATEST(0, 100 - 200) = Rs. 0, the
-- seller is furious, and zarketplace has still bought a Rs. 200 label. This
-- makes the invariant hold wherever the write comes from.
--
-- Only pending/approved listings are checked: archived, rejected and suspended
-- rows can't be bought, and enforcing there would block admins from tidying up
-- historical data.
--
-- APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR (see 20260729000001 header).

begin;

create or replace function public.listings_require_positive_payout()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  ship_rate numeric;
  effective_price numeric;
BEGIN
  IF NOT NEW.free_shipping OR NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT rate INTO ship_rate
    FROM public.shipping_categories WHERE key = NEW.shipping_category;
  IF ship_rate IS NULL THEN
    RETURN NEW; -- orders_snapshot_from_listing already rejects this at purchase
  END IF;

  effective_price := COALESCE(NEW.sale_price, NEW.price);
  IF effective_price <= ship_rate THEN
    RAISE EXCEPTION
      'With free delivery the % shipping cost is deducted from your payout, so a price of % would pay you nothing. Raise the price above % or turn off free delivery.',
      ship_rate, effective_price, ship_rate;
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists listings_require_positive_payout on public.listings;
create trigger listings_require_positive_payout
  before insert or update of price, sale_price, free_shipping, shipping_category, status
  on public.listings
  for each row execute function public.listings_require_positive_payout();

commit;
