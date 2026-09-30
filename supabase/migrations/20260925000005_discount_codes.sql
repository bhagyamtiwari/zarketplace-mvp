-- Discount codes: a rupee amount off an order, made in the admin portal.
--
-- A code is for anyone who has it (a campaign) or for one person (a thank-you,
-- a win-back, a first-order nudge): for_email ties it to one account's email.
-- It is a fixed amount in rupees, as COPY_RULES requires. It comes
-- out of our margin: a discount changes what a buyer pays us, never what we
-- pay a vendor, which was fixed when they accepted our offer.
--
-- The amount is taken off on the server, from the order rows the payment is
-- charged on (create-razorpay-order charges the sum of their total_amount), so
-- what a browser says a code is worth is never what anyone is charged. Codes
-- and their redemptions are operator-only. A buyer reaches them through three
-- functions: check a code, apply it to their own unpaid orders, take it off.
--
-- A redemption is 'held' while its orders wait for payment, 'used' once they
-- are paid, and 'released' if they are never paid, the code is taken off, or
-- every order it paid for is cancelled or refunded. Held redemptions count
-- toward a code's limits until held_until, so two people cannot spend the
-- last use of a code at once.

CREATE TABLE IF NOT EXISTS public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9-]{3,32}$'),
  amount_off numeric(10,2) NOT NULL CHECK (amount_off > 0),
  min_order numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  for_email text CHECK (for_email IS NULL OR for_email = lower(btrim(for_email))),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  once_per_customer boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  purpose text NOT NULL DEFAULT 'other' CHECK (purpose IN ('acquisition', 'retention', 'other')),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_code_key ON public.discount_codes (code);

DROP TRIGGER IF EXISTS discount_codes_updated_at ON public.discount_codes;
CREATE TRIGGER discount_codes_updated_at
  BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.discount_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE RESTRICT,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email text,
  order_numbers text[] NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'used', 'released')),
  held_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS discount_redemptions_code_idx ON public.discount_redemptions (code_id);
CREATE INDEX IF NOT EXISTS discount_redemptions_orders_idx ON public.discount_redemptions USING gin (order_numbers);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discount_codes FROM anon, authenticated;
REVOKE ALL ON public.discount_redemptions FROM anon, authenticated;
-- Operators make and edit codes from the admin portal. Nobody deletes one:
-- switching it off keeps the record of who used it.
GRANT SELECT, INSERT, UPDATE ON public.discount_codes TO authenticated;
GRANT SELECT ON public.discount_redemptions TO authenticated;
DROP POLICY IF EXISTS discount_codes_operators ON public.discount_codes;
CREATE POLICY discount_codes_operators ON public.discount_codes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS discount_redemptions_operators ON public.discount_redemptions;
CREATE POLICY discount_redemptions_operators ON public.discount_redemptions
  FOR SELECT TO authenticated USING (public.is_admin());

-- On the order: which code, and how much of it this row carries. total_amount
-- is already net of it.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_discount_amount_nonneg CHECK (discount_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A new order row never arrives discounted: buyers insert their own order
-- rows, and a discount is only ever put on by apply_discount_code.
CREATE OR REPLACE FUNCTION public.orders_no_client_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.discount_code := NULL;
  NEW.discount_amount := 0;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.orders_no_client_discount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_no_client_discount ON public.orders;
CREATE TRIGGER orders_no_client_discount
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_no_client_discount();

-- The discount fields join the money fields only an admin may change, with
-- one narrow exception: while apply_discount_code or release_discount_on_orders
-- runs (zarketplace.discount on), total_amount, the discount fields and the
-- Razorpay order link may change. Nothing else relaxes.
CREATE OR REPLACE FUNCTION public.orders_enforce_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_discount boolean := COALESCE(current_setting('zarketplace.discount', true), 'off') = 'on';
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() = OLD.buyer_id AND OLD.status = 'awaiting_payment' AND NEW.status = 'awaiting_verification' THEN
      NULL;
    ELSIF auth.uid() = OLD.seller_id AND OLD.status = 'paid' AND NEW.status = 'shipped' THEN
      NULL;
    ELSIF OLD.status = 'awaiting_payment' AND NEW.status = 'payment_failed'
          AND OLD.reservation_expires_at IS NOT NULL AND OLD.reservation_expires_at < now() THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Not allowed to change order status from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR (NOT v_discount AND NEW.total_amount IS DISTINCT FROM OLD.total_amount)
     OR (NOT v_discount AND NEW.discount_amount IS DISTINCT FROM OLD.discount_amount)
     OR (NOT v_discount AND NEW.discount_code IS DISTINCT FROM OLD.discount_code)
     OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR (OLD.seller_upi_vpa_snapshot IS NOT NULL
         AND NEW.seller_upi_vpa_snapshot IS DISTINCT FROM OLD.seller_upi_vpa_snapshot)
     OR (OLD.seller_upi_vpa_snapshot IS NULL
         AND NEW.seller_upi_vpa_snapshot IS NOT NULL
         AND NEW.seller_upi_vpa_snapshot IS DISTINCT FROM
             (SELECT p.default_upi_vpa FROM public.profiles p WHERE p.id = OLD.seller_id))
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR (NOT v_discount AND NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id)
     OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id
     OR NEW.razorpay_signature IS DISTINCT FROM OLD.razorpay_signature
     OR NEW.checkout_group_id IS DISTINCT FROM OLD.checkout_group_id THEN
    RAISE EXCEPTION 'Only admins can modify financial, ownership, or payment-provider fields on an order';
  END IF;

  IF auth.uid() = OLD.seller_id AND (
       NEW.payment_utr IS DISTINCT FROM OLD.payment_utr
       OR NEW.payment_receipt_url IS DISTINCT FROM OLD.payment_receipt_url
       OR NEW.payment_submitted_at IS DISTINCT FROM OLD.payment_submitted_at
       OR NEW.buyer_note IS DISTINCT FROM OLD.buyer_note
     ) THEN
    RAISE EXCEPTION 'Sellers cannot modify buyer payment fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- Why a code cannot be used by this person on an order of this size, or null
-- if it can. Holds on p_ignore_orders (this checkout's own orders) do not
-- count against them, so checking or applying a code twice never trips its
-- own limit.
CREATE OR REPLACE FUNCTION public.discount_code_problem(
  c public.discount_codes, p_uid uuid, p_total numeric, p_ignore_orders text[] DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_used integer;
  v_ignore text[] := COALESCE(p_ignore_orders, '{}'::text[]);
BEGIN
  IF c.id IS NULL THEN RETURN 'We do not recognise that code.'; END IF;
  IF NOT c.active THEN RETURN 'That code is no longer active.'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RETURN 'That code has expired.'; END IF;
  IF c.for_email IS NOT NULL THEN
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_uid;
    IF v_email IS DISTINCT FROM c.for_email THEN RETURN 'That code is for a different account.'; END IF;
  END IF;
  IF c.max_uses IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.discount_redemptions r
     WHERE r.code_id = c.id
       AND (r.status = 'used' OR (r.status = 'held' AND r.held_until > now()))
       AND NOT (r.order_numbers && v_ignore);
    IF v_used >= c.max_uses THEN RETURN 'That code has been used up.'; END IF;
  END IF;
  IF c.once_per_customer AND EXISTS (
       SELECT 1 FROM public.discount_redemptions r
        WHERE r.code_id = c.id AND r.buyer_id = p_uid
          AND (r.status = 'used' OR (r.status = 'held' AND r.held_until > now()))
          AND NOT (r.order_numbers && v_ignore)) THEN
    RETURN 'You have already used this code.';
  END IF;
  IF p_total IS NOT NULL AND p_total < c.min_order THEN
    RETURN format('This code is for orders of Rs. %s or more.', to_char(c.min_order, 'FM999,999,999'));
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.discount_code_problem(public.discount_codes, uuid, numeric, text[]) FROM PUBLIC, anon, authenticated;

-- Takes any code off these unpaid orders and gives back its hold. Internal:
-- reached through apply_discount_code and remove_discount_code.
CREATE OR REPLACE FUNCTION public.release_discount_on_orders(p_order_numbers text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('zarketplace.discount', 'on', true);
  -- The Razorpay order link goes too: that order was made for the old
  -- amount, so the next payment attempt makes a new one.
  UPDATE public.orders
     SET total_amount = total_amount + discount_amount,
         discount_amount = 0,
         discount_code = NULL,
         razorpay_order_id = NULL
   WHERE order_number = ANY(p_order_numbers)
     AND discount_code IS NOT NULL
     AND status IN ('awaiting_payment', 'payment_failed');
  PERFORM set_config('zarketplace.discount', 'off', true);

  UPDATE public.discount_redemptions
     SET status = 'released', released_at = now()
   WHERE status = 'held' AND order_numbers && p_order_numbers;
END $function$;
REVOKE ALL ON FUNCTION public.release_discount_on_orders(text[]) FROM PUBLIC, anon, authenticated;

-- What a code would take off, without applying it: for the order summary.
-- apply_discount_code checks everything again against the real orders.
CREATE OR REPLACE FUNCTION public.check_discount_code(
  p_code text, p_order_total numeric DEFAULT NULL, p_order_numbers text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.discount_codes;
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v_problem text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sign in to use a code.');
  END IF;
  SELECT * INTO c FROM public.discount_codes WHERE code = v_code;
  v_problem := public.discount_code_problem(c, auth.uid(), p_order_total, p_order_numbers);
  IF v_problem IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', v_problem);
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', c.code, 'amount_off', c.amount_off);
END $function$;
REVOKE ALL ON FUNCTION public.check_discount_code(text, numeric, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_discount_code(text, numeric, text[]) TO authenticated;

-- Puts a code on the buyer's own unpaid orders: takes off any code already
-- there, checks the new one against the real totals, and spreads the amount
-- across the rows in whole rupees. Returns what came off and the new total.
CREATE OR REPLACE FUNCTION public.apply_discount_code(p_code text, p_order_numbers text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.discount_codes;
  o record;
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v_n integer;
  v_total numeric;
  v_discount numeric;
  v_left numeric;
  v_share numeric;
  v_applied numeric := 0;
  v_i integer := 0;
  v_problem text;
  v_hold timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use a code.'; END IF;
  IF p_order_numbers IS NULL OR cardinality(p_order_numbers) = 0 THEN
    RAISE EXCEPTION 'There is no order to use the code on.';
  END IF;

  PERFORM 1 FROM public.orders WHERE order_number = ANY(p_order_numbers) FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.orders
   WHERE order_number = ANY(p_order_numbers) AND buyer_id = auth.uid()
     AND status IN ('awaiting_payment', 'payment_failed');
  IF v_n <> cardinality(p_order_numbers) THEN
    RAISE EXCEPTION 'That order cannot take a code any more. Refresh the page and try again.';
  END IF;

  -- Never stacks: whatever code was on these orders comes off first.
  PERFORM public.release_discount_on_orders(p_order_numbers);

  -- Locked, so two checkouts cannot both take the last use of a code.
  SELECT * INTO c FROM public.discount_codes WHERE code = v_code FOR UPDATE;
  SELECT COALESCE(sum(total_amount), 0) INTO v_total FROM public.orders WHERE order_number = ANY(p_order_numbers);
  v_problem := public.discount_code_problem(c, auth.uid(), v_total, p_order_numbers);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION '%', v_problem; END IF;

  -- Never more than the order, less a rupee: nothing to pay is not a payment.
  v_discount := least(c.amount_off, v_total - 1);
  IF v_discount <= 0 THEN RAISE EXCEPTION 'This order is too small for that code.'; END IF;

  -- In proportion to each row's total, whole rupees, the remainder on the
  -- largest row, so every row still adds up on its own.
  PERFORM set_config('zarketplace.discount', 'on', true);
  v_left := v_discount;
  FOR o IN SELECT id, total_amount FROM public.orders
            WHERE order_number = ANY(p_order_numbers)
            ORDER BY total_amount ASC, order_number ASC LOOP
    v_i := v_i + 1;
    IF v_i = v_n THEN
      v_share := v_left;
    ELSE
      v_share := least(v_left, floor(v_discount * o.total_amount / v_total));
    END IF;
    v_share := greatest(0, least(v_share, o.total_amount - 1));
    IF v_share > 0 THEN
      UPDATE public.orders
         SET discount_code = c.code,
             discount_amount = v_share,
             total_amount = total_amount - v_share,
             razorpay_order_id = NULL
       WHERE id = o.id;
      v_applied := v_applied + v_share;
      v_left := v_left - v_share;
    END IF;
  END LOOP;
  PERFORM set_config('zarketplace.discount', 'off', true);

  -- Counted against the code's limits while the buyer pays, and a while
  -- after the hold on the items runs out, for a payment still going through.
  SELECT max(reservation_expires_at) INTO v_hold FROM public.orders WHERE order_number = ANY(p_order_numbers);
  INSERT INTO public.discount_redemptions (code_id, buyer_id, buyer_email, order_numbers, amount, status, held_until)
  VALUES (c.id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), p_order_numbers,
          v_applied, 'held', greatest(COALESCE(v_hold, now()), now()) + interval '30 minutes');

  RETURN jsonb_build_object(
    'code', c.code,
    'amount', v_applied,
    'total', (SELECT sum(total_amount) FROM public.orders WHERE order_number = ANY(p_order_numbers)));
END $function$;
REVOKE ALL ON FUNCTION public.apply_discount_code(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_discount_code(text, text[]) TO authenticated;

-- Takes a code off the buyer's own unpaid orders.
CREATE OR REPLACE FUNCTION public.remove_discount_code(p_order_numbers text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE order_number = ANY(p_order_numbers) AND buyer_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Those are not your orders.';
  END IF;
  PERFORM public.release_discount_on_orders(p_order_numbers);
  RETURN jsonb_build_object(
    'total', (SELECT sum(total_amount) FROM public.orders WHERE order_number = ANY(p_order_numbers)));
END $function$;
REVOKE ALL ON FUNCTION public.remove_discount_code(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_discount_code(text[]) TO authenticated;

-- A redemption follows its orders: used once one is paid, given back if every
-- order it paid for is cancelled or refunded.
CREATE OR REPLACE FUNCTION public.discount_follow_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.discount_code IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'paid' THEN
    -- Only the code the order was paid with: one taken off and swapped for
    -- another before paying stays released.
    UPDATE public.discount_redemptions r
       SET status = 'used', used_at = COALESCE(r.used_at, now())
     WHERE r.order_numbers @> ARRAY[NEW.order_number]
       AND r.status = 'held'
       AND r.code_id = (SELECT d.id FROM public.discount_codes d WHERE d.code = NEW.discount_code);
  ELSIF NEW.status IN ('cancelled', 'refunded') THEN
    UPDATE public.discount_redemptions r
       SET status = 'released', released_at = now()
     WHERE r.order_numbers @> ARRAY[NEW.order_number]
       AND r.status IN ('held', 'used')
       AND NOT EXISTS (
         SELECT 1 FROM public.orders x
          WHERE x.order_number = ANY(r.order_numbers) AND x.id <> NEW.id
            AND x.status NOT IN ('cancelled', 'refunded', 'payment_failed'));
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.discount_follow_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_discount_follow ON public.orders;
CREATE TRIGGER orders_discount_follow
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.discount_follow_order();
