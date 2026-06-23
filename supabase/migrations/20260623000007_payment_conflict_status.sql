-- Self-review follow-up on C3: the reservation lock (20260623000006) closes
-- the common case — two buyers can no longer both hold a fresh
-- awaiting_payment reservation for the same listing at once. But a retried
-- order (status payment_failed, outside the reservation lock) can still end
-- up racing a *different* buyer's fresh reservation: both open a Razorpay
-- Checkout modal while the listing still looks available, and both can
-- complete payment minutes apart. create-razorpay-order's availability
-- check (20260623000006) only catches this if the conflict already existed
-- *before* either modal opened — not if both pass that check and then both
-- pay.
--
-- The only fully atomic place to guarantee "at most one paid order per
-- listing" is at the moment of marking payment captured, in the webhook.
-- This adds a status for the rare case where Razorpay has genuinely
-- captured two payments for the same listing: the first capture wins and is
-- fulfilled normally; the second is marked payment_conflict instead of
-- paid, so it can never proceed to shipping, and is flagged for a manual
-- refund via the Razorpay dashboard until automatic refunds are built.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'awaiting_payment','awaiting_verification','paid','payment_failed',
    'payment_conflict','shipped','cancelled','refunded'
  )
);
