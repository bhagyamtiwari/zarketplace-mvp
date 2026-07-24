# zarketplace backlog

Things deliberately deferred. Each entry says why it matters and what "done" looks like.

---

## 1. Collect real weight and dimensions from the seller

**Status:** not started. Highest-value item on this list.

**Why it matters.** Today `shiprocket-create-order` sends a fixed parcel size
(30x25x5 cm) and a category-default weight (0.2 to 1.0 kg). Couriers bill on
`max(actual weight, volumetric weight)` where volumetric = `L x B x H / 5000`.
Our fixed box is **0.75 kg volumetric**, so a t-shirt declared at 0.3 kg is
actually billed at 0.75 kg. Shipping margin is only Rs. 10 to 24 per order, so
this silently erodes it, and a single wrong guess on a bulky item can wipe out
the margin from several orders.

**What to build.**
- On the Sell form's shipping step, ask for weight and rough dimensions.
  Approximates are fine: offer presets ("fits in a document envelope",
  "shoebox", "jacket / bulky") that map to real weight and dimension values,
  with an optional exact-entry field for sellers who know.
- Store on `listings` (e.g. `weight_kg`, `length_cm`, `breadth_cm`,
  `height_cm`), snapshot onto `orders` in `orders_snapshot_from_listing`
  alongside the existing pickup/shipping fields.
- Use those values in `shiprocket-create-order` instead of the constants.
- Keep the category defaults as the fallback when a seller skips it.
- Optionally price shipping from the declared weight band rather than the
  category, once there is real data.

**Definition of done.** A new listing carries its own weight and dimensions,
Shiprocket is booked with them, and the label cost for 10 real orders is within
Rs. 15 of what the buyer was charged.

**Already in place.** The Sell form warns that couriers re-weigh at the hub and
that a large discrepancy may be recovered from the payout or flag the account,
with contact before any payout is affected. That is the policy backstop until
real measurements are collected.

---

## 2. Buyer-facing "Report an issue" button

**Why.** Every claim currently starts with a buyer emailing `contact@` and
hoping. There is no in-product way to raise a problem, and the 48-hour review
window closes on its own, so a slow buyer loses their window while the seller
gets paid.

**What.** A button on each order in My Orders that opens a claim directly
(sets `orders.claim_open`, notifies admin, freezes the payout).

---

## 3. Scheduled jobs (pg_cron)

**Why.** There are no scheduled jobs at all. Payout release, reservation
expiry, and ship reminders only advance when someone touches the system. If
nobody opens the admin console for three days, sellers are not paid.

**What.** Enable `pg_cron`: expire stale reservations, surface releasable
payouts, nudge sellers who have not shipped within 72 hours.

---

## 4. Payout reconciliation

**Why.** "Mark Paid" records intent with no proof of transfer, and nothing
checks Razorpay settlements against what was actually paid out.

**What.** Either the Razorpay Payouts API for real automated transfers, or a
reconciliation view comparing settlements, payouts, and Shiprocket recharge.

---

## 5. Seller trust signals

**Why.** No ratings, no reviews, no seller history. First buyers are trusting a
brand-new marketplace with no social proof.

**What.** Seller rating from completed orders, visible on the listing page.
