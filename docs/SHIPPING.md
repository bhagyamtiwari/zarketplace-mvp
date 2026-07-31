# Shipping - zarketplace MVP

The pickup/label model described in `docs/REALIGNMENT_PLAN.md` §0.3 - buyer
pays a category-based flat rate at checkout, zarketplace books the courier,
seller only packs and hands off - is **built**. What's missing is purely
credentials: set `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` /
`SHIPROCKET_WEBHOOK_TOKEN` (see `docs/SETUP.md` §4) and it's live. Until those
secrets are set, `shiprocket-create-order` returns "Shiprocket is not
configured on the server" and the manual fallback below is what actually
ships orders.

## How a pickup gets booked (admin-triggered, test mode)

1. Buyer pays; order is `paid`; `orders.pickup_address` (the seller's own
   address, collected once in Sell.tsx) and `orders.shipping_address` (the
   buyer's delivery address, collected at checkout) are already snapshotted.
2. In `/admin` → **Orders**, an order that's `paid` and has no Shiprocket
   booking yet shows a **Book Pickup (Shiprocket)** button. Clicking it calls
   the `shiprocket-create-order` edge function, which:
   1. Authenticates to Shiprocket (email/password → short-lived JWT).
   2. Registers the seller's pickup address as a Shiprocket "pickup
      location" if it isn't already (Shiprocket's order-create API takes a
      pickup-location *nickname*, not an inline address, so each seller has
      to be registered once - idempotent, keyed off the order id).
   3. Creates the Shiprocket order (`POST /orders/create/adhoc`) with a
      category-based default weight (`docs/REALIGNMENT_PLAN.md` §0.3 - the
      flat-rate model never collects a real per-item weight) and declared
      value = `orders.amount` (the item price only, not `total_amount`).
   4. Auto-assigns a courier + AWB.
   5. Generates the shipping label.
3. Whatever succeeds is persisted immediately (`shiprocket_order_id`,
   `shiprocket_shipment_id`, then `tracking_number`/`courier`/`tracking_url`
   once the AWB is assigned) - if a later step fails, the booking isn't lost,
   it just needs a retry or a manual finish from the Shiprocket dashboard
   (the function returns `warnings` for exactly this case).
4. Once an AWB exists, the order flips to `shipped` and the buyer gets the
   existing tracking-update email. The seller sees the tracking info
   read-only in their portal (`SellerPortal.tsx`) - they never touch a
   courier or a label.
5. `shiprocket-webhook` receives Shiprocket's delivery status callbacks and
   sets `orders.status = 'delivered'` automatically when a shipment is
   marked delivered - the same transition an admin can make by hand, which
   starts the 48-hour review window and creates the payout row (see
   `docs/ADMIN_OPERATIONS.md`).

## Manual fallback (used whenever Shiprocket isn't booked)

The original manual-tracking flow still exists and is what runs before
Shiprocket secrets are set, or for any order an admin chooses not to book
through Shiprocket:

1. The seller packs the item and hands it off to a courier themselves
   (DTDC, India Post, BlueDart, etc.).
2. In **Seller Portal → Sales**, they click **"Save & mark shipped"** and
   paste the tracking URL (courier name/number optional).
3. Order flips to `shipped`; buyer gets the tracking email.
4. Admin marks `delivered` once confirmed, same escrow/payout path as above.

## Configuration

See `docs/SETUP.md` §4 for the exact secrets and `docs/PAYMENTS.md` for how
shipping cost fits into the total the buyer is charged. Register the webhook
in the Shiprocket dashboard (Settings → API → Webhooks) as:

```
https://<project>.supabase.co/functions/v1/shiprocket-webhook?token=<SHIPROCKET_WEBHOOK_TOKEN>
```

Shiprocket doesn't sign webhook payloads with an HMAC secret the way Razorpay
does, so the `?token=` query param is the shared-secret check.

## Rate card: where the numbers came from (2026-07-29)

Couriers bill on `max(dead weight, volumetric)` where volumetric is
`L x B x H / 5000`. **Volumetric exceeds dead weight in all five of our
categories**, so the invoice is decided by parcel size, not scale weight. That
is why the Sell form gives packing instructions instead of asking sellers to
weigh anything: a seller-entered weight would be collected and then ignored by
the billing formula.

Measured from Shiprocket's rate API, Delhi 110030 -> Mumbai 400001 and
Bengaluru 560001 (both zone C, the lane most orders take), surface, prepaid,
declared value Rs. 1500. Cost column is Delhivery Surface, which quoted
identically on both lanes; cheaper Shadowfax quotes exist but are not available
on every lane, so they are not safe to price against.

| Category | Declared package | Billed | Cost (zone C) | We charge |
|---|---|---|---|---|
| Accessories | 0.2 kg, 25x20x4 | 0.40 kg | Rs. 68 | Rs. 99 |
| Tops | 0.3 kg, 30x25x4 | 0.60 kg | Rs. 131 | Rs. 149 |
| Bottoms | 0.5 kg, 30x25x6 | 0.90 kg | Rs. 131 | Rs. 149 |
| Footwear | 1.0 kg, 35x22x14 | 2.16 kg | Rs. 320 boxed / Rs. 194 unboxed | Rs. 249 |
| Outerwear | 0.8 kg, 35x28x10 | 1.96 kg | Rs. 257 | Rs. 259 |

Same-city is much cheaper (Rs. 53 to Rs. 156) and the North East much dearer
(Rs. 104 to Rs. 265), so a single national rate earns on short lanes and loses
on long ones. Rates are priced at zone C plus a thin buffer.

**Footwear is the one deliberate bet.** A pair shipped in its original box
costs Rs. 320; the same pair in a courier bag costs Rs. 194. Rs. 249 sits
between them, so it depends on most sellers packing flat. The Sell form tells
them to, except when the listing declares original packaging, where the box is
part of what the buyer paid for. Watch this one against real invoices first.

Rates live in `shipping_categories.rate` and are snapshotted onto every order
(`orders.shipping_cost` and `orders.package_snapshot`), so repricing is a SQL
update that can never alter an in-flight or historical order. Keep the
`FALLBACK_SHIPPING_CATEGORIES` list in `src/lib/pricing.ts` in sync.

## Known simplifications (MVP, documented rather than hidden)

- **Weight/dimensions are fixed defaults per shipping category**, not real
  per-item values - the flat-rate shipping model deliberately never asks a
  seller for parcel weight. The profile now lives in `shipping_categories`
  (`default_weight_kg`, `pkg_*_cm`); the constants in
  `supabase/functions/shiprocket-create-order/index.ts` are only the last-resort
  fallback. Tune from real Shiprocket invoices once volume exists.
- **One flat rate per category, nationwide** - no zone pricing, so short lanes
  subsidise long ones. Zone-based pricing off the buyer's pincode is the known
  next step (`docs/REALIGNMENT_PLAN.md` P2) and matters most for footwear.
- **Courier selection is automatic** (no courier_id passed, so Shiprocket
  picks its recommended courier for the route) - no rate-comparison UI.
- **Booking is admin-triggered**, not automatic on payment - matches
  `docs/REALIGNMENT_PLAN.md` §0.3's "admin-operated at first" build order.
  A background job that auto-books on `paid` is a reasonable next step once
  the manual click has been exercised for real orders.

## Other providers considered

- **Delhivery** - direct API; better rates at scale; harder onboarding.
- **Ithink Logistics**, **Pickrr**, **Shipway** - same category as Shiprocket.
