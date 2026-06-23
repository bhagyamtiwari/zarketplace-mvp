-- Razorpay integration: columns needed to track a Razorpay order/payment
-- against our orders, plus a checkout_group_id so multiple cart rows paid
-- in one Razorpay Checkout session can be looked up together.
--
-- Status flow once Razorpay is wired up:
--   awaiting_payment --(razorpay-webhook: payment.captured)--> paid
--   awaiting_payment --(razorpay-webhook: payment.failed)----> payment_failed
--   paid             --(seller ships, enforced by existing trigger)--> shipped
-- payment_failed orders can retry: create-razorpay-order reuses the same
-- razorpay_order_id and the buyer reopens Razorpay Checkout.
--
-- Only the service role (used by create-razorpay-order and razorpay-webhook)
-- or an admin can ever write these columns or set status to
-- 'paid'/'payment_failed' — enforced by the existing
-- orders_enforce_transitions trigger, which already exempts service_role.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS checkout_group_id uuid;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('awaiting_payment','awaiting_verification','paid','payment_failed','shipped','cancelled','refunded')
);

-- Not unique: one Razorpay order/payment covers a whole checkout_group_id,
-- i.e. every cart-item order row in that group shares the same
-- razorpay_order_id and razorpay_payment_id.
CREATE INDEX IF NOT EXISTS orders_razorpay_order_id_idx
  ON public.orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_razorpay_payment_id_idx
  ON public.orders (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_checkout_group_idx
  ON public.orders (checkout_group_id) WHERE checkout_group_id IS NOT NULL;
