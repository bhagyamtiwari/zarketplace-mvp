-- Shipping v2, part 1 of 2: split free_shipping into two independent axes.
--
-- See docs/SHIPPING_V2_PLAN.md. Three valid combinations:
--
--   payer=buyer,  fulfilment=zarketplace  buyer pays at checkout, seller keeps full price
--   payer=seller, fulfilment=zarketplace  buyer sees Free, rate deducted from payout
--   payer=seller, fulfilment=self         buyer sees Free, seller shipped it, NO deduction
--
-- payer=buyer + fulfilment=self is rejected: quoting a buyer for a shipment we
-- do not control has no honest answer.
--
-- THE TRAP THIS SPLIT CREATES:
-- "Free shipping" no longer implies "deduct the rate". Under self-ship the
-- buyer sees Free but the seller already paid a courier directly, so deducting
-- would underpay them by the full rate, silently. The two predicates are:
--
--   charge the buyer : shipping_payer = 'buyer'
--   deduct from payout: shipping_payer = 'seller' AND fulfillment_method = 'zarketplace'
--
-- Neither one is free_shipping. Anything still keyed on free_shipping is
-- correct for DISPLAY ("does the buyer see Free?") and wrong for PAYOUT.
--
-- !!! APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR, AS ONE SCRIPT. !!!
-- The migration ledger has drifted from this repo, so `db push` is not the
-- path here (see 20260729000001 header).
--
-- WHAT THIS FILE DELIBERATELY DOES NOT TOUCH:
-- orders_snapshot_from_listing() and handle_order_delivered() both exist in
-- this repo in STALE form - the live copies carry free_shipping work applied
-- out of band. Regenerating either from a repo file silently reverts it. So
-- the new columns are snapshotted by a SEPARATE, ADDITIVE trigger below, and
-- the payout predicate is changed in part 2, which must be written against a
-- fresh dump of the live function. Part 1 is safe to apply on its own: it
-- changes no money path.

begin;

-- 1. Listings --------------------------------------------------------------

alter table public.listings
  add column if not exists shipping_payer text not null default 'buyer',
  add column if not exists fulfillment_method text not null default 'zarketplace';

-- Backfill before constraining. Self-ship did not exist, so every historical
-- row maps cleanly: free delivery meant zarketplace shipped it on the seller's
-- rupee.
update public.listings
   set shipping_payer = case when free_shipping then 'seller' else 'buyer' end,
       fulfillment_method = 'zarketplace'
 where shipping_payer is distinct from (case when free_shipping then 'seller' else 'buyer' end)
    or fulfillment_method is null;

alter table public.listings drop constraint if exists listings_shipping_payer_check;
alter table public.listings add constraint listings_shipping_payer_check
  check (shipping_payer in ('buyer', 'seller'));

alter table public.listings drop constraint if exists listings_fulfillment_method_check;
alter table public.listings add constraint listings_fulfillment_method_check
  check (fulfillment_method in ('zarketplace', 'self'));

alter table public.listings drop constraint if exists listings_valid_shipping_combo;
alter table public.listings add constraint listings_valid_shipping_combo
  check (not (shipping_payer = 'buyer' and fulfillment_method = 'self'));

-- free_shipping stays a real column so the five existing readers (the
-- Marketplace filter, ListingCard, ProductPage, Checkout, the payout email)
-- keep working. It is NOT converted to a generated column, because Sell.tsx
-- and orders_snapshot_from_listing() both write it and generated columns
-- cannot be written.
--
-- RECONCILIATION, AND WHY IT EXISTS:
-- The obvious move is a bare CHECK asserting the two agree, so a writer that
-- sets one and not the other fails loudly instead of drifting silently. That
-- is right for steady state and wrong for the deploy.
--
-- The currently deployed sell form writes free_shipping and knows nothing
-- about shipping_payer. Under a bare CHECK, the moment this migration is
-- applied, every free-shipping listing from the live site inserts
-- free_shipping = true with shipping_payer defaulting to 'buyer' and fails the
-- constraint. That couples the migration to the front-end deploy: the sell
-- form is broken for whatever window sits between them.
--
-- So the two are reconciled first, and the CHECK is kept behind it as a final
-- assertion. BEFORE triggers run before constraint evaluation, so anything
-- this can reconcile passes and anything it cannot still fails loudly.
-- Old code, new code, and admin edits from either all work, and the migration
-- can be applied whenever.
create or replace function public.listings_reconcile_shipping_model()
returns trigger
language plpgsql
set search_path = public
as $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- free_shipping = true with the DEFAULT payer is the signature of a writer
    -- that predates these columns: nothing else produces that combination,
    -- since buyer-pays plus free-to-buyer is a contradiction. Trust
    -- free_shipping and derive the payer.
    IF NEW.free_shipping AND NEW.shipping_payer = 'buyer' THEN
      NEW.shipping_payer := 'seller';
    ELSE
      -- A writer that knows about the new columns is authoritative.
      NEW.free_shipping := (NEW.shipping_payer = 'seller');
    END IF;

  ELSIF NEW.free_shipping IS DISTINCT FROM OLD.free_shipping
        AND NEW.shipping_payer IS NOT DISTINCT FROM OLD.shipping_payer THEN
    -- Only the old column moved, so the write came from old code (or the admin
    -- UI toggling free shipping). Follow it.
    NEW.shipping_payer := CASE WHEN NEW.free_shipping THEN 'seller' ELSE 'buyer' END;

  ELSE
    -- The new columns moved, or nothing did. They win.
    NEW.free_shipping := (NEW.shipping_payer = 'seller');
  END IF;

  -- buyer-pays + self-ship is rejected by listings_valid_shipping_combo. When
  -- the reconciliation above lands on 'buyer', a stale 'self' would trip that
  -- constraint on a row the writer never meant to make invalid.
  IF NEW.shipping_payer = 'buyer' THEN
    NEW.fulfillment_method := 'zarketplace';
  END IF;

  RETURN NEW;
END;
$$;

revoke execute on function public.listings_reconcile_shipping_model() from public;
revoke execute on function public.listings_reconcile_shipping_model() from anon;
revoke execute on function public.listings_reconcile_shipping_model() from authenticated;

-- Name matters: BEFORE triggers fire alphabetically, and this has to run
-- before listings_require_positive_payout so the floor sees reconciled values.
-- 'reconcile' sorts before 'require'.
drop trigger if exists listings_reconcile_shipping_model on public.listings;
create trigger listings_reconcile_shipping_model
  before insert or update on public.listings
  for each row execute function public.listings_reconcile_shipping_model();

alter table public.listings drop constraint if exists listings_free_shipping_agrees;
alter table public.listings add constraint listings_free_shipping_agrees
  check (free_shipping = (shipping_payer = 'seller'));

-- 2. Orders ----------------------------------------------------------------

alter table public.orders
  add column if not exists shipping_payer text not null default 'buyer',
  add column if not exists fulfillment_method text not null default 'zarketplace';

update public.orders
   set shipping_payer = case when free_shipping then 'seller' else 'buyer' end,
       fulfillment_method = 'zarketplace'
 where shipping_payer is distinct from (case when free_shipping then 'seller' else 'buyer' end)
    or fulfillment_method is null;

alter table public.orders drop constraint if exists orders_shipping_payer_check;
alter table public.orders add constraint orders_shipping_payer_check
  check (shipping_payer in ('buyer', 'seller'));

alter table public.orders drop constraint if exists orders_fulfillment_method_check;
alter table public.orders add constraint orders_fulfillment_method_check
  check (fulfillment_method in ('zarketplace', 'self'));

-- 3. Snapshot the model onto the order -------------------------------------

-- Additive and separate from orders_snapshot_from_listing() on purpose: that
-- function owns total_amount and is stale in this repo, so it is left alone.
--
-- Values are taken from the listing UNCONDITIONALLY, never from the client
-- payload. Payout keys off these columns, so a buyer must not be able to post
-- their own values. free_shipping is set here too, to the same value the other
-- trigger derives, so the pair cannot disagree even on the service_role path
-- where that trigger returns early.
create or replace function public.orders_snapshot_shipping_model()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  l public.listings;
BEGIN
  IF NEW.listing_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO l FROM public.listings WHERE id = NEW.listing_id;
  IF NOT FOUND THEN
    RETURN NEW; -- orders_snapshot_from_listing already raises on this
  END IF;

  NEW.shipping_payer := l.shipping_payer;
  NEW.fulfillment_method := l.fulfillment_method;
  NEW.free_shipping := (l.shipping_payer = 'seller');

  RETURN NEW;
END;
$$;

revoke execute on function public.orders_snapshot_shipping_model() from public;
revoke execute on function public.orders_snapshot_shipping_model() from anon;
revoke execute on function public.orders_snapshot_shipping_model() from authenticated;

-- BEFORE triggers fire in alphabetical order by trigger name, so
-- orders_snapshot_from_listing runs first and computes total_amount from the
-- listing. This one then stamps the model columns. No interference: it writes
-- no amount.
drop trigger if exists orders_snapshot_shipping_model on public.orders;
create trigger orders_snapshot_shipping_model
  before insert on public.orders
  for each row execute function public.orders_snapshot_shipping_model();

-- 4. Narrow the payout floor ------------------------------------------------

-- Body below is the LIVE definition (dumped 2026-07-29, see
-- 20260729000002_block_zero_payout_listings.sql) with one predicate changed.
--
-- The floor exists because a free-delivery seller has the rate deducted, so a
-- price at or below the rate pays them nothing. Under self-ship there is no
-- deduction, so the floor must not apply: a Rs. 120 tee shipped by the seller
-- themselves is perfectly valid and pays them the full Rs. 120. Keyed on
-- free_shipping it would reject that listing for no reason.
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
  -- Only the combination that actually deducts. See the predicate note at the
  -- top of this migration.
  IF NOT (NEW.shipping_payer = 'seller' AND NEW.fulfillment_method = 'zarketplace')
     OR NEW.status NOT IN ('pending', 'approved') THEN
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
  before insert or update of price, sale_price, free_shipping, shipping_category,
                             status, shipping_payer, fulfillment_method
  on public.listings
  for each row execute function public.listings_require_positive_payout();

commit;
