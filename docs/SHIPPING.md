# Shipping - Zarketplace MVP

> **Model vs. mechanic (read this first).** The product's *user-facing model* is
> now buyer-paid, platform-arranged shipping: the buyer pays a category-based
> shipping rate at checkout, the seller never books or pays for a courier, and
> the seller only packs the item and hands it off for pickup. That model is what
> Sell.tsx, the policy pages, the FAQ, and the order emails all describe, and it's
> the target the copy is written against (see docs/REALIGNMENT_PLAN.md §0.2).
>
> Mechanically, though, the pickup/label automation is **not built yet** - the
> Shiprocket integration below is what delivers it. Until then, the transitional
> mechanic is the manual flow described next: the seller still pastes a tracking
> URL into the Seller Portal. Buyers already pay the category shipping rate at
> checkout regardless. Closing this gap (so sellers truly just "pack and hand
> off") is exactly what the Shiprocket work is for.

## Current mechanic (manual tracking, transitional)

Until Shiprocket is wired, tracking is entered by hand. The flow is:

1. After payment success, the seller is notified by email and the order appears in their **Seller Portal → Orders**.
2. The seller packs the item and hands it off for pickup / drop-off with a courier (DTDC, India Post, BlueDart, etc.).
3. Seller clicks **"Save & mark shipped"**, entering the **tracking URL** (courier name and tracking number optional).
4. Order status flips to `shipped`. The buyer gets an email with the tracking info, and `track-order` shows the tracking on the public page.
5. Once the buyer confirms delivery (or admin confirms via tracking), admin marks the order `delivered`, which starts the 48-hour buyer review window and auto-creates the payout ledger row (see migration `20260710000001_delivery_escrow_and_payout_timing.sql`). Payout releases after that window closes with no open claim.

This requires zero shipping integration (the payment provider, Razorpay, does not offer a shipping product).

## Future upgrade - Shiprocket integration

If you want one-click label generation, rate comparison and 17+ courier partners, Shiprocket is the standard Indian aggregator. Suggested implementation when ready:

### Step 1 - Sign up & get API credentials
- Create a Shiprocket merchant account.
- Generate an API user (Setting → API → Configure).
- Note the email + password - they're used to fetch a 10-day JWT.

### Step 2 - Edge Function `shiprocket-create-order`
Replace (or augment) the seller "Add Tracking" flow with a backend call that:

1. Authenticates: `POST https://apiv2.shiprocket.in/v1/external/auth/login` with `{ email, password }` → JWT.
2. Creates an order: `POST /v1/external/orders/create/adhoc` with our buyer/shipping address, weight, dimensions, declared value (= `orders.amount`, the item's price - not `total_amount`, which also includes the buyer-paid shipping and Buyer Protection fee).
3. Optionally generates a label: `POST /v1/external/courier/generate/label`.
4. Returns the `awb_code` (= tracking number) and `courier_name`.
5. Persists those fields onto the order, mirroring what the seller does manually today.

### Step 3 - Optional: Rate calculator on Sell.tsx
- `GET /v1/external/courier/serviceability` to show estimated shipping cost while listing.
- Store quoted weight on the listing so it's not re-asked at checkout.

### Step 4 - Tracking webhook
Shiprocket can POST status updates to a configured URL. Add a `shiprocket-webhook` Edge Function that maps their statuses (`Delivered`, `RTO Initiated`, etc.) to our `orders.status` and triggers the `delivered` confirmation flow.

## Why we recommend keeping manual for MVP
- Sellers are mostly individuals using their own preferred courier - forcing Shiprocket creates friction.
- Shiprocket's pricing has minimums and surcharges that don't always beat what a seller can do at the post office.
- The current flow is fully functional and ships TODAY. Shiprocket can be added in ~1 day of work later.

## Other options
- **Delhivery** - direct API; better rates at scale; harder onboarding.
- **Ithink Logistics**, **Pickrr**, **Shipway** - same category as Shiprocket.
- **Sellers self-print labels via Speed Post / DTDC** - current behaviour; cheapest.
