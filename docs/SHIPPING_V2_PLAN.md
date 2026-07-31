# Shipping v2: pricing and fulfillment as separate axes

Status: plan, not yet built. Decisions below are locked (2026-07-31).

Supersedes the single `free_shipping` boolean. Read `docs/SHIPPING.md` for the
rate card and `docs/REALIGNMENT_PLAN.md` §0.3/§0.4 for the model this sits in.

## The model

Two independent axes, not three models.

| Axis | Values |
|---|---|
| `shipping_payer` | `buyer`, `seller` |
| `fulfillment_method` | `zarketplace`, `self` |

Three valid combinations. The fourth is rejected by a CHECK constraint.

| Payer | Fulfillment | Buyer sees | Seller receives | Ships |
|---|---|---|---|---|
| `buyer` | `zarketplace` | Shipping ₹149 | full price | Shiprocket |
| `seller` | `zarketplace` | Free | price less rate | Shiprocket |
| `seller` | `self` | Free | **full price** | seller |
| `buyer` | `self` | rejected | | |

`buyer` + `self` is excluded because quoting a buyer for a shipment we do not
control has no honest answer.

### The trap in this table

Under self-ship the buyer sees "Free" but there is **no deduction**, because
the seller already paid a courier directly. Any code that reasons "free
shipping implies deduct the rate" is wrong under the third row and will
silently underpay a self-shipping seller by the full rate. That is the single
highest-risk defect in this change, and it is exactly the kind that the three
independent payout sites (below) let through.

Deduction rule, stated once:

```
deduct = (shipping_payer = 'seller' AND fulfillment_method = 'zarketplace')
```

Buyer-charge rule, stated once:

```
charge_buyer = (shipping_payer = 'buyer')
```

Note these are **different predicates**. Neither is `free_shipping`.

## Locked decisions

1. **Payout stays gated on delivery.** A timer is a fallback for missing
   delivery signal, never a replacement for the gate. See below.
2. **Self-ship is gated behind a courier allowlist and required evidence**
   (tracking plus parcel photo) before any payout. Originally sequenced last;
   moved ahead of the admin batch queue once it became clear it is the
   migration path for existing Instagram supply. See the Model C section.
3. **The order summary keeps a Shipping row reading "Free"** on free-shipping
   orders. Confirmed in commit `800804e`; not revisited.

## Payout timing

Today: `handle_order_delivered()` fires when status becomes `delivered`,
stamps `review_ends_at = now() + 48h`, and inserts the `seller_payouts` row.
That stays exactly as is.

The problem being solved is not the gate, it is that **nothing ever sets
`delivered`** for a self-shipped order, and no `pg_cron` job exists to advance
anything (`docs/BACKLOG.md` #3). Orders stall indefinitely.

Fallback, in order of preference:

1. Shiprocket webhook confirms delivery. Payout at delivery + 48h. Unchanged.
2. No signal by `auto_deliver_at`. A cron job marks the order delivered, which
   fires the existing trigger, which opens the normal 48h window. Payout lands
   at roughly ship + N + 2 days.

New columns:

- `orders.auto_deliver_at timestamptz` stamped when status becomes `shipped`.
- `orders.delivery_source text CHECK (delivery_source IN ('courier','assumed','admin'))`.

`delivery_source` matters. Auto-marking an order delivered when nobody
confirmed it is a fiction, and the buyer must not be shown "Delivered" as if a
courier said so. Buyer-facing copy reads differently for `assumed`, and the
buyer gets an email **before** the window opens, not after:

> Your order should have arrived. We release payment to the seller in 48
> hours. If it has not arrived, tell us now.

That email is what makes the fallback honest rather than a quiet payout. It
also converts a silent failure into a support ticket, which is what you want.

Suggested N, tunable: 7 calendar days after `shipped` for `zarketplace`
fulfillment, 10 for `self` (weaker tracking, more benefit of the doubt).

**Dependency:** this needs `pg_cron`, which does not exist yet. Reservation
expiry and ship reminders are blocked on the same thing and should land in the
same job.

## Schema

```sql
ALTER TABLE listings
  ADD COLUMN shipping_payer text NOT NULL DEFAULT 'buyer'
    CHECK (shipping_payer IN ('buyer','seller')),
  ADD COLUMN fulfillment_method text NOT NULL DEFAULT 'zarketplace'
    CHECK (fulfillment_method IN ('zarketplace','self')),
  ADD CONSTRAINT listings_valid_shipping_combo
    CHECK (NOT (shipping_payer = 'buyer' AND fulfillment_method = 'self'));
```

Same three on `orders`, snapshotted at purchase alongside `shipping_cost` and
`package_snapshot`.

Backfill: `free_shipping = true` becomes `('seller','zarketplace')`, false
becomes `('buyer','zarketplace')`. Every existing row maps cleanly because
self-ship did not exist.

### Backward compatibility

`free_shipping` is read in at least five places (`Marketplace.tsx` filter,
`ListingCard`, `ProductPage`, `Checkout`, the payout email). Do **not** convert
it to a generated column: it is written by `Sell.tsx` and by
`orders_snapshot_from_listing()`, and generated columns cannot be written.

Keep it a real column, maintained by trigger as `shipping_payer = 'seller'`,
so legacy readers keep working. It stays correct for display purposes
("does the buyer see Free?") in all three rows. It is **only** wrong as a
deduction predicate, so the migration must convert every payout site in the
same change. Drop the column once nothing reads it.

## The three payout sites

These must agree, and today they are computed independently:

1. `handle_order_delivered()` in SQL
2. `Sell.tsx`, inline (main removed the shared helper)
3. the `payout-released-seller` email template

With one boolean, inline duplication was survivable. With two axes and a
non-obvious predicate it is not. Introduce `calculateSellerPayout()` in
`src/lib/pricing.ts` taking `(effectivePrice, rate, payer, fulfillment)`, have
`Sell.tsx` and the email call it, and mirror the predicate in SQL with a
comment on both sides pointing at the other.

This reverses my call this morning to leave that helper out. That was right for
one boolean and is wrong for this.

## Other logic that keys off the old boolean

- `orders_snapshot_from_listing()`: buyer total includes shipping only when
  `shipping_payer = 'buyer'`. Dump the **live** function first, do not
  regenerate from a repo file. See the warning at the top of
  `20260729000001_package_profiles.sql`.
- `listings_require_positive_payout`: the floor must apply only when the
  deduction applies. As written it would block self-ship listings priced below
  the rate, which is wrong since they take no deduction. Narrow the predicate.
- The same narrowing applies to the client-side floor guard in `Sell.tsx:296`.
- `shiprocket-create-order` must refuse to book a `self` order at all.

## Rate single-sourcing

The request to make "Shiprocket automation rates match the listing form" is
two different numbers and cannot be satisfied literally. The form shows what we
**charge** (₹249 footwear); Shiprocket bills what it **costs** (₹320 boxed /
₹194 flat). The spread is the margin.

The real duplication is in the charged rate, which lives in three places that
have already drifted twice:

- `shipping_categories.rate` in the live DB (truth)
- `FALLBACK_SHIPPING_CATEGORIES` in `src/lib/pricing.ts`
- `scripts/seller_master_pdf.py`

Fix: DB is truth, the fallback becomes a checked mirror (a script asserts
equality against live and fails CI), and the PDF generates from the live table
instead of hardcoding.

## Admin shipping queue

The proposed status list mixes two axes onto one, which cannot represent
"delivered, payout pending", the state of every order for 48 hours. Two fields:

- `shipment_status`: `awaiting_booking`, `booked`, `picked_up`, `in_transit`,
  `delivered`, `exception`
- payout state: the existing `seller_payouts.status` plus `releasable_at`

### Booking stays manual, by design

Decided 2026-07-31. Bookings are made by hand in the Shiprocket dashboard, not
by an automated call. This is not a stopgap, it is the right call at this
volume, for a reason worth writing down:

**Manual booking is the margin control point.** The flat rate we charge is a
bet against the real courier bill. Automated booking commits to that bill with
nobody looking. A human booking each order sees the actual quote before
committing and can stop when it exceeds what was collected, when the courier
options on that lane look wrong, or when shipping a cheap item costs more than
the item is worth. Automating that away would mean building alerting to
recover the judgement the human already provides for free.

So the admin surface is a **queue plus a paste-back field**, not a booking
robot:

- list orders needing booking, with pickup and delivery address, the package
  profile, declared value, and what shipping we actually collected
- admin books in Shiprocket, then pastes the AWB and courier back
- self-shipped orders never appear in this queue at all

Cheapest-courier selection is therefore a human judgement for now. When it is
eventually automated, cheapest-overall is still the wrong rule: the cheapest
quote is often a courier not serviceable on that lane, and a bad courier
generates claims worth more than the ₹30 saved. Prefer Delhivery Surface as
the planning default (see `docs/SHIPPING.md`).

## Razorpay and Shiprocket are not linked

There is no integration between them and there should not be one. They are two
separate ledgers joined only by the bank account:

- **Razorpay** is money in from buyers, settling out to the bank on a T+2 cycle.
- **Shiprocket** is a prepaid wallet that is topped up manually.

Run Shiprocket as a **float**: keep a working balance, top it up when it drops.
The float is working capital, not just convenience, because the courier is paid
up front while the buyer's money is still settling. Every order is fronted.

Sizing: at roughly 10 orders a week averaging ₹180 of shipping, ₹10,000 is
about five weeks of runway and ₹5,000 about two and a half. Start at ₹10,000
and watch the drawdown rate rather than the balance.

The discipline that matters is **monthly reconciliation**: compare shipping
collected (`sum(orders.shipping_cost)` for the period) against Shiprocket
wallet spend. That single number says whether the rate card is priced right,
per category, from real invoices instead of from quotes. It is also exactly the
data needed for the deferred question of what to do when charged and actual
differ.

## Self-ship (Model C)

### Why it matters more than first assessed

The initial read treated self-ship as an edge case for pincodes Shiprocket
cannot service. That was wrong about this marketplace. The target supply is
Instagram thrift sellers who **already** self-ship and already advertise free
shipping. For them Model C is not a new path, it is the status quo, and
forcing them onto Shiprocket is onboarding friction on a supply-constrained
marketplace.

Economics, corrected. India Post Speed Post for 500 g beyond 1000 km is ₹70 to
₹80 plus 18% GST, so ₹83 to ₹94 all in, against a ₹149 Model B deduction. A
real saving of ₹55 to ₹65 on tops, bottoms, footwear and outerwear. Against
the ₹99 accessories rate it is close to a wash. So the pull is a 4 to 6 percent
margin improvement concentrated in the larger categories, plus the larger
factor of not having to change what they already do.

Consequence for build order: if a meaningful share of supply self-ships, the
admin batch-booking queue serves fewer orders than planned. Model C moves
**ahead** of the batch queue.

### Payout is evidence-gated, not only time-gated

No tracking number and no parcel photo means no payout. This is self-enforcing:
the seller's incentive does the work, and nobody has to be chased.

The enforcement lever is withholding payout and removing account access. It is
**not** legal pursuit. Holding a seller's email and UPI VPA is not meaningful
leverage: a ₹1,000 order will never justify the cost of pursuing it, and a VPA
is not verified identity. Do not let "we could pursue them" become load-bearing
in policy, because in practice it will not happen.

### What the photo is for

Dispute evidence, not fraud prevention. The escrow gate already covers the
empty-envelope case: the buyer raises a SNAD claim within 48 hours of delivery,
the seller has not been paid, and the refund comes out of escrow. That holds
with or without a photo.

The photo makes a contested case adjudicable, so the requirement is that the
**item and the shipping label are visible in one frame**, tying the parcel to
the tracking number supplied. Do not build EXIF timestamp checks: EXIF is
trivially stripped or forged and would only create false confidence.

### Verification is the real gap

Model C has no delivery webhook, so without further work every self-shipped
order falls through to the blind auto-deliver timer. That, not seller honesty,
is the weak point.

India Post publishes no official public API, but Speed Post is genuinely
tracked and third-party aggregators poll it. Wiring one aggregator converts
Model C from "assume delivered after N days" into actually confirmed, and is
cheap. It also gives the courier allowlist its correct definition:

> **couriers whose tracking we can programmatically read**, not premium
> couriers. India Post Speed Post qualifies. Untracked Book Post does not.

### Guardrails

- Courier from the allowlist, not free text.
- Tracking validated against that courier's format.
- Parcel photo with label and item in frame, required.
- Cannot be marked shipped without courier, tracking and photo.
- Tracking immutable after shipped unless admin overrides, mirroring the
  existing `package_snapshot` lock.

### Policy gap to close before the first Model C order

Speed Post insures to ₹1,000. A ₹3,000 jacket lost in the post means the buyer
is refunded from escrow, the seller has lost the item, India Post pays ₹1,000
at most, and there is currently **no written rule for who absorbs the rest**.
This is the case most likely to become a public incident. It needs a decision
in the seller policy before launch, not after.

### Cheapest way to de-risk this

Ask five current IG sellers what courier they use, what it costs them, and
whether they would rather keep self-shipping or hand it over at ₹149. The
central unknown in this design is what they actually do, and five DMs resolves
it. The answer decides whether Model C is the main path or a minority one.

## Build order

| Phase | Scope | Status |
|---|---|---|
| 1 | Rate single-sourcing, checked mirror, PDF from live | partly done (`3038f0f`) |
| 2 | Schema: two axes, backfill, `free_shipping` CHECK | written, **not applied** |
| 3a | Seller form, payout helper, email, Shiprocket refusal | done (`fec12c7`) |
| 3b | `handle_order_delivered` predicate | **blocked on a live dump** |
| 4 | `pg_cron`, `auto_deliver_at`, pre-release email | not started |
| 5 | Self-ship evidence capture: tracking, photo, courier list | not started |
| 6 | Admin booking queue and paste-back | not started |

All three options are live on the form as of `fec12c7`, ahead of 3b and 5,
which is safe only because of the ordering below. Read it before assuming
this is finished.

### Why shipping the form before 3b is safe, and when it stops being safe

The buyer side is already correct for all three models: the buyer charge keys
off `free_shipping`, which is still exactly right for "does checkout say Free".
Nothing about money in is wrong.

The payout side is not. `handle_order_delivered` still deducts on
`free_shipping`, so it would underpay a self-shipping seller. That cannot fire
yet, because reaching a payout requires admin approval of the listing, a
purchase, a shipment, an admin-set `delivered`, and then 48 hours. Days, with a
human in the loop at two points.

**3b must land before the first self-shipped order is marked delivered.** Until
then the exposure is zero; after then it is the full shipping rate per order,
silently.

Phases 5 and 6 were originally the other way round. Self-ship moved ahead once
it became clear it is the migration path for existing IG supply rather than an
edge case, which also reduces how many orders the batch queue serves.

Phases 2 and 3 must land together. A half-applied payout predicate pays the
wrong amount silently.

## Open

- Value of N per fulfillment method, above.
- What happens when what the buyer paid for shipping differs from actual cost.
  Deferred previously; the data exists (`shipping_cost` + `package_snapshot`).
- Whether free shipping becomes the listing-form default. Making sellers choose
  explicitly avoids accidental margin loss; defaulting to free is better for
  buyer-side conversion. Not decided.
- Which tracking aggregator to use for non-Shiprocket couriers, and its cost
  per lookup at expected volume.
- Who absorbs the uninsured remainder on a parcel lost in self-ship transit.
  Blocking for Model C launch, see the Model C policy gap.
- What five real IG sellers actually use today. Unresolved and cheap to
  resolve; it decides whether Model C is the main path or a minority one.
