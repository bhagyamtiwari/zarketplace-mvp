# Cashfree integration - Zarketplace MVP

This document explains exactly how money moves through the platform, what is automated today, and the upgrade paths to fully-automated split settlements.

> **TL;DR (current behaviour):**
> Buyer pays → money lands in **your Cashfree merchant balance** (Zivanta).
> Order is created, listing is marked sold, a `seller_payouts` row is queued.
> After the seller ships and the buyer confirms delivery, **your finance team manually transfers** the seller's share from the Cashfree dashboard (UPI/NEFT) and clicks "Release" in the admin panel, recording the UTR/UPI reference.

---

## 1. Products in play

| Cashfree product | What it does | Used here? |
|---|---|---|
| **Payment Gateway (PG)** | Accept payments via UPI / cards / netbanking. Money → merchant balance. | ✅ Yes (sandbox) |
| **Easy Split** | Auto-split a single payment between merchant and multiple vendors. Holds vendor share until released. | ⏸️ Documented as a future upgrade |
| **Cashfree Payouts** | Send money to bank accounts / UPI VPAs from a Payouts wallet. | ⏸️ Optional automation for the "Release Payout" action |
| **Refunds API** | Refund a captured payment. | ✅ Wired via `cashfree-refund` edge function |
| Shipping | - | ❌ Cashfree has no shipping product. See `SHIPPING.md`. |

The credentials provided are **PG-only** (test). Easy Split and Payouts each require a separate signup/feature activation in the Cashfree dashboard.

---

## 2. Money flow today (PG + manual escrow)

```
┌───────────┐     ①pay      ┌────────────────┐
│  Buyer    │ ────────────▶ │  Cashfree PG   │
└───────────┘               │   (sandbox)    │
                            └───────┬────────┘
                                    │ ② webhook
                                    ▼
                            ┌────────────────┐
                            │ Supabase       │
                            │ orders.status  │
                            │   = 'paid'     │
                            │ listings       │
                            │   .is_sold = T │
                            │ seller_payouts │
                            │   .status =    │
                            │   'pending'    │
                            └────────────────┘

                       Cashfree merchant balance
                       (your Zivanta account)
                                ▲
                                │ T+1 settlement (Cashfree → bank)
                                ▼
                         Your business bank
                                │ ③ manual transfer (UPI/NEFT)
                                ▼
                          Seller's account

                   ④ admin clicks "Release Payout" + enters UTR
                            ↓
                   seller_payouts.status = 'released'
                   seller_payouts.payout_reference = 'UTR…'
                   email sent to seller
```

### Key files
- `supabase/functions/create-order/index.ts` - creates Cashfree order in **sandbox** mode and returns `payment_session_id`.
- `src/lib/cashfree.ts` - frontend SDK loader; uses `VITE_CASHFREE_ENV` to choose sandbox vs production.
- `src/pages/Checkout.tsx` - opens the Cashfree modal. The modal title shows your business name "Zivanta" (configured in your Cashfree merchant profile, not in code).
- `supabase/functions/cashfree-webhook/index.ts` - processes `PAYMENT_SUCCESS_WEBHOOK`, marks order paid, marks listing sold, snapshots seller payout details, fires confirmation emails.
- `src/pages/Admin.tsx` → **Payouts** tab - shows pending/released/held payouts with destination UPI/bank details captured at listing time.

### Daily ops checklist for finance

1. Open admin `/admin` → **Payouts** tab → filter `pending`.
2. For each row, verify:
   - Order is `delivered` (or you've confirmed delivery via tracking).
   - Seller has provided UPI VPA or bank details (visible in **Send To** column).
3. Open the Cashfree merchant dashboard → settle / withdraw to your bank.
4. From your business bank, send `Amount` to the seller's UPI/bank.
5. Back in admin, click **Release** and paste the UTR / UPI ref.
6. The seller automatically receives a payout confirmation email.

If something is wrong (dispute, fraud, mis-shipment), click **Hold** with a reason. To re-queue a payout, click **Reset**.

---

## 3. Configuration (one-time)

### 3.1 Edge Function secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**, OR via CLI:

```bash
supabase secrets set \
  CASHFREE_APP_ID="TEST10521924cfa7306bde25f8b49ed642912501" \
  CASHFREE_SECRET_KEY="cfsk_ma_test_a1dbbc9bb0cfbdaa59e553b22f8f0593_d9fb98ff" \
  CASHFREE_ENV="sandbox" \
  PUBLIC_SITE_URL="https://zarketplace.com" \
  RESEND_API_KEY="<your_resend_key>" \
  EMAIL_FROM="Zarketplace <orders@zarketplace.com>" \
  ADMIN_RELEASE_TOKEN="<random_long_string>"
```

To go live: switch `CASHFREE_ENV` to `production` and replace the App ID / Secret with your **production** keys from Cashfree dashboard.

### 3.2 Frontend env (`.env.local` next to `package.json`)

```env
VITE_SUPABASE_URL=https://wfaxtxprngyrxsmahxxa.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
VITE_CASHFREE_ENV=sandbox
```

### 3.3 Webhook setup in Cashfree

Cashfree Dashboard → **Developers → Webhooks → Add Webhook**

- URL: `https://wfaxtxprngyrxsmahxxa.supabase.co/functions/v1/cashfree-webhook`
- Events: `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`
- Save and copy the **webhook signing key** if Cashfree provides one (current code uses `CASHFREE_SECRET_KEY` for HMAC verification, which matches their default behaviour).

Deploy with JWT verification disabled so Cashfree can hit it without an Authorization header:

```bash
supabase functions deploy cashfree-webhook --no-verify-jwt
supabase functions deploy create-order
supabase functions deploy cashfree-refund
supabase functions deploy send-email
```

### 3.4 Test cards / UPI for sandbox

In sandbox, on the Cashfree checkout modal use:
- Card: `4111 1111 1111 1111`, any future expiry, any CVV, OTP `123456`
- UPI: `success@upi`  (instant success)  /  `failure@upi`  (instant failure)

Refer: <https://www.cashfree.com/docs/payments/online/test-data>.

---

## 4. Refunds

Use the `cashfree-refund` Edge Function.

```bash
curl -X POST "https://wfaxtxprngyrxsmahxxa.supabase.co/functions/v1/cashfree-refund" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_RELEASE_TOKEN" \
  -d '{"order_id":"<orders.id uuid>","reason":"Cancelled by buyer"}'
```

It will:
1. Call Cashfree's `POST /pg/orders/{order_id}/refunds`.
2. Set `orders.status = 'refunded'`.
3. Set `listings.is_sold = false` (re-list the item).
4. Cancel the corresponding `seller_payouts` row.

A small wrapper UI in admin would make this a button-click; not built for MVP - shout if needed.

---

## 5. Future upgrade A - Cashfree Easy Split (full automation)

**When to do this:** Once you have a stable seller base and want to remove the manual transfer step.

**What changes:**
1. Apply for Easy Split activation with your Cashfree account manager.
2. For every seller, call `POST /pg/easy-split/vendors` with their KYC (PAN + bank/UPI). Store the returned `vendor_id` in `listings.cashfree_vendor_id` (column already exists).
3. In `create-order`, when the listing has a `cashfree_vendor_id`, include split details and **`defer_settlement: true`** so the vendor share is held in the vendor's unsettled balance.
4. Replace the manual "Release Payout" with a call to `POST /pg/easy-split/vendors/{vendor_id}/transfer` with `transfer_type: ON_DEMAND_TRANSFER`. This is what actually moves the money from "held" to the seller's bank.
5. Listen to `VENDOR_SETTLEMENT_WEBHOOK` and update `seller_payouts.status = 'released'` automatically on success.

Reference: <https://www.cashfree.com/docs/payments/split/recipes/split-a-payment>

I've already added the `cashfree_vendor_id` and `payout_method` columns so this upgrade is a config + code path change, not a migration.

---

## 6. Future upgrade B - Cashfree Payouts (lighter automation)

**When to do this:** If Easy Split's KYC requirements are too heavy but you still want one-click payouts.

**What changes:**
1. Sign up for Cashfree Payouts (separate product). Get a Payouts Client ID + Secret.
2. Add an `add-beneficiary` edge function that calls `POST /payouts/v1/addBeneficiary` with the seller's bank/UPI when a listing is approved.
3. Replace the admin "Release" handler with a call to a new `release-payout` edge function that runs `POST /payouts/v1/requestTransfer`.
4. Update `seller_payouts.payout_method = 'cashfree_payouts'` and `payout_reference` from the API response.

This is simpler than Easy Split but money still pools first in your Cashfree balance - Payouts just automates the outbound leg.

---

## 7. Going to production

Checklist:
- [ ] Replace test Cashfree keys with production keys; flip `CASHFREE_ENV=production`.
- [ ] Update Supabase `PUBLIC_SITE_URL` to your prod domain.
- [ ] Verify webhook URL and re-add in Cashfree's production dashboard.
- [ ] Verify your custom domain in Resend, then update `EMAIL_FROM`.
- [ ] Replace the hardcoded admin password (`zarketplace2025` in `Admin.tsx`) with something stronger, ideally Supabase Auth-gated.
- [ ] Tighten RLS: replace the permissive policies in `20260503000004_rls_policies.sql` with email-scoped ones once you add Supabase Auth (the file has comments indicating where).
- [ ] Run a real end-to-end test purchase with a small amount on production keys before announcing.
