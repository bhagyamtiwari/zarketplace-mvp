# Admin Operations

How admins move a product/order through its lifecycle, where manual
intervention is required, and the SQL to do each step by hand in the Supabase
SQL editor (Dashboard → SQL Editor) when the Admin UI isn't enough.

Everything below can also be done in the Admin Portal at `/admin`
(Listings, Orders, Users tabs). The SQL is the manual fallback / bulk path.

---

## The lifecycle at a glance

**Listing** (`public.listings.status`): `pending` → `approved` | `rejected`
A listing is also flagged `is_sold = true/false` to control visibility.

**Order** (`public.orders.status`):
`awaiting_payment` → `paid` → `shipped` → `delivered`
plus `payment_failed` / `payment_conflict` / `cancelled` / `refunded` as exits.

Payment is **Razorpay only** (see `docs/PAYMENTS.md`). The buyer pays in the
Razorpay Checkout modal and a signature-verified webhook - **the only thing
that ever sets a paid status** - flips the order to `paid` and claims the
listing. There is no manual "verify the UPI, then mark paid" step anymore.

| Stage | Who acts | What happens |
|-------|----------|--------------|
| `awaiting_payment` | Buyer | Order row created at checkout, before the Razorpay payment is captured. |
| `paid` | **Razorpay webhook** (automatic) | Razorpay captured the payment; the `razorpay-webhook` edge function verified the HMAC signature, called `fulfill_captured_payment` (atomically marks the order `paid` and claims the listing `is_sold = true`), and emailed buyer + seller. No admin action. |
| `payment_failed` | Razorpay webhook (automatic) | Payment failed at checkout; the order never leaves this exit state. |
| `payment_conflict` | Razorpay webhook (automatic) | Money was captured twice for one one-of-one item (should be near-impossible given the reservation lock). Needs a **manual Razorpay refund** - see §5. |
| `shipped` | Seller (or Admin) | Item is packed and handed off for pickup. Either admin books a Shiprocket pickup (which auto-flips to `shipped`) or the seller pastes a tracking link in the Seller Portal; buyer gets a "Shipped" email. |
| `delivered` | **Admin** (Shiprocket webhook later) | Admin marks the order delivered once the item has arrived. This is the escrow trigger: a DB trigger stamps `delivered_at`, opens the buyer's 48-hour review window (`review_ends_at`), and auto-creates the `seller_payouts` row (`releasable_at` = delivery + 48h). **Only admin (or a service-role caller) can set `delivered`.** |
| *payout* | **Admin** | Once the review window has closed with no open claim, admin pays the seller to their UPI (100% of the item price, `orders.amount`, not `total_amount`) and marks the payout `paid_out`. RLS blocks flipping a payout to `paid_out` before the window closes. |
| `cancelled` / `refunded` | **Admin** | Exit states. The listing is automatically relisted (`is_sold = false`). |

---

## (3a) What happens after a buyer pays (no manual step)

When a buyer completes the Razorpay Checkout, **you do nothing** to mark the
order paid. Razorpay captures the payment and calls the `razorpay-webhook`
edge function, which verifies the signature and flips the order from
`awaiting_payment` to `paid` (claiming the listing) on its own. Buyer and
seller are emailed automatically.

Never set an order to `paid` by hand - the webhook is the single source of
truth for payment status, and doing it manually would mark an order paid whose
money never actually arrived in Razorpay.

Your first real touch on a `paid` order is **shipping** (§3b.3): either book a
Shiprocket pickup or wait for the seller to add tracking.

### SQL — see orders that have been paid and are awaiting fulfilment
```sql
select order_number, buyer_name, buyer_email, total_amount,
       listing_title, buyer_note, status, created_at
from public.orders
where status = 'paid'
order by created_at asc;
```

### SQL — spot stuck or failed payments
```sql
-- Never captured (buyer abandoned checkout) or failed
select order_number, buyer_email, total_amount, status, created_at
from public.orders
where status in ('awaiting_payment', 'payment_failed', 'payment_conflict')
order by created_at desc;
```

A `payment_conflict` row means Razorpay captured money twice for one item and
needs a **manual refund** - see §5.

---

## (3b) Every point where an admin has to intervene

### 1. Approve / reject new listings
New listings start as `pending` and are invisible to buyers until approved.

```sql
-- See the approval queue
select id, sku, title, brand, price, seller_email, created_at
from public.listings
where status = 'pending'
order by created_at asc;

-- Approve one listing
update public.listings set status = 'approved' where id = '<listing-uuid>';

-- Reject one listing
update public.listings set status = 'rejected' where id = '<listing-uuid>';
```

### 2. Payment (automatic - no admin step)
Razorpay's webhook marks orders `paid`; you never do. See (3a) above. The only
payment states that need you are `payment_conflict` (manual refund, §5).

### 3. Book pickup (Shiprocket) or confirm/force shipping
For a `paid` order, `/admin → Orders` shows a **Book Pickup (Shiprocket)**
button (only once the `SHIPROCKET_*` secrets are set - see `docs/SETUP.md`
§4). Clicking it registers the seller's pickup address with Shiprocket,
creates the order, assigns a courier + AWB, generates the label, and flips
the order to `shipped` automatically. See `docs/SHIPPING.md` for the full
flow and its known simplifications (fixed per-category weight, no rate
comparison).

If Shiprocket isn't configured, or a particular seller ships some other way,
sellers add tracking themselves from the Seller Portal, which sets
`status = 'shipped'` and emails the buyer. If a seller can't, an admin can do
it directly:

```sql
update public.orders
set status = 'shipped',
    courier = 'Delhivery',
    tracking_number = 'ABC123456',
    tracking_url = 'https://www.delhivery.com/track/package/ABC123456',
    shipped_at = now()
where order_number = 'ZKT-12345';
```

### 4. Mark delivered, then release the seller payout
Payouts are **delivery-gated**, not shipping-gated. Once the item has arrived,
mark the order `delivered`:

```sql
update public.orders set status = 'delivered' where order_number = 'ZKT-12345';
```

That single update fires the `on_order_delivered` trigger, which stamps
`delivered_at`, sets `review_ends_at = now() + 48h`, and creates the
`seller_payouts` row automatically (status `awaiting_payout`, `releasable_at`
= the review deadline). Do **not** create payout rows by hand.

After the 48-hour review window closes with no open claim, pay the seller and
mark the payout `paid_out`. The seller's UPI is snapshotted on the order so it
can't change after the sale, and the payout is **100% of the item price
(`orders.amount`)** — never `total_amount`, which also includes the buyer-paid
shipping and Buyer Protection fee:

```sql
-- Get the seller's payout UPI and the correct payout amount for an order
select o.order_number, o.seller_email, o.seller_upi_vpa_snapshot,
       o.amount as payout_amount, p.status as payout_status, p.releasable_at
from public.orders o
join public.seller_payouts p on p.order_id = o.id
where o.order_number = 'ZKT-12345';
```

Pay that UPI manually, then mark the payout paid and notify the seller:

```sql
update public.seller_payouts set status = 'paid_out', paid_at = now()
where order_id = (select id from public.orders where order_number = 'ZKT-12345');
```

RLS blocks flipping a payout to `paid_out` before `releasable_at` has passed or
while the order has an open claim. The payout email (`payout_released_seller`)
is sent from the app/edge function.

### 4a. Claims (SNAD - significantly not as described)
`orders.claim_open` is what actually holds a payout past its review window
(the `seller_payouts_admin_update` RLS policy blocks `paid_out` while
`claim_open = true` - see migration `20260710000001`). It's locked to
admin-only writes (migration `20260711000001_shiprocket_and_claim_lockdown.sql`)
so a seller can never clear their own claim.

Per `RefundPolicy.tsx`, buyers raise a claim by emailing
`contact@zarketplace.com` with their order number and photos within 48 hours
of delivery - this is intentionally email-based at MVP (no in-app claim
form), matching `docs/REALIGNMENT_PLAN.md` §P0-8. When one comes in:

1. Open `/admin → Orders`, find the order, click the **Claim** column
   (shows "None - open one"). This sets `claim_open = true` and immediately
   blocks that order's payout, even if the review window has already closed.
2. Review the claim (photos, order details, seller's side if needed).
3. Once resolved, click the same control again ("Open - close it") to clear
   `claim_open`. If the claim is upheld, refund the buyer per §5 below
   instead of just closing the claim (closing it alone would release the
   seller's payout).

```sql
-- Equivalent direct SQL, if ever needed outside the Admin UI
update public.orders set claim_open = true  where order_number = 'ZKT-12345';
update public.orders set claim_open = false where order_number = 'ZKT-12345';
```

### 5. Cancellations & refunds
There is **no automated refund** today. To actually return money to a buyer,
first issue the refund from the **Razorpay dashboard** (Payments → find the
payment → Refund), then set `orders.status = 'refunded'`. A `payment_conflict`
order (money captured twice for one one-of-one item) is refunded the same way:
refund the duplicate payment in Razorpay, then mark that order `refunded`.

Setting an order to `cancelled` or `refunded` automatically relists the item
(`is_sold = false`) when done through the Admin UI. Doing it in raw SQL, set
both yourself:

```sql
update public.orders set status = 'cancelled' where order_number = 'ZKT-12345';
-- or 'refunded'

-- Relist the item so it's buyable again
update public.listings l
set is_sold = false
from public.orders o
where o.order_number = 'ZKT-12345' and l.id = o.listing_id;
```

### 6. Deleting a listing
Sellers can delete their own listings from the Seller Portal, and admins can
delete any listing from the Admin Portal → Listings tab (trash icon). Deletes
are permanent. The `orders.listing_id` foreign key is `ON DELETE SET NULL`, so
**any existing order keeps its snapshot** (title, SKU, image, amounts) — the
sale history is preserved; only the live listing is removed. Cart entries
referencing it are removed automatically.

```sql
-- Delete one listing by SKU
delete from public.listings where sku = 'ZV-12345';

-- Delete one listing by id
delete from public.listings where id = '<listing-uuid>';

-- Bulk: delete all of a seller's UNSOLD listings (careful!)
delete from public.listings
where seller_email = 'seller@example.com' and is_sold = false;
```

If you'd rather hide a listing than delete it (keeps it editable/restorable),
set its status instead — this pulls it from Browse without losing the row:
```sql
update public.listings set status = 'rejected' where sku = 'ZV-12345';
```

### 7. Managing admins
```sql
-- Grant admin
update public.profiles set is_admin = true  where email = 'someone@example.com';
-- Revoke admin
update public.profiles set is_admin = false where email = 'someone@example.com';
```

---

## Notes
- RLS allows admins (`public.is_admin()`) to update any listing/order, so the
  Admin UI uses the normal client. The SQL editor runs as the service role and
  bypasses RLS entirely — be careful.
- Never set an order to `paid` by hand. The Razorpay webhook is the only
  writer of paid status; a manual flip would mark an order paid whose money
  was never captured. The seller payout (§4) is the manual UPI transfer, gated
  on `delivered` + a closed 48-hour review window.
