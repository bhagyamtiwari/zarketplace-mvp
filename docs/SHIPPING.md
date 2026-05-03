# Shipping — Zarketplace MVP

## Current behaviour (manual, seller-fulfilled)

Each seller arranges their own courier. The flow is:

1. After payment success, the seller is notified by email and the order appears in their **Seller Portal → Orders → Awaiting Shipment**.
2. The seller ships the item using any courier (DTDC, India Post, BlueDart, friend with a bike, etc.).
3. Seller clicks **"Add Tracking & Mark Shipped"**, enters the **courier name** and **tracking number**.
4. Order status flips to `shipped`. The buyer gets an email with the tracking info, and `track-order` shows the tracking on the public page.
5. Once the buyer confirms delivery (or admin confirms via tracking), admin marks the order `delivered` and releases the payout.

This requires zero shipping integration. Cashfree does **not** offer a shipping product.

## Future upgrade — Shiprocket integration

If you want one-click label generation, rate comparison and 17+ courier partners, Shiprocket is the standard Indian aggregator. Suggested implementation when ready:

### Step 1 — Sign up & get API credentials
- Create a Shiprocket merchant account.
- Generate an API user (Setting → API → Configure).
- Note the email + password — they're used to fetch a 10-day JWT.

### Step 2 — Edge Function `shiprocket-create-order`
Replace (or augment) the seller "Add Tracking" flow with a backend call that:

1. Authenticates: `POST https://apiv2.shiprocket.in/v1/external/auth/login` with `{ email, password }` → JWT.
2. Creates an order: `POST /v1/external/orders/create/adhoc` with our buyer/shipping address, weight, dimensions, declared value (= `orders.total_amount`).
3. Optionally generates a label: `POST /v1/external/courier/generate/label`.
4. Returns the `awb_code` (= tracking number) and `courier_name`.
5. Persists those fields onto the order, mirroring what the seller does manually today.

### Step 3 — Optional: Rate calculator on Sell.tsx
- `GET /v1/external/courier/serviceability` to show estimated shipping cost while listing.
- Store quoted weight on the listing so it's not re-asked at checkout.

### Step 4 — Tracking webhook
Shiprocket can POST status updates to a configured URL. Add a `shiprocket-webhook` Edge Function that maps their statuses (`Delivered`, `RTO Initiated`, etc.) to our `orders.status` and triggers the `delivered` confirmation flow.

## Why we recommend keeping manual for MVP
- Sellers are mostly individuals using their own preferred courier — forcing Shiprocket creates friction.
- Shiprocket's pricing has minimums and surcharges that don't always beat what a seller can do at the post office.
- The current flow is fully functional and ships TODAY. Shiprocket can be added in ~1 day of work later.

## Other options
- **Delhivery** — direct API; better rates at scale; harder onboarding.
- **Ithink Logistics**, **Pickrr**, **Shipway** — same category as Shiprocket.
- **Sellers self-print labels via Speed Post / DTDC** — current behaviour; cheapest.
