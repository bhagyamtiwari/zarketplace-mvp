# Zarketplace MVP — Setup & Operations Guide

Read this in order. It walks through everything needed to take the codebase from a fresh clone to a fully working test deployment.

## 0. Prerequisites
- Node 18+ and npm
- Supabase CLI (`brew install supabase/tap/supabase`)
- Cashfree merchant account (test keys provided)
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

> **Never** put `CASHFREE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` — they'd be shipped to the browser. Those go to **Edge Function secrets** only (Step 4).

## 3. Apply database migrations

You have two options.

### 3a. Recommended: run via Supabase MCP (after auth)
Once the Supabase MCP is authenticated in Windsurf, ask Cascade to run them. Cascade will execute the SQL via `execute_sql`.

### 3b. Manual: paste into the SQL Editor
Open Supabase Dashboard → **SQL Editor → New query**, then run each of these files **in order**:

1. `supabase/migrations/20260503000001_add_sku_and_sold_status.sql`
2. `supabase/migrations/20260503000002_create_orders_tables.sql`
3. `supabase/migrations/20260503000003_create_subscribers.sql`
4. `supabase/migrations/20260503000004_rls_policies.sql`
5. `supabase/migrations/20260503000005_seller_bank_details.sql`

Each script is idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), so you can re-run them safely.

After applying, verify in **Table Editor**:
- `listings` has new columns: `sku`, `is_sold`, `seller_upi_vpa`, `seller_bank_account`, `seller_bank_ifsc`, `seller_bank_holder`, `seller_pan`, `cashfree_vendor_id`.
- New tables: `orders`, `seller_payouts`, `subscribers`, `email_campaigns`, `email_log`.

## 4. Set Edge Function secrets

```bash
# Link your local CLI to the project
supabase link --project-ref wfaxtxprngyrxsmahxxa

# Set secrets
supabase secrets set \
  CASHFREE_APP_ID="TEST10521924cfa7306bde25f8b49ed642912501" \
  CASHFREE_SECRET_KEY="cfsk_ma_test_a1dbbc9bb0cfbdaa59e553b22f8f0593_d9fb98ff" \
  CASHFREE_ENV="sandbox" \
  PUBLIC_SITE_URL="http://localhost:3000" \
  RESEND_API_KEY="<your_resend_key_or_skip_for_dev>" \
  EMAIL_FROM="Zarketplace <onboarding@resend.dev>" \
  ADMIN_RELEASE_TOKEN="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform — don't set them.

If you skip `RESEND_API_KEY`, the `send-email` function logs each send to the `email_log` table with status `queued` and short-circuits without sending. Useful for local development.

## 5. Deploy Edge Functions

```bash
supabase functions deploy create-order
supabase functions deploy cashfree-webhook --no-verify-jwt
supabase functions deploy send-email
supabase functions deploy cashfree-refund
```

`--no-verify-jwt` on the webhook is required because Cashfree won't send a Supabase JWT.

## 6. Configure Cashfree webhook

Cashfree Dashboard → **Developers → Webhooks → Add Webhook**:
- URL: `https://wfaxtxprngyrxsmahxxa.supabase.co/functions/v1/cashfree-webhook`
- Subscribed events: `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`

## 7. Run the app

```bash
npm run dev
```
Open http://localhost:3000.

## 8. Smoke test (sandbox)

1. Visit `/sell`, list a sample item with your own email + UPI VPA, submit.
2. Visit `/admin` (password `zarketplace2025`), approve the listing.
3. Visit `/browse`, click the listing, click **Buy it now**.
4. Fill the checkout form, click **Place Order**, complete payment in the Cashfree modal with `success@upi`.
5. Verify in DB:
   - `orders.status = 'paid'`
   - `listings.is_sold = true`
   - A `seller_payouts` row exists with `status = 'pending'` and your UPI in `destination_upi`.
6. Check `/track-order?order=ZKT-…&email=you@example.com` — should show timeline.
7. Visit `/seller-portal?email=you@example.com` — should show the sold listing and pending payout. Click **Add Tracking & Mark Shipped**, enter a fake AWB. Order flips to `shipped`.
8. Back in `/admin → Payouts`, click **Release**, paste a fake UTR. Payout flips to `released`.

If all 8 steps pass, the system is wired correctly.

## 9. Routes added

| Route | Purpose |
|---|---|
| `/track-order` | Buyer order lookup (email + order #) |
| `/seller-portal` | Seller dashboard (email-gated) |
| `/admin` (password `zarketplace2025`) | Listings moderation + Orders + Payouts + Email Campaigns tabs |

## 10. Documentation index

- [`docs/CASHFREE.md`](./CASHFREE.md) — payment + payout flow, refunds, Easy Split upgrade plan
- [`docs/SHIPPING.md`](./SHIPPING.md) — current shipping flow + Shiprocket upgrade plan
- [`docs/SETUP.md`](./SETUP.md) — this file
- [`docs/CHANGES.md`](./CHANGES.md) — every file added/modified, in plain English
- [`docs/env.example.txt`](./env.example.txt) — environment variable template
