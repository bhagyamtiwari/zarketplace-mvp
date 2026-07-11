# Payments - zarketplace MVP

The payment stack is **Razorpay only**. This document explains how money moves,
what is automated today, and what is still manual.

> **TL;DR (current behaviour):**
> Buyer pays via Razorpay Checkout → the money lands in the platform's Razorpay
> account → a signature-verified webhook (and only the webhook) marks the order
> `paid` and claims the listing. The seller's money is then held in escrow: a
> `seller_payouts` row is created automatically when the order is marked
> `delivered`, and released only after the buyer's 48-hour review window closes
> with no open claim. The actual UPI transfer to the seller is done manually by
> an admin today.

---

## 1. Components

| Piece | What it does |
|---|---|
| `create-razorpay-order` (edge fn) | Validates the pending order(s) in a checkout group, creates (or idempotently reuses) a Razorpay **Order** via `POST https://api.razorpay.com/v1/orders`, and returns `razorpay_order_id` + the public `key_id` to the browser. |
| Razorpay Checkout (`checkout.razorpay.com/v1/checkout.js`) | The modal the buyer pays in. Loaded lazily in `src/pages/Checkout.tsx` (only on checkout, not every page). |
| `razorpay-webhook` (edge fn) | Public endpoint Razorpay calls after payment. HMAC-verified via `X-Razorpay-Signature` + `RAZORPAY_WEBHOOK_SECRET`. **The only place `orders.status` is ever set to `paid` / `payment_failed`.** Idempotent. Calls the `fulfill_captured_payment` RPC (atomically marks the order paid and claims the listing `is_sold`), then fires confirmation emails. |
| `seller_payouts` table | One row per delivered order, created by a DB trigger at delivery time. Tracks what the seller is owed and whether it's been paid. |

The client never sets payment status. Reservation locking and atomic
fulfilment live in the migrations (see `20260623000008_atomic_payment_fulfillment.sql`).

---

## 2. Money flow today

```
┌───────────┐    ① pay      ┌──────────────────┐
│  Buyer    │ ────────────▶ │  Razorpay        │
└───────────┘               │  Checkout        │
                            └────────┬─────────┘
                                     │ ② signed webhook
                                     ▼
                            ┌──────────────────────┐
                            │ razorpay-webhook      │
                            │  verifies HMAC        │
                            │  fulfill_captured_...  │
                            │   orders.status='paid' │
                            │   listings.is_sold=T   │
                            └──────────┬───────────┘
                                       │
                     ③ seller packs, hands off for pickup
                        (order -> shipped, tracking added)
                                       │
                     ④ admin marks order 'delivered'
                        DB trigger: review_ends_at = now()+48h,
                        creates seller_payouts row (awaiting_payout)
                                       │
                     ⑤ review window closes, no open claim
                        admin pays seller's UPI manually,
                        marks payout 'paid_out' + emails seller
                                       ▼
                                Seller's UPI
```

Payout amount is **`orders.amount`** (the item price, 100% of the seller's
asking price) - never `total_amount`, which also includes the buyer-paid
shipping and the Buyer Protection fee.

See [`ADMIN_OPERATIONS.md`](ADMIN_OPERATIONS.md) for the exact admin steps and
the RLS that blocks a payout from being released before its review window
closes.

---

## 3. Configuration

### 3.1 Edge function secrets

Set in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**, or via CLI:

```bash
supabase secrets set \
  RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxx" \
  RAZORPAY_KEY_SECRET="<rzp test secret>" \
  RAZORPAY_WEBHOOK_SECRET="<set when creating the webhook>" \
  PUBLIC_SITE_URL="https://zarketplace.com" \
  RESEND_API_KEY="<your_resend_key>" \
  EMAIL_FROM="zarketplace <orders@zarketplace.com>"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected - don't set them.
`RAZORPAY_WEBHOOK_SECRET` is separate from `RAZORPAY_KEY_SECRET`; you set it when
you create the webhook (§3.3).

### 3.2 Frontend env (`.env.local`)

```env
VITE_SUPABASE_URL=https://wfaxtxprngyrxsmahxxa.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
```

The public Razorpay `key_id` is returned to the browser by
`create-razorpay-order`, so the frontend does not need a Razorpay env var.

### 3.3 Webhook setup in Razorpay

Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:

- URL: `https://wfaxtxprngyrxsmahxxa.supabase.co/functions/v1/razorpay-webhook`
- Active events: `payment.captured`, `payment.failed`
- Set a **secret** and store the same value as the `RAZORPAY_WEBHOOK_SECRET`
  edge function secret.

Deploy the webhook with JWT verification disabled so Razorpay can reach it
without a Supabase Authorization header (configured in `supabase/config.toml`):

```bash
supabase functions deploy create-razorpay-order
supabase functions deploy razorpay-webhook --no-verify-jwt
supabase functions deploy send-email
```

### 3.4 Test mode

Use Razorpay **test** keys (`rzp_test_…`). In the Checkout modal, Razorpay's
test instruments (e.g. `success@razorpay` UPI, or test card
`4111 1111 1111 1111`) complete a sandbox payment. Reference:
<https://razorpay.com/docs/payments/payments/test-card-details/>.

---

## 4. Refunds

There is **no automated refund edge function today**. To refund an order, an
admin issues the refund from the Razorpay dashboard, then sets
`orders.status = 'refunded'` (which re-lists the item and cancels the payout).
See [`ADMIN_OPERATIONS.md`](ADMIN_OPERATIONS.md) §5. Automating this (a
`razorpay-refund` function calling `POST /v1/payments/{id}/refund`) is a future
enhancement.

---

## 5. Going to production

- [ ] Complete Razorpay account activation / KYC.
- [ ] Replace test keys with **live** keys (`rzp_live_…`) in the edge function secrets.
- [ ] Re-create the webhook in live mode and set the live `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Update `PUBLIC_SITE_URL` to the prod domain.
- [ ] Verify the sending domain in Resend, then update `EMAIL_FROM`.
- [ ] Run a real end-to-end purchase with a small amount on live keys before announcing.
