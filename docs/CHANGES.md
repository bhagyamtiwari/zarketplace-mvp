# Zarketplace MVP — Detailed Change Log

A plain-English, file-by-file record of every change made to take the codebase from "checkout was a stub" to "fully wired marketplace with Cashfree, seller/buyer portals, and admin payouts." Use this when you take over.

## Conceptual summary

We added these capabilities:

1. **Unique SKUs and product URLs** — every listing now has a SKU like `ZV-BTM-123456`. The product URL is still `/product/:id` but the SKU is shown in the UI and stored on every order.
2. **Real Cashfree checkout** (sandbox) — the "Place Order" button now opens the actual Cashfree modal, money lands in your Cashfree merchant account.
3. **Buyer order tracking** — `/track-order` page where buyers look up an order by number + email.
4. **Seller portal** — `/seller-portal` page where sellers see their listings, sold items, pending payouts, and update tracking on shipped orders.
5. **Admin Orders + Payouts management** — `/admin` got tabs. The Payouts tab is where finance manually releases funds to sellers and records UPI/UTR refs.
6. **Sold-out filtering** — items mark `is_sold = true` automatically on payment. They disappear from `/browse` and `/`, and the product page shows "Sold Out" instead of the buy button.
7. **Email system** — transactional emails (order confirmation, seller notification, tracking update, payout released) via Resend, plus a basic email-campaign sender in admin for promotions, with a `subscribers` table.
8. **Refunds** — `cashfree-refund` Edge Function processes a refund + un-sells the listing + cancels the payout.

---

## Database — `supabase/migrations/`

All five files are idempotent. Apply in order via Supabase SQL Editor or the MCP. See `SETUP.md` step 3.

| File | What it does |
|---|---|
| `20260503000001_add_sku_and_sold_status.sql` | Adds `sku` (unique) and `is_sold` columns to `listings`. Adds `generate_listing_sku(category)` and a `BEFORE INSERT` trigger so any new listing auto-gets a SKU like `ZV-BTM-123456`. Backfills existing rows. |
| `20260503000002_create_orders_tables.sql` | Creates `orders` (full purchase record + Cashfree IDs + tracking) and `seller_payouts` (one row per sold order). Adds `generate_order_number()` (`ZKT-XXXXXXXX`) and `set_updated_at()` triggers. |
| `20260503000003_create_subscribers.sql` | Creates `subscribers` (newsletter list), `email_campaigns` (admin-sent campaigns), and `email_log` (audit of every transactional send). |
| `20260503000004_rls_policies.sql` | Enables RLS on the new tables and grants permissive `SELECT/INSERT` to `anon` for MVP. **Read the comments at top of the file** — these policies should be tightened once Supabase Auth is added. |
| `20260503000005_seller_bank_details.sql` | Adds `seller_upi_vpa`, `seller_bank_account`, `seller_bank_ifsc`, `seller_bank_holder`, `seller_pan`, `cashfree_vendor_id` to `listings`. Adds payout destination snapshot fields (`payout_method`, `payout_reference`, `destination_*`) to `seller_payouts`. |

---

## Supabase Edge Functions — `supabase/functions/`

| File | Status | Purpose |
|---|---|---|
| `_shared/cors.ts` | **NEW** | Reusable CORS headers for all functions. |
| `create-order/index.ts` | **REWRITTEN** | Was a hardcoded test stub. Now: validates the listing, inserts an `orders` row, calls Cashfree's `/pg/orders` to create a payment session, saves `cashfree_order_id` + `payment_session_id`, returns them to the frontend. |
| `cashfree-webhook/index.ts` | **NEW** | Receives Cashfree webhook callbacks, verifies HMAC signature, marks order paid/cancelled, marks listing `is_sold`, snapshots seller payout destination from `listings`, creates `seller_payouts` row, fires order confirmation emails. |
| `send-email/index.ts` | **NEW** | Renders 4 transactional templates + a `custom` template for admin campaigns. Sends via Resend. Logs every send to `email_log`. Falls back to dev-mode (no-op + log) if `RESEND_API_KEY` not set. |
| `cashfree-refund/index.ts` | **NEW** | Admin-token-protected. Calls Cashfree's refund API, marks order refunded, un-sells the listing, cancels the payout. |

---

## Frontend (`src/`)

### New files

| File | Purpose |
|---|---|
| `src/pages/TrackOrder.tsx` | Buyer-facing `/track-order` page. Email + order number form → shows status timeline, tracking, shipping address. Auto-fills + auto-looks-up when redirected from Cashfree (`?order=…&email=…`). |
| `src/pages/SellerPortal.tsx` | Seller-facing `/seller-portal` page. Email-gated. Tabs for Listings (active/sold), Orders (with seller-driven "Add Tracking & Mark Shipped" flow), Payouts (read-only summary). |
| `src/vite-env.d.ts` | Adds proper TypeScript types for `import.meta.env.VITE_*` variables. |

### Modified files

| File | What changed |
|---|---|
| `src/App.tsx` | Added routes for `/track-order` and `/seller-portal`. Added footer links to Seller Portal and Track Order. |
| `src/components/Navbar.tsx` | Added "Track Order" link to top nav. |
| `src/types.ts` | Added `Order`, `OrderStatus`, `SellerPayout`, `PayoutStatus`. Added `sku`, `is_sold` to `Listing`. |
| `src/lib/cashfree.ts` | Replaced the half-working SDK loader with a real lazy-loader, added `createCashfreeOrder()` helper that calls our Edge Function. |
| `src/lib/supabase.ts` | Unchanged. |
| `src/lib/utils.ts` | Unchanged. |
| `src/pages/Checkout.tsx` | Replaced the simulated success with the real Cashfree flow: calls `createCashfreeOrder`, opens the SDK modal, polls our `orders` table to confirm the webhook arrived, shows the success screen. Added field validation + inline error display. |
| `src/pages/Browse.tsx` | Listing query now filters out `is_sold = true`. |
| `src/pages/Home.tsx` | Same filter on the homepage preview. |
| `src/pages/ProductPage.tsx` | Shows "Sold Out" placeholder instead of "Buy it now" when `is_sold`. Uses `listing.sku` (with fallback) on the Product Code line. |
| `src/pages/Sell.tsx` | Captures `seller_upi_vpa`, `seller_bank_holder`, `seller_bank_account`, `seller_bank_ifsc` (new "Payout Details" section). Inserts them with the listing. SKU is auto-assigned by the DB trigger — no UI changes needed. |
| `src/pages/Admin.tsx` | Added 3 new tabs (Orders, Payouts, Email Campaigns) plus 3 new sub-components (`OrdersPanel`, `PayoutsPanel`, `CampaignsPanel`). Added `releasePayout`, `updateOrderStatus`, `fetchOrders`, `fetchPayouts`. Releasing a payout now requires a UPI ref / UTR (stored in `payout_reference`). Payouts table shows seller's UPI/bank so finance can read off the destination. |
| `tsconfig.json` | Added `include` and `exclude` so the Vite typechecker stops trying to typecheck the Deno-based Supabase edge functions. |

---

## Documentation

| File | Purpose |
|---|---|
| `docs/SETUP.md` | One-stop setup guide from clone to first successful test purchase. |
| `docs/CASHFREE.md` | How money flows, finance ops daily checklist, refund usage, Easy Split upgrade plan, going-to-prod checklist. |
| `docs/SHIPPING.md` | Why we kept shipping manual and how to add Shiprocket later. |
| `docs/CHANGES.md` | This file. |
| `docs/env.example.txt` | Template for `.env.local`. |

---

## Behavioural changes you should know about

1. **`Place Order` no longer just shows a success page.** It opens the real Cashfree modal. If you re-deploy without setting Edge Function secrets, the button will fail with "Cashfree credentials not configured" — that's by design.
2. **Listings are removed from /browse the moment payment succeeds.** Concretely: the webhook flips `is_sold = true`. If you ever need to re-list a sold item (refund or admin override), set `is_sold = false` in the table.
3. **Each new listing gets a SKU automatically.** Existing rows were backfilled by migration #1.
4. **Sellers must provide UPI or bank details on Sell.** They aren't enforced as required at the SQL level (yet) so old listings without them will show "Not provided" in the admin Payouts panel — finance must email the seller to collect them before paying out.
5. **The admin Listings tab still works exactly as before.** The "Seed Sample Data" button now only appears under the Listings tab.
6. **Default admin password is unchanged (`zarketplace2025`).** Replace it before going to production. Better: gate `/admin` behind Supabase Auth and check a role/email.

---

## Known limitations / future work

- **No Supabase Auth** — buyers/sellers identify themselves by entering an email. RLS policies are permissive on read. See comments in `20260503000004_rls_policies.sql`. Migrate to Supabase Auth before public launch.
- **No automatic delivery confirmation** — admin manually marks orders `delivered` (or it happens implicitly when releasing a payout). A scheduled job could auto-mark `delivered` 7 days after `shipped` if no dispute was raised.
- **No COD** — Cash on Delivery is intentionally disabled in the UI. Re-enable by removing the disabled state on the COD card in `Checkout.tsx` and routing to a separate flow.
- **Email campaigns are unbatched** — `CampaignsPanel` loops one HTTP call per recipient. Fine for a few hundred subscribers; replace with Resend's batch API if you grow past ~1k.
- **No image-resizing pipeline** — listing images are uploaded as-is to Supabase Storage. Add Supabase Image Transformations or `image_url`s with `?width=` parameters when bandwidth becomes a concern.
- **Cashfree business name "Zivanta"** is set in your Cashfree merchant profile, not in this code. To change it, contact Cashfree support.
