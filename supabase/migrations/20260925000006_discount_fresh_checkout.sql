-- A buyer whose hold ran out starts a fresh checkout: new order rows, the
-- same code. Their own earlier attempt was still 'held', so the code said
-- "You have already used this code" to the person who never got to use it.
--
-- Now a buyer's own unpaid holds never count against them: only their paid
-- uses do, and other people's holds still count toward max_uses so two
-- buyers cannot spend its last use at once. And when the code goes on a new
-- checkout, it comes off the buyer's earlier unpaid orders, so paying both
-- cannot use it twice.

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
       AND (r.status = 'used'
            OR (r.status = 'held' AND r.held_until > now() AND r.buyer_id IS DISTINCT FROM p_uid))
       AND NOT (r.order_numbers && v_ignore);
    IF v_used >= c.max_uses THEN RETURN 'That code has been used up.'; END IF;
  END IF;
  IF c.once_per_customer AND EXISTS (
       SELECT 1 FROM public.discount_redemptions r
        WHERE r.code_id = c.id AND r.buyer_id = p_uid AND r.status = 'used'
          AND NOT (r.order_numbers && v_ignore)) THEN
    RETURN 'You have already used this code.';
  END IF;
  IF p_total IS NOT NULL AND p_total < c.min_order THEN
    RETURN format('This code is for orders of Rs. %s or more.', to_char(c.min_order, 'FM999,999,999'));
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.discount_code_problem(public.discount_codes, uuid, numeric, text[]) FROM PUBLIC, anon, authenticated;

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

  -- This buyer's earlier checkouts with the same code that were never paid:
  -- the code comes off those orders, so it only ever sits on one checkout.
  IF c.id IS NOT NULL THEN
    PERFORM public.release_discount_on_orders(r.order_numbers)
       FROM public.discount_redemptions r
      WHERE r.buyer_id = auth.uid() AND r.code_id = c.id AND r.status = 'held'
        AND NOT (r.order_numbers && p_order_numbers)
        AND NOT EXISTS (
          SELECT 1 FROM public.orders x
           WHERE x.order_number = ANY(r.order_numbers)
             AND x.status NOT IN ('awaiting_payment', 'payment_failed', 'cancelled'));
  END IF;

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
