-- Shipping v2: require real evidence before a self-shipped order can ship.
--
-- Depends on 20260731000001 (shipping_payer / fulfillment_method).
--
-- WHY A DB TRIGGER AND NOT JUST THE PORTAL FORM:
-- orders_party_update lets a seller update their own order rows, including
-- status, and only 'delivered' is admin-gated. So a seller can PATCH
-- status='shipped' directly against PostgREST and skip the form entirely.
-- Marking shipped is what starts the payout clock, so the form guard alone is
-- exactly as bypassable as the payout floor turned out to be (see
-- 20260729000002). This makes the invariant hold wherever the write comes from.
--
-- WHAT IS REQUIRED, AND WHY EACH ONE:
--   courier            + tracking_number : identifies a real consignment that
--                                          can be looked up later
--   package_image_url                    : ties the parcel to that consignment
--                                          in a dispute. Not fraud prevention;
--                                          the escrow gate already covers the
--                                          empty-envelope case. This is what
--                                          makes a contested claim adjudicable.
--
-- Deliberately NOT enforced here: that `courier` is from an allowlist. The
-- portal offers a closed dropdown, and a seller who bypasses the UI to write a
-- courier name we do not recognise has still supplied a consignment we can
-- chase. Missing evidence is the money risk; an odd courier string is not.
-- Keeping the list in one place (the UI) avoids a second source of truth.
--
-- !!! APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR, AS ONE SCRIPT. !!!

begin;

-- Blank-safe: '' and '   ' are not evidence.
create or replace function public.orders_require_self_ship_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF NEW.status <> 'shipped' OR OLD.status IS NOT DISTINCT FROM 'shipped' THEN
    RETURN NEW;
  END IF;

  -- Orders we book ourselves get their tracking from Shiprocket, not the
  -- seller, so this rule must not apply to them.
  IF COALESCE(NEW.fulfillment_method, 'zarketplace') <> 'self' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(btrim(NEW.courier), '') = '' THEN
    RAISE EXCEPTION 'Choose the courier you shipped with before marking this order shipped.';
  END IF;

  IF COALESCE(btrim(NEW.tracking_number), '') = '' THEN
    RAISE EXCEPTION 'Enter the tracking number before marking this order shipped.';
  END IF;

  IF COALESCE(btrim(NEW.package_image_url), '') = '' THEN
    RAISE EXCEPTION 'Upload a photo of the packed parcel, with the shipping label visible, before marking this order shipped.';
  END IF;

  RETURN NEW;
END;
$$;

revoke execute on function public.orders_require_self_ship_evidence() from public;
revoke execute on function public.orders_require_self_ship_evidence() from anon;
revoke execute on function public.orders_require_self_ship_evidence() from authenticated;

drop trigger if exists orders_require_self_ship_evidence on public.orders;
create trigger orders_require_self_ship_evidence
  before update on public.orders
  for each row execute function public.orders_require_self_ship_evidence();

-- Evidence is frozen once it has been submitted, mirroring the
-- orders_lock_package_snapshot rule. Otherwise a seller could ship, get the
-- payout clock running, and then swap the tracking number for a different
-- consignment. Admin can still correct a genuine mistake.
create or replace function public.orders_lock_self_ship_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF COALESCE(OLD.fulfillment_method, 'zarketplace') <> 'self'
     OR OLD.status IS DISTINCT FROM 'shipped'
     OR public.is_admin()
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.courier IS DISTINCT FROM OLD.courier
     OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
     OR NEW.package_image_url IS DISTINCT FROM OLD.package_image_url THEN
    RAISE EXCEPTION 'Shipping details are locked once an order is marked shipped. Contact support if something needs correcting.';
  END IF;

  RETURN NEW;
END;
$$;

revoke execute on function public.orders_lock_self_ship_evidence() from public;
revoke execute on function public.orders_lock_self_ship_evidence() from anon;
revoke execute on function public.orders_lock_self_ship_evidence() from authenticated;

drop trigger if exists orders_lock_self_ship_evidence on public.orders;
create trigger orders_lock_self_ship_evidence
  before update on public.orders
  for each row execute function public.orders_lock_self_ship_evidence();

commit;
