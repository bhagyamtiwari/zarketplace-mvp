# Marketplace Realignment Plan

**zarketplace — migration from the launch-offer/seller-shipped model to the trust-first model**
*(no selling fees · buyer-paid shipping + Buyer Protection · escrow until delivery · doorstep pickup)*

v1.2 — July 2026. Audit performed against the live production deployment (`cd2b6e2`), the live Supabase schema (project `wfaxtxprngyrxsmahxxa`), and the full source tree. Every claim in this document was verified directly this session unless marked **[verify]**. v1.2 locks the complete MVP economics (§0).

---

## 0. Approved Launch Decisions (locked — canonical MVP business model)

These are settled. Implementation must not re-open them.

### 0.1 Revenue model
- **Seller commission: 0%.** Sellers keep **100% of their listed selling price** — permanently, not as a launch offer.
- Buyers pay: **Item price + Buyer Protection fee + Shipping.**
- Platform revenue at MVP = Buyer Protection. (Promoted listings / featured closets / advertising are P3.)

### 0.2 Buyer Protection fee (final)
- **5% of the item price, minimum ₹49, no maximum cap**, rounded to whole rupees.
  - Examples: ₹500 item → ₹49 · ₹1,499 → ₹75 · ₹2,999 → ₹150 · ₹8,000 → ₹400.
- No cap at MVP by design — introduce/adjust a cap later from transaction data if needed.
- Displayed as a **separate, labeled line item** in checkout, order summary, order emails, and buyer order history. Never bundled into item price or shipping.

### 0.3 Shipping (final)
- **Buyer pays shipping** — always a visible line, never seller-absorbed, never hidden in the item price.
- **Category-based flat rates chosen by the seller at listing time**: the seller selects a shipping category (not parcel dimensions/weight); each category maps to a predefined buyer-facing rate (range ~₹80–₹250, exact table set in the pricing config).
- **zarketplace buys the label and books the doorstep pickup. Sellers never arrange couriers.** Exact flow: buyer pays at checkout → zarketplace purchases a prepaid shipping label for that order → seller packs the item and hands it to the courier at pickup (or drops it off) using the prepaid label zarketplace generated. The seller never pays for or arranges shipping themselves, and never sees a shipping cost on their side — only "pack it, it gets picked up."
- **Copy sweep requirement:** every surface still describing the old self-ship model must be rewritten for build #9 — confirmed stale as of this audit: [Sell.tsx](../src/pages/Sell.tsx) shipping section ("you cover postage" / "buyer pays the amount you set"), [SellerPolicy.tsx:35](../src/pages/SellerPolicy.tsx) ("sellers are responsible for packaging and shipping... within the 72-hour window"), [ShippingPolicy.tsx:28](../src/pages/ShippingPolicy.tsx) ("sellers must ship... within 72 hours"), [Faq.tsx:52](../src/pages/Faq.tsx) ("you have 72 hours... to ship it and upload tracking"), and [docs/SHIPPING.md](SHIPPING.md) ("each seller arranges their own courier"). The 72-hour window itself may still apply (seller must hand off to the prepaid pickup within 72h of sale) but every one of these must be reworded around "zarketplace generates your prepaid label, you just pack and hand it off" rather than "you arrange and pay for your own courier."
- Known trade-off (accepted): actual courier cost may deviate from the flat category rate on some routes; the platform absorbs/keeps the difference at MVP and tunes the table from real Shiprocket invoices.

### 0.4 Order & payout structure
- **One seller per order.** One order = one seller = one shipment = one payout. Cart may hold multiple sellers; checkout proceeds per seller. Multi-seller checkout returns post-launch (P3).
- **No tiered payouts.** Every seller: escrow → delivery → 48h review → payout. Trusted-seller benefits are P3.

### 0.5 Canonical messaging
> **List for free. Sell for free. Keep 100% of your asking price. Buyers pay for protection and shipping.**

This exact value proposition must be reflected consistently across the homepage, seller onboarding, FAQs, pricing/fee explanations, checkout, and all seller-facing marketing. No surface may contradict it (and no surface may frame free selling as temporary).

### 0.6 Pricing architecture (required)
- Buyer Protection parameters (percent, floor, future cap) and the shipping category → rate table live in **one central pricing configuration, not hardcoded in business logic**.
- Recommended shape: a `pricing_config` table (or single-row settings table) in Supabase read by the edge functions, with values snapshotted onto each order (`buyer_protection_fee`, `shipping_cost`) at order-creation time so historical orders are immune to config changes. Client reads the same source for display. A shared TS constant is acceptable only if a single module verifiably feeds both the web app and the edge functions — the codebase already has one copy-drift incident (email templates duplicated across functions); do not repeat it with money math.
- Changing a fee or a shipping rate must never require touching checkout/payout logic.

---

## 1. Executive Summary

**What exists today.** zarketplace is a working peer-to-peer resale MVP: React 19 + Vite SPA on Vercel, Supabase (Postgres/Auth/Storage/Edge Functions), Razorpay checkout with server-verified webhooks, Resend transactional email (8 templates), and a manual admin workflow for listing approval and seller payouts. Real data exists: 13 listings (8 approved/live), 18 orders, 9 users. The engineering quality of the payment path is genuinely good — payment status is only ever written by a signature-verified webhook, orders reserve inventory with expiry, and RLS is enabled on every table.

**Where the product stands.** Production is currently **broken at its most important page**: every product page white-screens due to a React hook-order bug (confirmed live via headless render — React error #310). Beyond that, the product faithfully implements the *old* model: sellers self-ship with their own courier, sellers set shipping cost (or absorb it), payouts are released at *shipped* (not delivered), and the whole site is wallpapered with "0% platform fees during launch — standard fees of 10–15% will be reintroduced" messaging.

**Migration strategy.** The good news: the architecture barely needs to change. Razorpay-collects-then-platform-pays-seller is already escrow-shaped; the payout ledger already exists; the refund policy already contains a 48-hour SNAD (significantly-not-as-described) window. The migration is mostly (a) **moving the payout release point from "shipped" to "delivered + 48h"**, (b) **replacing seller-defined shipping with Shiprocket pickup + buyer-paid shipping**, (c) **adding a Buyer Protection line to checkout**, and (d) **a full copy pass** that deletes every trace of "fees will be reintroduced." Sequenced right, the site keeps working at every step.

**The single most important strategic fix** costs zero engineering: the current launch banner *promises* sellers that 10–15% fees are coming. Under the new model that promise is false and corrosive (the Mercari lesson — never make sellers brace for a rug-pull). Killing that copy is a P0.

---

## 2. Current Product Audit

### 2.1 Architecture

| Layer | Implementation | Notes |
|---|---|---|
| Frontend | React 19, Vite 6, Tailwind 4, motion, react-router 7 | SPA, client-side data fetching only |
| Hosting | Vercel (`prj_DarscFWDmYyLpVMmcmc69OUbb7Qi`), SPA rewrite in `vercel.json` | Auto-deploy from `main`; latest deploy READY and current |
| Data | Supabase Postgres, RLS on all 6 tables | See §2.3 |
| Auth | Supabase Auth — **email + password with email-verification link** (`src/lib/auth.tsx`, `AuthModal.tsx`) | No OAuth, no magic link, no phone |
| Payments | Razorpay via 2 edge functions (`create-razorpay-order`, `razorpay-webhook`) | Client never sets payment status; webhook signature-verified |
| Email | Resend via `send-email` edge function + `email_log` table | 8 templates incl. `payout-released-seller`, `tracking-update-buyer` |
| Shipping | **None.** Sellers self-ship, paste tracking URL manually | `docs/SHIPPING.md` already sketches the Shiprocket integration |
| Analytics | Vercel Analytics + Speed Insights | No error monitoring (no Sentry or equivalent) |
| Dead code | `server.ts` (Express + better-sqlite3 `/api/products` server) — never deployed, contradicts the Supabase architecture | Delete during hardening |

### 2.2 Screen-by-screen review

- **Home (`src/pages/Home.tsx`)** — Full-screen black hero ("Rest in peace dm4price."), launch-offer ticker, 4-listing preview, proof grid (contains **"Low seller fees"** — old model), sustainability + F*ck Fast Fashion sections. Insider-joke headline explains nothing to a first-time visitor; merchandise below the fold; no trust mechanics explained anywhere.
- **Browse (`Browse.tsx`)** — Filterable grid of approved, unsold listings. Works. Fine as-is structurally.
- **Product page (`ProductPage.tsx`)** — **Crashes in production** (hook-order bug, fix already sitting uncommitted on this branch). Content-wise: shows condition meter, seller name, price; shows seller-set shipping; **no Buyer Protection explanation, no escrow/"money held until you confirm delivery" messaging, no refund-window mention** — the exact trust signals the new model sells.
- **Sell (`Sell.tsx`)** — Single long form: photos, title, brand, category, gender, size, condition, description, price/sale price, **Instagram handle (required)**, **UPI ID typed twice (payout at listing time)**, **shipping mode free/paid + seller-set shipping cost ("Goes 100% to you")**, launch-offer "fee receipt" card (`Free`, strikethrough `10–15%`). Listing goes to `pending` for manual admin approval.
- **Checkout (`Checkout.tsx`)** — Address → Razorpay → webhook-confirmed success. Totals: `item + seller-set shipping`. **No Buyer Protection line.** Clean 2-step UX, reservation countdown, resume state. Structurally ready to accept a third price line.
- **Cart (`Cart.tsx` / `lib/cart.tsx`)** — DB-backed cart, multi-item, multi-seller checkout supported (one order row per item). **Old-model assumption per §0.4:** multi-seller checkout must be restricted to one seller per order at launch.
- **Track Order (`TrackOrder.tsx`) + `lib/orderStatus.ts`** — Buyer-facing statuses map only to: confirming → confirmed/packing → "On its way" → (nothing). **There is no `delivered` state anywhere in the product or DB.** Tracking is a pasted URL.
- **Seller Portal (`SellerPortal.tsx`)** — Listings / Sales / Payouts tabs. Seller adds tracking to mark shipped; **the `seller_payouts` ledger row is created the moment the seller marks shipped**; copy says "your payout is released once it ships."
- **Admin (`Admin.tsx`)** — Listing approval queue, orders, **manual payout marking (`paid_out`)**, users. Admin pays sellers by hand to their UPI snapshot. No delivery confirmation step exists, so payouts can be released before the buyer has the item.
- **Account (`Account.tsx`)** — Profile, default address, default UPI.
- **Policies** — Terms, Privacy, Returns, RefundPolicy, ShippingPolicy, SellerPolicy, Conditions guide, FAQ, Grievance Officer, Trademark. Notable: **RefundPolicy/Returns already define a 48-hour SNAD claim window** (good foundation for Buyer Protection); ShippingPolicy/SellerPolicy mandate a **seller 72-hour self-ship window** (old model); FAQ says payout released "after you confirm shipment" (old model).

### 2.3 Database review (live schema)

Tables: `profiles`, `listings`, `cart_items`, `orders`, `email_log`, `seller_payouts` — all RLS-enabled.

Old-model fields that must change or be superseded:

- `listings.shipping_mode` (`free`/`paid`) + `listings.shipping_cost` — seller-defined shipping
- `listings.seller_upi_vpa` (+ check constraint) and `orders.seller_upi_vpa_snapshot` — payout captured per-listing
- `orders.status` check constraint: `awaiting_payment | awaiting_verification | paid | payment_failed | payment_conflict | shipped | cancelled | refunded` — **no pickup/delivery/review states**
- `orders` has no Buyer Protection fee column; `total_amount = amount + shipping_cost`
- `seller_payouts.status`: `awaiting_payout | paid_out` — created at ship time, no linkage to delivery
- `listings` has no weight/dimensions (needed for any real shipping rate) and no pickup address; `profiles` has no pickup address
- Legacy manual-UPI-era columns still present: `payment_utr`, `payment_receipt_url`, `payment_submitted_at` (harmless, ignorable)

### 2.4 Infrastructure review

- **Vercel:** production deploy current; SPA rewrite fine. `www` ↔ apex: apex 307-redirects to `www`, but every page's canonical tag is hardcoded to `https://zarketplace.com/` (apex, homepage URL) — SEO inconsistency.
- **Razorpay:** local `.env.local` holds an `rzp_test` key (the client-side `VITE_RAZORPAY_KEY_ID` is actually **unused** — the checkout key comes from the edge function response, which is correct). Live-mode readiness therefore depends solely on the `RAZORPAY_*` secrets in Supabase edge-function config — **[verify]** whether those are live keys, plus webhook secret registered against the live dashboard.
- **Shiprocket:** no integration, no account assumed. `docs/SHIPPING.md` contains a credible implementation sketch (auth → adhoc order → label → webhook).
- **Email:** Resend on the free tier; templates duplicated between `send-email` and `razorpay-webhook` bundles (deploy-both gotcha documented in commit history).
- **Monitoring:** none beyond Vercel analytics. The product-page outage shipped and stayed live undetected — this is the concrete argument for error monitoring + an ErrorBoundary (there is **no ErrorBoundary anywhere in `src/`**, verified by grep).
- **SEO/sharing:** static sitemap (no product URLs), one global OG image, no per-product meta (SPA), `robots.txt` fine.
- **Performance:** Razorpay `checkout.js` + risk-detection script load on every page from `index.html`.

### 2.5 Strengths / Weaknesses / Technical debt

**Strengths**
- Payment integrity design (webhook-only status writes, atomic fulfillment migrations, reservation locking) is above MVP grade
- Escrow-shaped money flow already: buyer pays platform, platform pays seller later — no architectural change needed for escrow, only a *timing* change
- Payout ledger (`seller_payouts`) already exists with the right shape
- Refund policy already anchors on SNAD claims within 48h of delivery
- Brand system (BrandKit.md) is coherent and the new trust positioning fits inside it
- Clean, small codebase; RLS everywhere; email log audit trail

**Weaknesses**
- Product page down in production (P0 bug)
- No delivery confirmation anywhere → escrow promise is currently unkeepable
- Trust mechanics invisible in UI even where they exist in policy
- Seller-set shipping produces incoherent buyer pricing (free vs arbitrary flat fees per item)
- One global crash can blank the whole SPA (no error boundaries)
- Supply is thin (8 live listings) — every UX decision matters less than inventory

**Technical debt**
- `server.ts` + `better-sqlite3` + Express deps: dead weight, delete
- `VITE_RAZORPAY_KEY_ID` env var declared but unused: remove
- Duplicated email templates across two edge functions
- Legacy manual-payment columns on `orders`
- `docs/CASHFREE.md` and other stale docs reference an abandoned provider

---

## 3. Business Model Differences

| Dimension | OLD (built) | NEW (target) | Consequence in product |
|---|---|---|---|
| Seller fees | "0% during launch," **explicit promise that 10–15% fees return** | **No selling fees, permanently** | Delete/rewrite `LaunchOfferBanner` (all 8 variants), Sell-page fee receipt, Home ticker, FAQ, any "launch offer" framing. Never re-frame free-selling as temporary (Mercari lesson) |
| Seller shipping | Seller chooses free/paid, sets own cost, ships via own courier in 72h | **Free doorstep pickup**, platform books courier | Remove `shipping_mode`/`shipping_cost` from listing flow; add pickup address + parcel weight; Shiprocket pickup booking; rewrite SellerPolicy/ShippingPolicy 72h self-ship rules into pickup-readiness rules |
| Buyer shipping | Pays whatever seller set (often ₹0) | **Pays category-based flat rate** (seller picks category at listing; rate from pricing config, ~₹80–₹250) | Checkout shows the category rate; product page shows shipping estimate; platform books label/pickup |
| Buyer Protection | Doesn't exist as a product/fee | **5% of item, min ₹49, no cap — separate line; the revenue model** | New checkout line item + `orders.buyer_protection_fee`; product-page explainer; new policy page; refund flow funded by it |
| Payout timing | Ledger row at *shipped*; admin pays UPI manually any time after | **After delivery + 48h buyer review window** | New order states (`delivered`, review window), payout release gated on them; seller copy: "paid after successful delivery" |
| Escrow visibility | Implicit, never mentioned | **Always visible** ("we hold the money until you confirm") | Order tracking timeline, product page, seller dashboard all surface escrow state |
| Revenue | Future seller commission | Buyer Protection now; promoted listings / featured closets / ads later | P3 placeholders only |
| Trust posture | Loud brand, quiet mechanics | **Trust is the defining characteristic** | Homepage/product/checkout copy leads with protection, pickup, escrow |

**What stays untouched:** brand identity and visual system, browse/product UX chassis, Razorpay integration pattern, Supabase architecture, RLS model, admin approval queue, email infrastructure, auth (email stays for MVP), cart, the entire "no DM for price" positioning.

---

## 4. Required Changes

### P0 — Launch Blockers

| # | Item | Detail |
|---|---|---|
| P0-1 | **Product page crash** | React #310 hook-order bug in `ProductPage.tsx` (two `useRef`s after early returns). Confirmed live. **Fix already applied + type-checked on branch `claude/interesting-visvesvaraya-01d3bb`, uncommitted** — commit, deploy, and click-test |
| P0-2 | **Error boundaries** | No `ErrorBoundary` exists. Add a route-level boundary so one component bug never blanks the site again; wire an error monitor (Sentry free tier) |
| P0-3 | **Kill the fee-rug-pull copy** | `LaunchOfferBanner` COPY/ticker/pricing variants + Home "Low seller fees" → permanent "no selling fees" messaging. This is a *strategy* blocker, not just copy |
| P0-4 | **Escrow correctness: payout after delivery** | Add `delivered` (+ review window) to `orders.status`; create/release `seller_payouts` only after delivery + 48h with no open claim; update SellerPortal/Admin/FAQ copy. Without this, "protected payments" is false advertising |
| P0-5 | **Checkout pricing = Item + Shipping + Buyer Protection = Total** | Fee per §0.2 (5%, min ₹49, no cap) from the central pricing config (§0.6); client display + `orders.buyer_protection_fee` snapshot + server-side total validation in `create-razorpay-order` |
| P0-6 | **Shipping v1** | Category-based flat rates (§0.3): seller picks shipping category at listing, buyer pays the mapped rate from the pricing config; Shiprocket label/pickup booking can be admin-operated at first (see build order) |
| P0-11 | **Central pricing config** | `pricing_config` source of truth for BP parameters + shipping category table (§0.6); values snapshotted per order; consumed by client display and edge functions alike |
| P0-7 | **Razorpay live readiness** | Confirm live keys + live webhook secret in Supabase function config; one real ₹ test transaction end-to-end **[verify]** |
| P0-8 | **Refund flow (SNAD)** | Buyer-initiated claim within review window (email-based is acceptable at MVP, but the order state machine must hold the payout while a claim is open) |
| P0-9 | **Order tracking states** | Paid → Pickup Scheduled → Picked Up → In Transit → Delivered → Review Window → Seller Paid, visible to buyer and seller |
| P0-10 | **Production environment hygiene** | Remove dead `server.ts`/sqlite/express; remove unused `VITE_RAZORPAY_KEY_ID`; load Razorpay script only on checkout; env documented |

### P1 — Core Product Migration

- **Homepage** — keep the brand voice, fix the communication (see §6). Lead with what it is + the four promises; listings above the fold; one primary CTA; trust strip
- **Listing flow** — remove free/paid shipping choice + per-listing UPI double-entry (payout details live on profile/Account); add pickup address (prefill from profile) + **shipping category selector** (§0.3); live payout display = "You receive ₹{price} — 100% of your asking price"; make Instagram handle optional (it's a seller-acquisition filter today); "Recommended Price" placeholder text only (do not build)
- **Product page** — Buyer Protection explainer row, shipping estimate, escrow line ("Your payment is held until you confirm delivery"), seller info block, refund window mention; **"More from this seller" section directly beneath the listing, followed by "You may also like / Continue browsing"** to keep buyers in the marketplace (see §8)
- **Single-seller checkout** — enforce one seller per order across cart → checkout → `create-razorpay-order` (per §0.4)
- **Trust-signal pass across the buyer journey** — review product, checkout, order, and account pages so the escrow/protected-payment flow is communicated at each step without adding friction: consistent vocabulary (Buyer Protection · secure payments · verified delivery · payout after delivery), one trust row per surface, no walls of reassurance text
- **Checkout** — transparent 3-line pricing; Buyer Protection line links to policy; keep reservation + webhook flow as-is
- **Seller dashboard** — Pickups (scheduled/completed) replaces "add tracking"; payouts show escrow state ("Held until delivery + 48h"); earnings summary
- **Buyer dashboard / Track order** — full new timeline with escrow visibility; "Confirm everything's OK" action (optional early-release) and "Report a problem" action during review window
- **Copy sweep** — FAQ, About, all emails (8 templates), success screens: no fee-return language, payout-after-delivery everywhere, pickup instead of "ship within 72 hours"
- **Policies** — new **Buyer Protection** page; rewrite Shipping Policy (pickup SLAs), Seller Policy (pickup readiness, packaging), Refund Policy (funded by Buyer Protection; claim flow), add **Pickup Policy** section, Counterfeit Policy, refresh How It Works / FAQ
- **Onboarding/navigation** — "How it works" for both sides reachable from nav; sell-page pitch = the four seller promises
- **Emails** — new/updated templates: pickup scheduled (seller), picked up (buyer), delivered (buyer, opens review window), payout released (after delivery), claim opened/resolved
- **Auth** — keep email; **prefer 6-digit email OTP over the verification link if practical** (Supabase `signInWithOtp` supports email codes; works with existing Resend). Document WhatsApp OTP + SMS fallback as a future recommendation — do not build now

### P2 — Product Improvements

- Seller profiles (public closet page per seller — replaces the Instagram-handle crutch)
- Seller statistics (views, saves, sales)
- Notifications (in-app order events)
- Wishlist / saved items
- Offers (make-an-offer) — note: interacts with escrow pricing; design later
- Saved searches / alerts
- SEO: dynamic sitemap with product URLs, per-product OG via edge function or prerender, canonical host fix (www vs apex)
- Analytics: funnel events (view → cart → checkout → paid), Sentry release tracking
- Dynamic Shiprocket rate at product-page level (pincode input)

### P3 — Future Roadmap (document only — do NOT implement)

Trust Score · Price Recommendation Engine · AI Pricing · AI Listing Assistant · Zarketplace Verified (authentication for luxury — the Vestiaire play, later) · Featured listings · Boosted listings · Seller subscriptions · Advertising · Brand partnerships · WhatsApp/SMS OTP migration (MSG91/Gupshup; DLT registration prerequisite ties to company compliance) · **Multi-seller checkout** (re-enable once logistics proven — §0.4) · **Trusted-seller benefits / tiered payouts** (faster release for proven sellers — §0.4) · **Buyer Protection fee cap** (introduce only if transaction data warrants — §0.2)

---

## 5. Recommended Build Order

Ordered by business impact; each task leaves the codebase working. Effort: S ≤ 1 day, M = 2–4 days, L = 1–2 weeks.

| # | Task | Why it matters | User impact | Depends on | Effort | Launch blocker |
|---|---|---|---|---|---|---|
| 1 | Commit + deploy product-page fix; add ErrorBoundary + Sentry | Site's core page is down *now* | Buyers can buy again | — | S | **Yes** |
| 2 | Copy strike: remove fee-return/launch-offer messaging sitewide (banner, Home, Sell, FAQ) | False promise under new model; erodes seller trust daily | Sellers see permanent free selling | — | S | **Yes** |
| 3 | Order state machine + escrow timing (DB migration: new statuses, `delivered_at`, review window; payout creation moves to delivery+48h; Admin gains "mark delivered" until webhook exists) | The heart of "protected payments" | Sellers paid after delivery; buyers protected | 1 | M | **Yes** |
| 4 | Central pricing config + Buyer Protection fee: `pricing_config` (§0.6), checkout line (5% min ₹49), `orders.buyer_protection_fee` snapshot, server-side total validation, policy page, product-page explainer | The revenue model, adjustable without code changes | Transparent pricing | 3 | M | **Yes** |
| 5 | Shipping v1 + single-seller checkout: enforce one seller per order (cart/checkout/`create-razorpay-order`); replace seller-set shipping with the category selector on Sell + category→rate table in pricing config; pickup address on listing | Coherent buyer pricing; one order = one shipment = one payout (§0.3, §0.4) | Sellers pick a category, never guess costs; buyers see the real price | 3, 4 | M | **Yes** |
| 6 | Shiprocket integration: pickup booking edge function, AWB/tracking persisted, status webhook → order states (admin-triggered booking at first, automated later) | "Free doorstep pickup" promise | Sellers never visit a courier | 5 | L | **Yes** (manual-ops fallback acceptable at soft launch) |
| 7 | Track-order + seller-dashboard timelines (Paid → … → Seller Paid, escrow always visible) | Trust made visible | Both sides see where money/item is | 3, 6 | M | **Yes** |
| 8 | Refund/claim flow: "Report a problem" in review window, claim state holds payout, admin resolve UI, refund via Razorpay | Completes Buyer Protection loop | Buyers trust the guarantee | 3, 4 | M | **Yes** |
| 9 | Policy + email rewrite (all templates, all policy pages, FAQ, How It Works) | System voice must match new mechanics | No contradictory promises | 3–8 | M | **Yes** |
| 10 | Homepage realignment (§6, new positioning) + Sell-page pitch + onboarding messaging pass | First-impression clarity; premium-marketplace positioning | Higher browse + list conversion | 2 | M | No (strongly recommended pre-launch) |
| 10a | Product-page discovery: "More from this seller" + "You may also like / Continue browsing" sections | Keeps buyers exploring; surfaces thin supply better | Longer sessions, more cross-listing discovery | 1 | S | No |
| 11 | Razorpay live cutover + real-transaction test + production hardening (dead code removal, script loading, env docs) | Can't take real money otherwise | — | 1–9 | S | **Yes** |
| 12 | Email OTP (6-digit) replacing verification link | Less friction, India-friendly, free | Faster signup | — | S–M | No |
| 13 | SEO pack: dynamic sitemap, per-product OG, canonical fix | Distribution is IG/WhatsApp links + search | Shared links look real | 1 | M | No |
| 14 | P2 items (profiles, wishlist, notifications, offers, saved searches) | Retention & supply | — | launch | L | No |

**Plan approved (v1.1).** Implementation proceeds as numbered execution prompts matching this order: 1. Product-page fix & hardening · 2. Copy strike · 3. Escrow state machine · 4. Buyer Protection · 5. Shipping v1 + single-seller checkout · 6. Shiprocket · 7. Timelines · 8. Claims/refunds · 9. Policies & emails · 10. Homepage & onboarding messaging · 10a. Product-page discovery sections · 11. Live cutover. Each prompt will name exact files, preserve architecture, and leave a working state. One logical unit per prompt; no batching.

---

## 6. Homepage Direction (recommendation only)

Current hero fails the first-visit test: "Rest in peace dm4price." explains nothing to someone outside the joke, merchandise is below the fold, two CTAs split intent, no trust mechanics visible, and the proof grid still says "Low seller fees."

**What the homepage must immediately communicate (approved direction):**
- Buy pre-owned fashion **with confidence**
- Buyer Protection
- Secure payments
- Pickup and delivery **handled through the platform** — buyers and sellers never coordinate manually
- Modern, premium marketplace — not a classifieds site

**Canonical seller-side value proposition (§0.5), verbatim across homepage, seller onboarding, FAQs, pricing pages, checkout, and seller marketing:**
> List for free. Sell for free. Keep 100% of your asking price. Buyers pay for protection and shipping.

Recommended execution (keeps BrandKit voice fully intact):
- Hero ≤ 60vh; headline can keep the brand edge, but the sub-copy does the explaining in plain system voice: **"buy & sell pre-loved fashion. buyer protection. secure payments. pickup & delivery handled by us."**
- One primary CTA (BROWSE); Start Selling becomes secondary/text
- "Available now." grid visible above or at the fold — inventory is the pitch, and real product photography is what separates a premium marketplace from a classifieds site
- Trust strip (4 items, check-dot style): Buyer Protection · Secure payments · Doorstep pickup & delivery · Payout after delivery
- Replace "Low seller fees" in the proof grid with "No selling fees"; add "Money held until delivery"; add "No coordination needed — we handle pickup & delivery"
- Split seller/buyer promise sections mirroring the new model's two promise sets
- **Onboarding/messaging consistency pass:** every step from first visit → sign-up → first browse/list reinforces trust, convenience, premium UX; no surface may still speak classifieds language (self-shipping, DM-era coordination, fee threats)

---

## 7. Listing Flow (target spec)

Photos → Title → Category → Brand → Size → Condition → Description → Price → **Live payout display ("You receive ₹X — no fees")** → Publish.

Deltas from today: remove shipping mode/cost; remove in-form UPI double-entry (payout details managed once in Account; listing snapshots it server-side); add pickup address confirm (prefilled) + **shipping category selection** (§0.3 — seller picks a category, e.g. "T-shirts & tops / Jeans & bottoms / Footwear / Jackets & heavy items"; each maps to a predefined buyer-facing rate from the pricing config; **no parcel dimensions or weights asked**); Instagram optional; keep condition tiers and photo-first order; keep admin approval queue ("verified listings" is a trust feature). Live payout display reads: **"You receive ₹{price} — 100% of your asking price. Buyers pay for protection and shipping."** Future placeholder only: "Recommended Price" hint text — do not build the engine.

---

## 8. Product Page (target spec)

Keep gallery/zoom/condition meter. Add, in order of trust impact: (1) price + shipping estimate + "Buyer Protection included at checkout" row; (2) escrow line — "Your payment is held by zarketplace until you confirm delivery"; (3) refund line — "Refund if it's significantly not as described (48h)"; (4) seller block (display name, listing count → future profile page). All in existing icon-row visual vocabulary.

**Discovery sections (approved — build #10a), directly beneath the listing, in this order:**
1. **"More from this seller."** — grid of the same seller's other approved, unsold listings (query by `seller_id`); hide the section entirely when the seller has no other live items. Reinforces the seller-as-closet mental model and previews the P2 seller-profile page.
2. **"You may also like." / "Continue browsing."** — related items by category/brand/size overlap, backfilled with newest listings so the section is never empty while supply is thin. Standard `ListingCard` grid, one "VIEW ALL ↗" utility link to /browse.

Both sections use the existing card grid vocabulary — no new visual patterns.

---

## 9. Checkout (target spec)

```
Item             Rs. 1,499
Shipping         Rs. 99      (seller-chosen category rate)
Buyer Protection Rs. 75      (5%, min Rs. 49)  (i) → policy
────────────────────────────
Total            Rs. 1,673
```

No hidden costs, ever. Buyer Protection is **always a separate, labeled line** (final — §0.2: 5% of item price, min ₹49, no cap, whole rupees). Both the fee and the shipping rate come from the central pricing config (§0.6) and are **snapshotted onto the order row**; `create-razorpay-order` must recompute and validate the total server-side from the same config — the client total is display only.

**One seller per order (decided — §0.4):** checkout only ever processes items from a single seller. If the cart holds items from multiple sellers, checkout splits by seller (buyer checks out one seller's items at a time) — one Razorpay payment, one shipment, one payout per order. `create-razorpay-order` must reject mixed-seller order groups as a server-side guard.

---

## 10. Order Tracking (target spec)

`Paid → Pickup Scheduled → Picked Up → In Transit → Delivered → 48-hour Review Window → Seller Paid`

- Escrow always visible ("zarketplace is holding the payment").
- During review window: "All good" (early release) / "Report a problem" (opens claim, freezes payout).
- Seller Paid closes the loop for both parties.
- DB: extend `orders.status` check constraint (keep old values valid for historical rows), add `delivered_at`, `review_ends_at`, `claim_open`; `seller_payouts` release gated accordingly.
- **Uniform payout flow (decided — §0.4):** every seller gets the identical escrow → delivery → 48h → payout sequence. No early release for "trusted" sellers, no tiering logic anywhere in the state machine at MVP.

---

## 11. Seller Dashboard (target spec)

Tabs stay. Changes: Sales tab becomes pickup-centric (pickup scheduled/date, no tracking form once Shiprocket books it); Payouts show three states — Held (in escrow) / Releasable / Paid — with the "paid after successful delivery" explanation; earnings total. Future monetization placeholders (promoted listing slot) as static "coming soon" copy at most.

---

## 12. Policies (rewrite list)

Buyer Protection (new) · Refund Policy (claims funded by Buyer Protection; keep 48h SNAD core) · Shipping Policy (pickup SLAs replace 72h self-ship) · Pickup Policy (new; can live inside Shipping Policy) · Seller Guidelines (pickup readiness, packaging, honesty grading) · Counterfeit Policy (new; ties to admin approval + future Verified) · How It Works (new page or FAQ section, both sides) · FAQ (payout timing, protection fee, pickup) · Terms (fee structure reference).

---

## 13. Authentication

Keep email auth for MVP. Prefer **6-digit email OTP** over the current verification link (`supabase.auth.signInWithOtp` with email codes; Resend already sends mail; removes the click-a-link-in-another-app dropoff). **Future recommendation (do not build now):** WhatsApp OTP primary (MSG91/Gupshup, ~₹0.12/msg, no DLT) with SMS fallback (MSG91, DLT registration required — blocked on company compliance paperwork); migration path = add phone column, dual-verify window, then phone-primary.

---

## 14. Technical Audit Summary

| Area | Status | Action |
|---|---|---|
| Razorpay | Test key locally; live-mode of edge-function secrets **[verify]**; webhook pattern solid | Live cutover checklist in build #11 |
| Shiprocket | Absent | Build #6; account + KYC prerequisite (company docs) |
| Env vars | `VITE_RAZORPAY_KEY_ID` unused; edge secrets undocumented | Document; remove dead var |
| Deployment | Vercel auto-deploy healthy | — |
| Error handling | No boundaries; silent white-screen failure mode proven | Build #1 |
| Logging | Good client `log.ts` + `email_log`; nothing aggregated | Sentry (build #1) |
| Monitoring | None | Sentry + Vercel alerts |
| Analytics | Pageviews only | Funnel events (P2) |
| Security | RLS everywhere; webhook signature verified; payment columns protected by migrations | Run Supabase advisors before launch **[verify]** |
| Production readiness | Blocked by P0 list | §4 |

## 15. Known Issues — verification results

| Issue | Verified? | Finding |
|---|---|---|
| Product page hook bug | ✅ Confirmed live | React #310; empty `#root` on `/item/*`; fix uncommitted on this branch |
| Error boundaries | ✅ Confirmed absent | No ErrorBoundary in `src/` |
| Razorpay live readiness | ⚠️ Partially | Client key unused (good); server secrets unverifiable from repo — check Supabase config |
| Shiprocket production readiness | ✅ Confirmed absent | No integration; docs sketch exists |
| Homepage clarity | ✅ Reviewed | §6 |
| SEO: canonical | ✅ Confirmed | Hardcoded apex canonical on every page; site lives on www |
| Social sharing | ✅ Confirmed | Single global OG image; no per-product tags |
| Sitemap | ✅ Confirmed | Static, 15 URLs, no products |
| Checkout script loading | ✅ Confirmed | `checkout.js` + risk script global in `index.html` |

---

*Prepared as the master implementation roadmap. No code changes were made as part of this plan beyond the pre-existing product-page fix already on this branch. **v1.1 approved with the locked decisions in §0** — implementation proceeds as the numbered execution prompts in §5.*
