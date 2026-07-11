# Zarketplace MVP - Setup & Operations Guide

Read this in order. It walks through everything needed to take the codebase from a fresh clone to a fully working test deployment.

## 0. Prerequisites
- Node 18+ and npm
- Supabase CLI (`brew install supabase/tap/supabase`)
- Razorpay account (test keys from Dashboard → Settings → API Keys)
- Resend account (free tier) for transactional + campaign emails

## 1. Install
```bash
npm install
```

## 2. Configure environment

Copy `docs/env.example.txt` to `.env.local`:
```bash
cp docs/env.example.txt .env.local
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is at Supabase Dashboard → Project Settings → API.

> **Never** put `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` - they'd be shipped to the browser. Those go to **Edge Function secrets** only (Step 4).

## 3. Apply database migrations

You have two options.

### 3a. Recommended: run via Supabase MCP (after auth)
Once the Supabase MCP is authenticated in Windsurf, ask Cascade to run them. Cascade will execute the SQL via `execute_sql`.

### 3b. Manual: paste into the SQL Editor
Open Supabase Dashboard → **SQL Editor → New query**, then run every file in
`supabase/migrations/` **in filename order**, starting with the consolidated
baseline `20260510000001_clean_slate.sql` and then each dated migration after
it. The migrations are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), so
you can re-run them safely.

After applying, verify in **Table Editor**:
- `listings` has columns including `sku`, `is_sold`, `seller_upi_vpa`, `shipping_category`, and the listing-trust fields.
- Tables exist: `profiles`, `orders`, `seller_payouts`, `cart_items`, `subscribers`, `email_campaigns`, `email_log`.

## 4. Set Edge Function secrets

```bash
# Link your local CLI to the project
supabase link --project-ref wfaxtxprngyrxsmahxxa

# Set secrets
supabase secrets set \
  RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxx" \
  RAZORPAY_KEY_SECRET="<rzp test secret from Dashboard → Settings → API Keys>" \
  RAZORPAY_WEBHOOK_SECRET="<set when you create the webhook in Step 6>" \
  PUBLIC_SITE_URL="http://localhost:3000" \
  RESEND_API_KEY="<your_resend_key_or_skip_for_dev>" \
  EMAIL_FROM="zarketplace <onboarding@resend.dev>"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform - don't set them.

If you skip `RESEND_API_KEY`, the `send-email` function logs each send to the `email_log` table with status `queued` and short-circuits without sending. Useful for local development.

## 5. Deploy Edge Functions

```bash
supabase functions deploy create-razorpay-order
supabase functions deploy razorpay-webhook --no-verify-jwt
supabase functions deploy send-email
```

`--no-verify-jwt` on the webhook is required because Razorpay won't send a Supabase JWT.

## 6. Configure Razorpay webhook

Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:
- URL: `https://wfaxtxprngyrxsmahxxa.supabase.co/functions/v1/razorpay-webhook`
- Active events: `payment.captured`, `payment.failed`
- Set a **secret**, and store the same value as the `RAZORPAY_WEBHOOK_SECRET` edge function secret (Step 4).

## 7. Run the app

```bash
npm run dev
```
Open http://localhost:3000.

## 8. Smoke test (sandbox)

1. Visit `/sell`, list a sample item with your own email + UPI VPA, submit.
2. Visit `/admin` (password `zarketplace2025`), approve the listing.
3. Visit `/browse`, click the listing, click **Buy it now**.
4. Fill the checkout form, click **Place Order**, complete payment in the Razorpay modal with a test instrument (e.g. `success@razorpay` UPI).
5. Verify in DB:
   - `orders.status = 'paid'`
   - `listings.is_sold = true`
6. Check `/track-order` (or **My Orders** while signed in) - should show the escrow timeline.
7. In the **Seller Portal**, the sold listing appears. Add tracking and mark it shipped; the order flips to `shipped`.
8. In `/admin`, mark the order `delivered`. A `seller_payouts` row is created automatically (`status = 'awaiting_payout'`, held for the 48-hour review window). After the window closes, release the payout; it flips to `paid_out`.

If all 8 steps pass, the system is wired correctly.

## 9. Routes added

| Route | Purpose |
|---|---|
| `/track-order` | Buyer order lookup (email + order #) |
| `/seller-portal` | Seller dashboard (email-gated) |
| `/admin` (password `zarketplace2025`) | Listings moderation + Orders + Payouts + Email Campaigns tabs |

## 10. Documentation index

- [`docs/PAYMENTS.md`](./PAYMENTS.md) - Razorpay payment + escrow payout flow, refunds, going-to-prod
- [`docs/SHIPPING.md`](./SHIPPING.md) - current shipping flow + Shiprocket upgrade plan
- [`docs/SETUP.md`](./SETUP.md) - this file
- [`docs/CHANGES.md`](./CHANGES.md) - every file added/modified, in plain English
- [`docs/env.example.txt`](./env.example.txt) - environment variable template
