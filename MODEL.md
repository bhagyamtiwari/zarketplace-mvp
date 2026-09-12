# Zarketplace — Business Model & Product Spec

> Context document for Claude Code. This supersedes all previous business-model
> assumptions in the codebase. The site was originally built as a peer-to-peer
> commission marketplace. That model is dead. Read this in full before changing
> anything.

---

## 1. What Zarketplace is

A pre-owned streetwear and name-brand clothing resale platform for the Indian market.

Categories: Carhartt, Stüssy, Supreme, Nike, vintage, oversized, designer.
Mostly menswear. **No ethnic wear.**

Long-term positioning: India's resale liquidation layer. Today deliberately
restricted to streetwear, vintage and designer clothing.

---

## 2. The legal model — READ THIS FIRST

Zarketplace is a **principal**, not a marketplace operator.

We **buy** items from sellers and **resell** them in our own name. We do not
facilitate transactions between two other parties. This is not a technicality —
it determines the entire data model, UI copy, and payment flow.

### Why

Operating as an e-commerce operator (ECO) under Indian GST would require:
- TCS collection and GSTR-8 filings
- GST on **gross** transaction value rather than margin
- Sellers to hold GST registration, or take an enrolment number that **restricts
  them to intrastate supply** — which makes a pan-India platform impossible

As a principal:
- Sellers need **no GST number and no enrolment number**, and can be anywhere in India
- We pay GST on **margin only** (Rule 32(5), CGST Rules)
- Purchases from unregistered individuals are exempt from reverse charge
  (Notification 10/2017-CT(R))

### The hard rules — never violate these

1. **Sellers never set prices.** Zarketplace issues a binding offer. Take it or leave it.
2. **Sellers never receive a percentage of the sale price.** Payout is a fixed
   rupee amount locked at offer acceptance.
3. **Zarketplace bears all price risk.** If we resell below our estimate, that's our loss.
4. **Payout is never linked to final resale price** — not in the database, not in
   the UI, not in any communication.

Any deviation reintroduces "agent in substance" risk and retroactive ECO
liability. This is not a move-fast-and-fix-later domain: GST misclassification
is assessed retroactively on gross value with interest and penalty, and attaches
to directors personally.

### Copy implications (important)

- Say: "We buy your item" / "Your guaranteed payout" / "We'll make you an offer"
- Never say: "We sell it for you" / "commission" / "your sale price" / "you earn X%"
- Never show the seller a percentage of anything.

The one permitted framing of what the payout covers, used verbatim and without
any breakdown or percentage:

> This is what we'll pay you. We cover shipping both ways, payment fees and
> handling, and we carry the risk if it doesn't sell.

---

## 3. Fulfilment lanes

### Patient lane — DEFAULT, build this now

Capital-light. We hold no inventory.

1. Seller submits item (photos + details) via web or WhatsApp
2. We approve or reject the listing
3. On approval, we issue a **binding offer**: fixed rupee payout
4. Seller accepts. Item goes live on site at our chosen resale price.
   **Seller keeps physical possession.**
5. Item sells to a buyer → buyer pays us
6. We notify seller, generate a prepaid label, schedule doorstep pickup
7. Item arrives at our hub → intake check
8. Hub adds packaging/stickers and dispatches to buyer
9. Seller is paid the locked payout

We take title at the moment of buyer purchase and pass it to the buyer
immediately. (Flag: exact title-transfer timing to be confirmed with GST counsel.)

### Instant lane — DO NOT BUILD YET, design for it

Seller ships to us first, gets paid within 24–48h of receipt at a lower offer.
We hold the item, shoot our own photos, and can dispatch in 1–2 days.

- Positioned to buyers as a **"Verified — ships in 48 hours"** filter on browse
- Gate entry by value: only items with estimated resale above ~₹2,000, where
  margin can absorb a markdown
- Must stay a **minority of intake** — it is an inventory business bolted onto a
  non-inventory business
- Offer gap vs patient lane should be meaningful but not so wide that patience
  always dominates (illustrative: ₹400 instant vs ₹600 patient — not ₹300 vs ₹600)

Keep the schema lane-aware from day one (`lane: 'patient' | 'instant'`) so this
doesn't need a migration later.

---

## 4. The offer engine

### Core formula

```
Offer = (Resale_est × 0.98) − 215 − Required_contribution
```

- `× 0.98` — payment gateway (~2% of resale)
- `− 215` — fixed per-item cost: two freight legs, packaging, handling/verification

**Work backwards from estimated resale price. Never forwards from a fixed markup.**

### Required contribution — floor plus declining percentage

A flat percentage fails at both ends: fixed costs are 29% of a ₹750 sale but 2%
of a ₹10,000 sale. Flat rates under-earn on cheap items and grossly over-earn on
expensive ones (which is how you end up offering ₹500 on something you list at ₹5,000).

| Est. resale | Required contribution | Offer   | Spread |
|-------------|----------------------|---------|--------|
| ₹1,000      | ₹250 (25%)           | ~₹515   | 48%    |
| ₹2,500      | ₹600 (24%)           | ~₹1,635 | 35%    |
| ₹5,000      | ₹1,100 (22%)         | ~₹3,585 | 28%    |
| ₹10,000     | ₹2,000 (20%)         | ~₹7,585 | 24%    |

Generosity at the top is nearly free and produces advocates. Absolute
contribution on a ₹10,000 piece is 10× that of a cheap one.

### Confidence discount

The real risk is a wrong `Resale_est`, not thin margin.

- Known brand, comps in our own sold data, common size → use estimate as-is
- Known brand, no comps, unusual size, condition issues → discount estimate 15–25%
  before running the formula
- No confident estimate → **reject, or route to manual review.** Rejecting is a
  valid output and should be common early on.

### Hard floors

- Minimum viable resale price: **₹750**
- Minimum offer: **~₹300**
- Intake functions as a filter — reject aggressively below the floor
- The ₹1,500–2,500 resale tier must be a meaningful share of mix

### Offer logging

Every offer is logged with its estimate, its computed components, and its
accept/decline outcome, so the tiers can be tuned on real data rather than
guesses. This is a requirement, not a nice-to-have.

### Roadmap (needs data, ~200+ sold listings)

1. **Sell-through probability** — multiply estimate by expected sell-through rate
2. **Failure rate** — fold condition-mismatch and ship-fail costs into required contribution
3. **CAC** — the ₹200 contribution floor is *before* customer acquisition cost

### The long-term asset

After a few hundred sales, `Resale_est` becomes a lookup:
`brand × item type × size × condition → median clearing price + median days-to-sell`.

Nobody has this dataset for Indian resale. **Log condition grade and
days-to-sell rigorously from listing #1, including on our own seed listings.**

---

## 5. Listing lifecycle

There are **two separate clocks**. Do not conflate them.

- **Offer acceptance window: 7 days.** From the moment we issue the offer. If the
  seller does not accept within 7 days, the offer lapses.
- **Listing window: 45 days**, starting **from acceptance** — not from submission
  and not from the offer being issued. (Start here, tune later.)

Possession checks at 30 and 60 days, plus a lightweight
"do you still have it?" WhatsApp ping every 2–3 weeks (yes/no button).
Two consecutive non-responses → auto-delist.

### On expiry — do NOT auto-purchase

If it doesn't sell, the listing simply expires. No supply occurred, so there is
no ECO exposure, and there is nothing to settle.

**Never auto-buy unsold inventory.** That is adverse selection by design — you'd
be buying exactly the items the market rejected at your own estimated price, and
it recreates the dead-inventory problem the whole model exists to avoid.

### Re-offer at expiry

One button: *"This didn't sell at ₹1,200. We'll relist at ₹900 for another 30
days — new payout ₹350. Yes / No."*

- Cap at one or two re-offers, then expire permanently
- Gives a markdown mechanism with zero inventory held
- Generates price-elasticity data per category
- No disclosure problem: resale prices are public on the site anyway

### Discretionary buy

Occasionally a good piece just didn't get seen. Buying it is a **human decision
on an individual item**, priced at a liquidation discount, routed to the instant
lane. Never a clause in standard seller terms.

---

## 6. Shipping

**Prepaid labels only. Do not offer sellers a choice of shipping method.**

The ₹70–80 saving is irrelevant next to what the label provides: tracking as
proof of the ship commitment, evidence in condition disputes, a controlled RTO
path, and one carrier account to reconcile.

- Use an aggregator (e.g. ShipRocket) with **doorstep pickup** and reattempts —
  the seller never leaves home
- Reframe the seller commitment as *"be reachable and have it packed,"* not
  *"ship within 48 hours"*
- Flow: item sells → generate label → schedule pickup next working day →
  WhatsApp ping with date + confirm button
- Two failed pickups → listing pulled, buyer refunded, seller moved to restricted tier
- **Prepaid only for buyers. COD is non-negotiable — RTO rates break the model.**

**Track ship-fail rate per seller from day one.** It is the single metric that
determines whether the patient lane works at scale.

---

## 7. Intake / condition mismatch

Buyer has already paid when the item arrives at our hub. Seller-supplied photos
mean variance is inevitable. Needs a **pre-set decision tree**, not case-by-case
judgement:

| Finding | Action |
|---|---|
| Minor variance | Ship with disclosure + partial buyer credit |
| Material variance | Cancel, refund buyer; return to seller at seller's cost or deduct from payout |
| Counterfeit | Hold, no payout, seller banned |

Write this into seller terms **before the first external listing.**

Budget **5–10%** of patient-lane orders hitting this in early months. This is a
real line item against the ~₹200 contribution — arguably more decisive than freight.

---

## 8. Returns

Zarketplace is the seller of record to the buyer. This is our liability, not the
seller's. The seller is out of the loop entirely once paid.

| Case | Policy |
|---|---|
| Not as described / wrong item / undisclosed flaw | Full refund, return at our cost |
| Sizing or changed mind | No refund by default. Optional store credit at 80–90% as a discretionary goodwill lever |
| Other | Case by case, logged |

### The real defence is disclosure, not policy

- **Measurements in centimetres on every listing** — pit-to-pit, length, sleeve.
  Not just tag size. Vintage sizing is unreliable and "it didn't fit" is the
  single largest return driver in used apparel.
  Required for tops and outerwear; optional for other categories. Stored as
  structured numeric fields, never free text, so they can drive size filtering
  later. Show a short "how to measure" illustration inline — most sellers have
  never done this.
- Every flaw photographed **and** stated in text.

### Returned items

We already own them. They go into owned inventory, get our own photos, and
relist as held stock — the seed of the instant lane, and a small liquidation pool.

**If returns exceed ~8%, that's a listing-quality problem, not a returns problem.**

---

## 9. Photography

**Seller-supplied. No in-house studio.** The hub is intake check → stickers →
dispatch. Nothing more.

Polished studio shots on used clothing read as retail and suppress trust. Buyers
want to see the actual item in actual light.

Enforce **completeness, not beauty**. Required angles:
- Front
- Back
- Tag / size label
- Brand mark
- Every flaw

**Reject for missing angles, never for bad lighting.**

Get visual consistency through processing, not photography: force a neutral
background, auto-crop to a fixed aspect ratio, normalise brightness.

---

## 10. WhatsApp seller funnel — build after the listing flow works

Two acquisition funnels: website and WhatsApp. WhatsApp for a seller's first
one or two listings; graduate high-volume sellers to a bulk web flow.

### Design rules

- **Buttons and list pickers only. No free text from the seller.** Removes NLU
  from the critical path; makes the flow deterministic.
- One phone number = one thread. **Do not attempt parallel conversations.**
  Give each listing a short ID (`ZP-041`) and provide a "My listings" menu that
  reprints current status on demand. The thread is a command line, not a record.
- **Respect the 24-hour service window.** Replying with an offer inside the
  window is free; missing it requires a paid template message to reopen. Treat
  this as an SLA requirement with a cost attached.
  (Note: Meta has announced changes to service-message pricing effective
  Oct 2026 — verify current rates with the BSP before modelling volume.)

Build and test it against our own seed listings first, operating it as the
seller, to surface broken states before a real seller does.

---

## 11. Unit economics reference

- Fixed per-item cost: **~₹215 + ~2% of resale** (two freight legs, packaging,
  handling/verification, payment gateway)
- Minimum viable resale: **₹750**; minimum offer: **~₹300**
- Healthy contribution: **~₹200/item before CAC**, requiring ~₹450 absolute spread
- CAC strategy: organic and SEO-primary, targeting brand-name queries
  (e.g. "Carhartt Detroit jacket size L")

---

## 12. What we are NOT

For clarity when making product decisions:

- **Not eBay.** eBay is a pure agent taking 15–20% of gross, with zero custody
  and zero price risk. Rejected — that's the ECO shape.
- **Not StockX.** StockX is a bid/ask exchange and a broker, never an owner. It
  works because deadstock sneakers are fungible commodities with order books.
  **Our inventory is one-of-one** — a used jacket in a specific condition has no
  order book, ever. Do not copy their three-price UI (highest bid / lowest ask /
  asking price): we cannot show a bid, and displaying an "asking price" invites
  sellers to negotiate, which breaks hard rule #1.
  - What *is* worth borrowing from StockX: the post-sale ship window backed by
    real penalties. That's what makes a zero-inventory model trustworthy.
- StockX authenticates (binary: real or fake). **We assess condition**
  (continuous, judgement-heavy). Ours is the harder problem and resists
  automation longest.

---

## 13. Current sequence

1. Fix the listing/offer flow end to end (offers issued, accepted, labels generated)
2. Seed **~40 of our own listings** so the site isn't empty — this is also the
   first real unit-economics test. Track actual sell-through time, actual
   freight both legs, actual final price vs the engine's estimate.
   (Caveat: own listings do **not** test the patient/instant lane split, seller
   reliability, or condition mismatch — we are both parties.)
3. One timeboxed IA/UX pass. The current site was built for the old commission
   model, so the information architecture points at the wrong business — what
   the home page promises, what the listing page emphasises, what the seller
   path assumes. Fix that. Spacing and type treatment are procrastination bait.
4. Recruit **5–10 external sellers manually** (DMs, thrift communities) before
   spending on ads. This is where ship-fail and condition-mismatch rates actually
   reveal themselves.
5. Complete several real patient-lane transactions end to end, **including one
   deliberate failure**, before running buyer ads. Paid buyers landing on a
   catalogue where 20% of items can't ship is worse than a week's delay — those
   become the first reviews.
6. Build the WhatsApp seller layer.
7. Then ads.

---

## 14. Open items

- **Trademark clearance on "Zarketplace"** (ZAR- prefix, Classes 25 and 35,
  Inditex overlap). Needs professional legal attention **before** significant
  brand investment. Blocking for any rebrand work.
- Validate unit economics at the ₹750+ resale floor with real transactions.
- Confirm with GST counsel: the margin scheme and reverse-charge treatment on
  this exact flow, particularly **when title transfers in the patient lane** —
  that is the detail an assessing officer would probe.

*(Nothing in this document is legal or tax advice.)*
