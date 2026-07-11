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

## Known simplifications (MVP, documented rather than hidden)

- **Weight/dimensions are fixed defaults per shipping category**, not real
  per-item values - the flat-rate shipping model deliberately never asks a
  seller for parcel weight (`CATEGORY_WEIGHT_KG` in
  `supabase/functions/shiprocket-create-order/index.ts`). Tune from real
  Shiprocket invoices once volume exists.
- **Courier selection is automatic** (no courier_id passed, so Shiprocket
  picks its recommended courier for the route) - no rate-comparison UI.
- **Booking is admin-triggered**, not automatic on payment - matches
  `docs/REALIGNMENT_PLAN.md` §0.3's "admin-operated at first" build order.
  A background job that auto-books on `paid` is a reasonable next step once
  the manual click has been exercised for real orders.

## Other providers considered

- **Delhivery** - direct API; better rates at scale; harder onboarding.
- **Ithink Logistics**, **Pickrr**, **Shipway** - same category as Shiprocket.
