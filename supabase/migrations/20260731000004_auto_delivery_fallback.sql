-- Auto-delivery fallback, so orders stop stalling forever with no delivery
-- signal. See docs/SHIPPING_V2_PLAN.md.
--
-- THE PROBLEM: status 'delivered' is what creates the payout row
-- (handle_order_delivered). Today only an admin sets it by hand. Self-shipped
-- orders have no webhook at all, and even Shiprocket ones can miss the final
-- scan, so a seller can be left unpaid indefinitely through no fault of theirs.
--
-- WHAT THIS IS NOT: a replacement for the delivery gate. Payout still waits for
-- delivery plus the 48-hour review window. This only supplies a delivery signal
-- when no better one ever arrives, which is a fallback, not a shortcut.
-- Migration 20260710000001 exists precisely because paying at ship time broke
-- the buyer-protection promise; do not undo that here.
--
-- WHY THIS IS SAFE TO AUTOMATE: flipping to 'delivered' creates a payout ROW,
-- it does not pay anyone. seller_payouts.status -> 'paid_out' is admin-only and
-- still requires the review window to have closed with no open claim. So a
-- human reviews every auto-delivered order before money moves, which is what
-- makes running this unattended acceptable.
--
-- STILL MISSING, DELIBERATELY: the courtesy email telling the buyer their order
-- should have arrived and that they have 48 hours to say otherwise. Sending
-- mail from cron needs pg_net plus a service key in vault, which is a secret-
-- handling decision to make separately. Until then, assumed deliveries are
-- surfaced in admin (delivery_source = 'assumed') for a human to eyeball.
--
-- !!! APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR, AS ONE SCRIPT. !!!
-- pg_cron may need enabling under Database > Extensions first.

begin;

-- 1. Columns -----------------------------------------------------------------

alter table public.orders
  add column if not exists auto_deliver_at timestamptz,
  add column if not exists delivery_source text;

alter table public.orders drop constraint if exists orders_delivery_source_check;
alter table public.orders add constraint orders_delivery_source_check
  check (delivery_source is null or delivery_source in ('courier', 'assumed', 'admin'));

comment on column public.orders.delivery_source is
  'How delivery was established: courier webhook, assumed by the auto-delivery '
  'fallback, or set by an admin. Buyer-facing copy must not claim a courier '
  'confirmed delivery when this is ''assumed''.';

-- 2. Stamp the deadline when an order ships ----------------------------------

-- Self-shipped orders get longer: their tracking is weaker (India Post is the
-- common case and has no webhook we consume), so they deserve more benefit of
-- the doubt before we assume anything.
create or replace function public.orders_stamp_auto_deliver_at()
returns trigger
language plpgsql
set search_path = public
as $$
BEGIN
  IF NEW.status = 'shipped' AND OLD.status IS DISTINCT FROM 'shipped' THEN
    NEW.auto_deliver_at := COALESCE(NEW.shipped_at, now())
      + CASE WHEN COALESCE(NEW.fulfillment_method, 'zarketplace') = 'self'
             THEN interval '10 days'
             ELSE interval '7 days'
        END;
  END IF;
  RETURN NEW;
END;
$$;

revoke execute on function public.orders_stamp_auto_deliver_at() from public;
revoke execute on function public.orders_stamp_auto_deliver_at() from anon;
revoke execute on function public.orders_stamp_auto_deliver_at() from authenticated;

drop trigger if exists orders_stamp_auto_deliver_at on public.orders;
create trigger orders_stamp_auto_deliver_at
  before update on public.orders
  for each row execute function public.orders_stamp_auto_deliver_at();

-- 3. The sweep ---------------------------------------------------------------

-- Only touches orders still sitting at 'shipped' past their deadline. An order
-- with an open claim is skipped: a buyer who has already raised a problem must
-- never be auto-marked delivered underneath their own dispute.
--
-- Cancelled and refunded orders are excluded by the status filter, so a
-- cancellation before delivery can never produce a payout row.
create or replace function public.auto_deliver_stale_shipments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  touched integer;
BEGIN
  UPDATE public.orders
     SET status = 'delivered',
         delivery_source = 'assumed'
   WHERE status = 'shipped'
     AND auto_deliver_at IS NOT NULL
     AND auto_deliver_at <= now()
     AND NOT claim_open;

  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched;
END;
$$;

revoke execute on function public.auto_deliver_stale_shipments() from public;
revoke execute on function public.auto_deliver_stale_shipments() from anon;
revoke execute on function public.auto_deliver_stale_shipments() from authenticated;

-- 4. Schedule ----------------------------------------------------------------

create extension if not exists pg_cron;

-- Idempotent: unschedule first so re-running this file does not stack jobs.
do $$
BEGIN
  PERFORM cron.unschedule('auto-deliver-stale-shipments');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END;
$$;

-- Daily at 02:30 UTC (08:00 IST). Hourly would buy nothing: the deadline is
-- measured in days, and a daily sweep keeps the blast radius of a bad run to
-- one batch a day.
select cron.schedule(
  'auto-deliver-stale-shipments',
  '30 2 * * *',
  $$SELECT public.auto_deliver_stale_shipments();$$
);

commit;

-- Backfill note: existing shipped orders have auto_deliver_at NULL and are
-- therefore ignored by the sweep, on purpose. Deciding they were delivered
-- based on a shipped_at from before this rule existed would be asserting
-- something nobody ever measured. Mark those by hand.
