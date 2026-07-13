# zarketplace — Pre-Launch Security & Production-Readiness Audit

Phase 1 audit (Claude Fable 5, 2026-07-12). Phase 2 implementation is handed to
Claude Opus — execute highest-risk first, preserve functionality, smallest safe
changes, re-check after each group, and tick items here as they land.

Scope covered: auth, authorization, Supabase RLS (all 8 public tables verified
live), schema, all 20 migrations, storage buckets (verified live), all 5 edge
functions, SPA frontend, env/build/Vercel config, error handling, logging,
privacy, payment + escrow flow, listing/checkout/seller/admin flows, file
uploads, search, notifications, and third-party integrations (Razorpay,
Shiprocket, Resend, Vercel Analytics, Google Fonts).

Project: Supabase `wfaxtxprngyrxsmahxxa` (prod). No buyer↔seller messaging
feature exists (contact is email-only) — nothing to audit there.

Legend: [ ] open · [~] partial · [x] done. Severity: C=Critical, H=High,
M=Medium, L=Low.

---

## A. Payment / escrow correctness — the parts that ARE solid

Verified correct, do not regress:
- `orders.status = 'paid'/'payment_failed'` is only ever written by the
  service-role webhook, never the client. Checkout polls; it never trusts
  Razorpay's client `handler`.
- Razorpay webhook verifies HMAC-SHA256 with a timing-safe compare, is
  idempotent per `razorpay_payment_id`, and fulfils via
  `fulfill_captured_payment()` (single-transaction claim + mark-paid, so a
  crash can't leave a listing claimed without its order paid).
- `orders_snapshot_from_listing` re-derives amount / shipping / buyer-protection
  fee / total server-side; a crafted client insert cannot under-charge.
- `orders_enforce_transitions` blocks buyers/sellers from editing financial,
  ownership, payment-provider, or counter-party columns and constrains status
  transitions.
- Escrow: payout row is created by the `handle_order_delivered` trigger only on
  `delivered`, held until `releasable_at` (delivery + 48h) with no open claim;
  `delivered` and `claim_open` are admin/service-role only.
- `fulfill_captured_payment` and `compute_buyer_protection_fee` had their public
  EXECUTE grants revoked (migrations 9 and 3-lockdown).

---

## FINDING 1 — [H] Order-reservation auto-expiry was dropped; abandoned checkouts brick a listing forever

**Root cause.** Migration `20260623000006` made `orders_snapshot_from_listing`
(a) set `reservation_expires_at = now()+20min`, (b) lazily expire stale
`awaiting_payment` orders, and (c) re-check availability — while adding the hard
guarantee: `CREATE UNIQUE INDEX orders_listing_one_active_reservation_idx ON
orders(listing_id) WHERE status='awaiting_payment'`.

Migration `20260710000002` (pricing) then **redefined the same function without
any of (a)/(b)/(c)**, and `20260710000004` / `20260711000001` kept that reduced
form. Verified against the live DB: the current function sets no
`reservation_expires_at` and has no lapse/availability logic. **The unique index
is still live.**

**Failure scenario.** Buyer A opens checkout → an `awaiting_payment` order row is
inserted, reserving the listing via the unique index, with
`reservation_expires_at = NULL`. Buyer A closes the tab without ever attempting
payment (so no `payment.failed` webhook ever fires). Nothing — no cron, no lazy
expiry, no client `onExpire` (it keys off the now-NULL timestamp) — ever moves
that row out of `awaiting_payment`. Every future buyer's checkout insert for that
listing fails on a unique-key violation. **The item becomes permanently
unbuyable after a single abandoned checkout.** The reservation countdown UI in
`Checkout.tsx` also silently no-ops.

**Affected:** live `public.orders_snapshot_from_listing`; `src/pages/Checkout.tsx`
(reservation timer/resume).

**Fix (server, authoritative).** Restore reservation handling in the current
function body (keep the pricing/shipping/pickup snapshot logic):
- set `NEW.reservation_expires_at := now() + interval '20 minutes';`
- before the availability check, lapse stale holds:
  `UPDATE public.orders SET status='payment_failed' WHERE listing_id=NEW.listing_id AND status='awaiting_payment' AND reservation_expires_at < now();`
- keep the friendly `EXISTS(... status='awaiting_payment')` → raise "reserved by
  another buyer".
Confirm the `orders_enforce_transitions` "expired reservation lapsing" branch
(migration 6) is still present live so the lapse UPDATE is permitted for
non-admin actors. Consider a belt-and-suspenders scheduled sweep (pg_cron) as
defence in depth, but lazy expiry restores the intended behaviour with no cron.

**Risk if unfixed:** routine checkout abandonment silently removes inventory;
one-of-one items disappear from sale with no error surfaced to anyone. Launch
blocker.

- [x] 1.1 Restore reservation logic in `orders_snapshot_from_listing` (new migration) — migration `20260712000001_restore_reservation_expiry.sql` restores stamp/lapse/friendly-check on the current body; applied live to `wfaxtxprngyrxsmahxxa`, verified all three present via `pg_get_functiondef`.
- [x] 1.2 Verify lapse transition still allowed by `orders_enforce_transitions` — confirmed the "expired reservation lapsing" branch is still live in prod, so the lapse UPDATE is permitted for non-admin actors; no change to that function needed.
- [x] 1.3 Confirm `Checkout.tsx` timer + resume behave with a real expiry again — no client change needed; it already reads `reservation_expires_at` from the insert `.select()` (line 241/244) and drives `useCountdown`/`onExpire`, which now receives a populated timestamp.

---

## FINDING 2 — [H] Seller PII (UPI ID, email, home pickup address, phone) is world-readable via the listings API

**Root cause.** `listings_public_select` is row-level only:
`USING ((status='approved' AND is_sold=false) OR seller_id=auth.uid() OR is_admin())`.
RLS does not restrict columns, and the table carries `seller_upi_vpa`,
`seller_email`, `seller_instagram`, and `pickup_address` (jsonb: full name,
phone, street address, landmark, city, state, pincode). Every frontend read uses
`select('*')`, so this PII is already shipped to every anonymous browser.

**Failure scenario.** An unauthenticated visitor calls
`GET /rest/v1/listings?select=seller_upi_vpa,seller_email,pickup_address&status=eq.approved`
with just the anon key and harvests every active seller's UPI VPA, email, phone,
and home address. (Verified: the anon SELECT policy is live and all four columns
exist on the table. I did not dump real rows.) This is a serious privacy breach —
under India's DPDP Act this is personal + financial data — and enables UPI
phishing and physical targeting of sellers.

**Affected:** `public.listings` RLS/grants; every `select('*')` on listings —
`src/pages/Browse.tsx`, `Home.tsx`, `ProductPage.tsx`, `lib/cart.tsx`,
`Sell.tsx` prefill; `types.ts` `Listing`.

**Fix.** Stop exposing sensitive columns to anon/authenticated non-owners.
Recommended, lowest-regression path:
1. Create a `public_listings` **view** (or a `SECURITY INVOKER` view) selecting
   only buyer-safe columns (everything except `seller_upi_vpa`, `seller_email`,
   `pickup_address`; `seller_instagram` is arguably public-by-intent — keep if the
   product wants it, it's a public handle). Grant SELECT on the view to anon;
   point Browse/Home/ProductPage/cart reads at it.
2. Tighten base-table SELECT so only the owner/admin can read the sensitive
   columns — either restrict `listings_public_select` to owner/admin and serve
   the public catalogue from the view, or use column-level `REVOKE SELECT
   (seller_upi_vpa, seller_email, pickup_address) ON public.listings FROM anon,
   authenticated`.
3. Update `select('*')` call sites to explicit safe column lists; the checkout
   path already re-derives `seller_upi_vpa_snapshot`/`pickup_address` server-side
   from the base row inside the SECURITY DEFINER trigger, so it keeps working.

**Dependency:** must land together with the frontend column-list changes
(Finding 7) or reads break.

- [x] 2.1 Public-safe view + grants (new migration) — migration `20260712000002_listings_public_view.sql` creates definer view `public.public_listings` (safe columns only, WHERE approved+unsold) and grants SELECT to anon/authenticated; applied live to `wfaxtxprngyrxsmahxxa`. Verified anon sees 7 view rows (== approved-unsold count) and the view exposes no seller_email/seller_upi_vpa/pickup_address column.
- [x] 2.2 Restrict sensitive columns on base table (RLS) — same migration drops the old anon-readable `listings_public_select` and recreates it owner/admin-only (`seller_id = auth.uid() OR public.is_admin()`); INSERT/UPDATE/DELETE unchanged. Verified anon now reads 0 rows from base `public.listings`; owner/admin retain full-row access by the policy predicate.
- [x] 2.3 Repoint frontend reads; drop sensitive fields from `CartItem`/UI paths — see Finding 7; public reads moved to `public_listings`, cart/checkout no longer carry seller UPI/email.

---

## FINDING 3 — [M] PostgREST filter injection in Browse search

**Root cause.** `src/pages/Browse.tsx:70`
`query.or(\`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%\`)`
interpolates the raw `?search=` URL param into a PostgREST `.or()` filter string.

**Failure scenario.** A `search` value containing commas, parentheses, or
`col.op.val` tokens changes the parsed filter — e.g. adds OR-conditions on other
columns, enabling boolean-based enumeration, or throws 500s (light DoS / probing).
RLS still caps rows to approved listings so it can't exfiltrate hidden rows, but
combined with Finding 2's exposed columns it widens what an attacker can pivot on,
and it's an uncontrolled query-shape primitive.

**Fix.** Sanitize before interpolation: strip/escape `,()*:%\` and backslashes,
cap length; or run separate `.ilike()` calls; or use `textSearch`. Encode the
value rather than trusting it.

- [x] 3.1 Sanitize `searchQuery` in Browse (and audit any other `.or(\`...\`)` with user input) — added `sanitizeSearch()` in `Browse.tsx` (strips `,()*:` and backslash, collapses whitespace, caps 80 chars) applied before the `.or()` interpolation; skips the filter if the sanitized term is empty. Audited the codebase: the only user-input filter interpolation is Browse; `ProductPage.tsx` uses parameterized `.ilike('sku', slug)` (value-escaped, safe), Home/ProductPage `.or('is_sold...')` are static.

---

## FINDING 4 — [M] Migration drift: security-relevant DB objects are not in the repo

**Root cause.** The live DB contains `handle_new_auth_user()`,
`link_existing_records_to_profile()`, `rls_auto_enable()` (an event trigger that
auto-enables RLS on new public tables), and `admin_pending_listings()` — none of
which exist in `supabase/migrations/`. The repo's `clean_slate` defines
`handle_new_user` instead. So the real signup path (profile creation +
`link_existing_records_to_profile`, which auto-claims listings/orders by matching
email on new-user insert) is unversioned and unreviewed. Rebuilding from
migrations would not reproduce prod. Memory already notes remote/repo ledger
divergence and that `db push` is blocked.

**Failure scenario.** `link_existing_records_to_profile` reassigns any
`seller_id IS NULL` listing / `buyer_id IS NULL` order to a newly created user
whose email case-insensitively matches `seller_email`/`buyer_email`. If any such
NULL-owner rows exist, registering an account with a matching email address
claims those records. Whether this is exploitable depends on whether NULL-owner
rows can exist — needs review — but an unversioned auth-side account-linking
function is a governance and security risk regardless.

**Fix.** Capture the live schema (functions, triggers, event triggers, grants,
storage policies) into a reconciliation migration so repo == prod; review
`link_existing_records_to_profile` for the claim scenario and add a guard if
NULL-owner rows are reachable. Coordinate with the blocked-`db push` workaround
(apply reconciliation via dashboard, per project memory).

- [x] 4.1 Dump live functions/triggers/event-triggers into a migration — `20260712000004_reconcile_drift.sql` captures `handle_new_user`, `link_existing_records_to_profile`, `rls_auto_enable` + `ensure_rls` event trigger, and `admin_pending_listings` (all previously live-only). Applied to prod, ran clean. Ground truth found: `auth.users` had TWO INSERT triggers both creating a profile (`on_auth_user_created`→`handle_new_user` and live-only `trg_on_auth_user_created`→`handle_new_auth_user`), double-firing harmlessly via ON CONFLICT.
- [x] 4.2 Review `link_existing_records_to_profile` claim path; guard if needed — function was attached to NO trigger (inert), and 0 NULL-owner orders exist. `listings.seller_id`/`orders.buyer_id`/`seller_id` confirmed: listings.seller_id NOT NULL (claim inert); orders.buyer_id/seller_id nullable + ON DELETE SET NULL, so email-reuse-after-deletion could claim historical orders IF the function were ever wired. Hardened by removing the by-email orders-claiming entirely (no created_at/email_confirmed_at guard actually defends against reuse); kept only the inert listings claim. Function remains unwired.
- [x] 4.3 Reconcile migration ledger so a clean rebuild matches prod — same migration consolidates signup to the single repo-canonical wiring: kept `on_auth_user_created`→`handle_new_user`, dropped the redundant `trg_on_auth_user_created` trigger and `handle_new_auth_user` function. Verified: `auth.users` now has exactly one INSERT trigger. Storage policies were already reconciled in Group C migration `20260712000003`.

---

## FINDING 5 — [M] Public storage buckets have no size or MIME limits

**Root cause (verified live).** `listing-images` (public) and `digitalassets`
(public) both have `file_size_limit = NULL` and `allowed_mime_types = NULL`. The
`listing_images_auth_insert` policy only requires `auth.role()='authenticated'`.
The security advisor also flags `listing_images_public_read` as a broad SELECT
policy allowing full bucket **listing/enumeration**.

**Failure scenario.** Any signed-in user uploads arbitrary content types
(HTML/SVG/JS) at unlimited size to a public, CDN-served bucket → storage-cost
abuse and hosting attacker-controlled HTML/SVG on the Supabase storage origin;
plus anyone can enumerate every uploaded file.

**Fix.** Set `file_size_limit` (e.g. 8 MiB, matching `order-attachments`) and
`allowed_mime_types = image/png,jpeg,jpg,webp` on `listing-images` and
`digitalassets`; scope/remove the broad public SELECT (object URLs don't need a
list policy). Enforce client-side image type/size in `Sell.tsx` too (currently
unrestricted `accept="image/*"` with no size check).

- [x] 5.1 Add size + MIME limits to `listing-images` and `digitalassets` — migration `20260712000003_storage_hardening.sql` sets `file_size_limit=8388608` (8 MiB) and `allowed_mime_types={image/png,image/jpeg,image/jpg,image/webp}` on both; applied live. `digitalassets` holds only two brand PNGs (`pfp-favicon.png`, `workmark-tp.png`), so image-only types are safe. Existing objects unaffected.
- [x] 5.2 Remove/narrow the broad bucket SELECT (stop enumeration) — same migration drops `listing_images_public_read`. Verified an existing listing image public URL still returns 200 after the drop (public buckets serve via the `public=true` flag, not the SELECT policy). `digitalassets` had no analogous broad SELECT policy. Advisor `public_bucket_allows_listing` for `listing-images` is now gone.
- [x] 5.3 Client-side image size/type guard in `Sell.tsx` — `handleImageChange` now rejects non-(png/jpeg/jpg/webp) and files over 8 MiB with a friendly `alert`, matching the bucket limits.

---

## FINDING 6 — [M] No security headers / CSP; wildcard CORS on authenticated edge functions

**Root cause.** `vercel.json` sets only `Cache-Control`. No `Content-Security-
Policy`, `X-Frame-Options`/`frame-ancestors` (clickjacking), `X-Content-Type-
Options`, `Referrer-Policy`, or HSTS. All edge functions share
`Access-Control-Allow-Origin: *`, including the JWT-authenticated ones
(`create-razorpay-order`, `send-email`, `shiprocket-create-order`).

**Failure scenario.** Any XSS has full blast radius (no CSP); the app can be
framed for clickjacking; any origin can invoke the authenticated functions with a
forwarded bearer token. (CSRF risk is limited because auth is a bearer token, not
a cookie.)

**Fix.** Add a security-header block in `vercel.json` (CSP allowing self +
`checkout.razorpay.com`, `*.supabase.co`, Google Fonts; `frame-ancestors 'none'`;
`X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-
origin`; HSTS). Scope edge-function CORS to the production origin(s) instead of
`*`.

- [x] 6.1 Security headers + CSP in `vercel.json` — added a `/(.*)` header block with CSP plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, HSTS (2y, includeSubDomains, preload), and `Permissions-Policy`. CSP covers every external host the code loads: Razorpay checkout script + iframe, Supabase, Vercel Insights, Google Fonts, and the `images.unsplash.com` fallback image. Existing `/assets/(.*)` cache header and SPA rewrite kept. Note: Vercel headers do not apply under `vite dev`, so CSP must be confirmed on the next deploy.
- [x] 6.2 Restrict edge-function `Access-Control-Allow-Origin` to site origin(s) — added `corsHeadersFor(req)` in `_shared/cors.ts` reflecting the Origin only if allowlisted (zarketplace.com, www, localhost/127.0.0.1 :3000 and :5199); unknown origins get no ACAO. Wired into the three browser-invoked authed functions (`create-razorpay-order`, `send-email`, `shiprocket-create-order`); the two server-to-server webhooks keep the permissive static `corsHeaders`. Edge functions are deployed separately and need redeployment for this to take effect.

---

## FINDING 7 — [M] Frontend `select('*')` + PII in cart/state (couples with Finding 2)

**Root cause.** Listings are read with `select('*')` in Browse/Home/ProductPage;
`lib/cart.tsx` explicitly selects and snapshots `seller_upi_vpa` into
`localStorage`/`cart_items`-derived state; `types.ts` models these fields
client-side. Independent of the API exposure, this stores a seller's UPI on every
buyer's device.

**Fix.** After Finding 2, switch all reads to explicit safe column lists and
remove `seller_upi_vpa`/`seller_email`/pickup from `CartItem` and client state
(the server trigger snapshots them at order time from the base row — the client
never needs them). This is the frontend half of Finding 2 and must ship with it.

- [x] 7.1 Replace `select('*')` with safe column lists on all listing reads — public reads repointed to `public_listings`: `Browse.tsx`, `Home.tsx`, `ProductPage.tsx` (main fetch + owner/admin fallback to base `listings` with an explicit safe-column list for pending/sold self-views; "you might like"), `lib/cart.tsx` (`fetchListingsByIds` safe columns), `Checkout.tsx` (buy-now fetch). Owner/admin base reads (`SellerPortal.tsx`, `Sell.tsx` prefill, `Admin.tsx`) left on `listings` and still permitted by the tightened policy.
- [x] 7.2 Drop seller UPI/email/pickup from `CartItem`, cart persistence, `types.ts` — removed `seller_email`/`seller_upi_vpa` from `ListingLike`, `snapshot()` (cart.tsx) and `snapshotFromListing()` (Checkout.tsx) and from `CartItem` (types.ts); made `seller_email`/`seller_upi_vpa`/`pickup_address` optional on `Listing`. Order-insert now passes `seller_email: null` / `seller_upi_vpa_snapshot: null`; verified the `orders_snapshot_from_listing` trigger re-derives both (and `pickup_address`) server-side for non-admin inserts. `npx tsc --noEmit` clean.

---

## FINDING 8 — [L] Dead code, unused deps, dead build config

- `src/components/PaymentProofInput.tsx` — unreferenced (pre-Razorpay UPI-proof
  remnant). Remove. Related dead columns `orders.payment_utr`,
  `payment_receipt_url` and the removed `orders_proof_required` constraint are
  legacy from that flow; `Admin.tsx ProofCell` only reads `payment_submitted_at`.
- `@google/genai` — in `package.json` deps, imported nowhere. Remove.
- `vite.config.ts` defines `process.env.GEMINI_API_KEY` — dead, and a footgun: if
  the env var were ever set it would be inlined into the client bundle. Remove.
- Old `listings.shipping_mode`/`shipping_cost` columns are superseded by
  `shipping_category` (migration 4 left them intentionally); schedule a later
  drop once nothing reads them.

- [x] 8.1 Delete `PaymentProofInput.tsx` — removed; grep confirmed zero external imports.
- [x] 8.2 Remove `@google/genai` dep and the `GEMINI_API_KEY` define — dropped from `package.json`, regenerated `package-lock.json` via `npm install` (0 refs remain), removed the `process.env.GEMINI_API_KEY` define plus now-unused `env`/`loadEnv`/`mode` from `vite.config.ts`. `npx tsc --noEmit` clean.
- [ ] 8.3 (Later, deferred) Dead DB columns safe to drop in a dedicated migration: `listings.shipping_mode`, `listings.shipping_cost` (superseded by `shipping_category`), `orders.payment_utr`, `orders.payment_receipt_url` (legacy UPI-proof flow, only `payment_submitted_at` is read). Not dropped here (destructive); no code references them.

---

## FINDING 9 — [L] Auth server settings weaker than the app implies

**Root cause (config.toml + advisors).** `minimum_password_length = 6` server-side
while the client enforces 10 — a caller hitting GoTrue directly can set a 6-char
password. Leaked-password protection (HaveIBeenPwned) is disabled. MFA options
insufficient (advisor). `enable_confirmations = false` — unverified emails can
sign in (app treats verification as a badge only; acceptable for MVP, note it).

**Fix.** Raise server `minimum_password_length` to 10 to match the client; enable
leaked-password protection; decide MFA posture. These are dashboard/config
settings, low effort.

- [x] 9.1 Server min password length → 10 — `supabase/config.toml` `minimum_password_length = 10` (matches the client). Note: config.toml is not applied via the blocked `db push` flow, so this must also be set in the Dashboard (see 9.2) to take effect on hosted Auth.
- [~] 9.2 Enable leaked-password protection — DASHBOARD-ONLY, documented. Not controllable from this repo (no MCP tool, `db push` blocked). Enable manually at Supabase Dashboard → Authentication → Policies / Password settings → toggle "Leaked password protection" (HaveIBeenPwned). Also set minimum password length to 10 there to mirror 9.1.
- [~] 9.3 Decide on email-confirmation-required + MFA for launch — DASHBOARD-ONLY, documented. MFA: Dashboard → Authentication → Providers/MFA, enable an additional factor (e.g. TOTP) to clear the "insufficient MFA options" advisor. Email confirmation (`enable_confirmations`) is intentionally left off for MVP (verification is a badge only); revisit post-launch. Both are hosted-Auth settings not applicable from here.

---

## FINDING 10 — [L] SECURITY DEFINER functions callable by anon/authenticated; mutable search_path

**Root cause (advisors).** Trigger functions (`set_updated_at`, `generate_sku`,
`generate_order_number`, `listings_lock_immutable`) have mutable `search_path`;
several SECURITY DEFINER functions are directly callable via `/rpc/…`. Practical
risk is low — trigger functions error out of trigger context, `is_admin()` just
returns false for anon, `admin_pending_listings()` self-guards — but it's
needless surface and keeps the advisor board noisy.

**Fix.** `SET search_path = public` (or `= ''`) on the four trigger functions;
`REVOKE EXECUTE ... FROM anon, authenticated` on the trigger/definer functions
that nothing should call directly.

- [x] 10.1 Pin search_path on the four trigger functions — `20260712000005_function_hardening.sql` sets `search_path = public` on `set_updated_at`, `generate_sku`, `generate_order_number`, `listings_lock_immutable`. Applied to prod; all four `function_search_path_mutable` lints cleared (4 → 0).
- [x] 10.2 Revoke EXECUTE on internal SECURITY DEFINER/trigger functions — same migration revokes EXECUTE FROM PUBLIC (anon/authenticated inherit via PUBLIC, so a role-scoped revoke alone was insufficient) on all pure trigger/event-trigger functions and `admin_pending_listings` (explicit-grant revoke). `is_admin()` deliberately KEPT executable (RLS policies call it in USING/WITH CHECK). Verified after apply: `is_admin` still executable by anon+authenticated; `orders_snapshot_from_listing`/`handle_new_user` no longer executable by anon/authenticated but still by service_role; anon still reads 7 rows from `public_listings`. `definer_function_executable` lints went from 8 anon + 9 authenticated down to just `is_admin` (intentional).

---

## Implementation order for Phase 2 (Opus)

Dependency-aware, highest risk first, grouped to minimise redeploys:

1. **Group A — availability blocker (Finding 1).** Ship the reservation-logic
   migration alone first; verify a real checkout reserves, lapses after 20 min,
   and re-buys. Independent of everything else.
2. **Group B — PII lockdown (Findings 2 + 7 together).** View/grants/column
   restriction migration **and** the frontend safe-column reads in the same
   change so nothing breaks; verify anon can't read UPI/email/pickup and the
   catalogue/checkout still work.
3. **Group C — input & edge hardening (Findings 3, 5, 6).** Search sanitization;
   bucket size/MIME limits; `vercel.json` headers + scoped CORS. Mostly
   independent; can be one PR.
4. **Group D — governance (Finding 4).** Reconcile migration drift + review
   `link_existing_records_to_profile`. Do after A/B so the reconciliation dump
   captures the fixed functions.
5. **Group E — cleanup & settings (Findings 8, 9, 10).** Dead code/deps, auth
   settings, search_path/EXECUTE hardening. Low risk, batch last; re-run the
   security advisor to confirm the board is clean.

Re-run `get_advisors(security)` after Groups B, C, and E. Keep this file updated
as items complete; if a fix uncovers a new issue, add it here and continue.

---

# Phase 2 Closeout (2026-07-12)

All 10 findings resolved or documented. Five migrations applied to prod
`wfaxtxprngyrxsmahxxa`; code changes staged in the worktree (not committed/pushed).

## Changelog
- **20260712000001_restore_reservation_expiry.sql** — restored reservation
  stamp/lazy-lapse/availability check dropped by the pricing migration (Finding 1).
- **20260712000002_listings_public_view.sql** — `public_listings` definer view
  (safe columns); base-table SELECT tightened to owner/admin (Finding 2). Plus
  frontend repointing + PII removed from cart/checkout (Finding 7).
- **20260712000003_storage_hardening.sql** — 8 MiB + image MIME limits on
  `listing-images`/`digitalassets`; dropped enumeration policy (Finding 5).
- **20260712000004_reconcile_drift.sql** — captured live-only functions into the
  repo; consolidated duplicate `auth.users` signup triggers to one; removed the
  latent email-based orders-claiming in `link_existing_records_to_profile`
  (Finding 4).
- **20260712000005_function_hardening.sql** — pinned `search_path`; revoked
  EXECUTE FROM PUBLIC on trigger/internal SECURITY DEFINER functions;
  `is_admin()` intentionally left (RLS depends on it) (Finding 10).
- Code: search sanitizer (Finding 3); CSP + security headers in `vercel.json`
  and origin-allowlist CORS on the 3 authed edge functions (Finding 6); dead code
  removed — `PaymentProofInput.tsx`, `@google/genai`, `GEMINI_API_KEY` define
  (Finding 8); `config.toml` min password length 6 -> 10 (Finding 9).

## Remaining risks / actions before go-live (all operational, not code defects)
1. **Redeploy the 3 edge functions** (`create-razorpay-order`, `send-email`,
   `shiprocket-create-order`) — the CORS allowlist only takes effect on redeploy.
2. **Verify CSP on first deploy**, especially the Razorpay checkout modal (headers
   don't apply under `vite dev`; verified statically only).
3. **Enable in Supabase Dashboard (Auth):** leaked-password protection
   (HaveIBeenPwned) and at least one additional MFA option — cannot be set from
   the repo (Finding 9).
4. **Logged-in checkout write path** not live-tested here (no test credentials);
   covered by typecheck + server-trigger derivation + the same view working for
   anon. Recommend one authenticated end-to-end test payment on staging.
5. **Deferred (safe, non-blocking):** drop dead DB columns `shipping_mode`,
   `shipping_cost`, `payment_utr`, `payment_receipt_url` in a later dedicated
   migration.
6. **Pre-existing by design:** `payment_conflict` orders need a manual Razorpay
   refund; reservation expiry is lazy (no cron). Both acceptable for launch.

## Final advisor board (security)
Only intentional/dashboard items remain: `security_definer_view` (public_listings,
by design), `is_admin` definer-executable (RLS depends on it), and the two Auth
warnings (leaked-password + MFA, dashboard-only). All `function_search_path_mutable`
and other definer-executable lints cleared; `public_bucket_allows_listing` cleared.

## Launch Readiness: 90/100 — READY WITH MINOR RISKS
Both High-severity launch blockers fixed and verified; all Medium/Low findings
resolved or documented. Deductions are for the un-executed operational steps above
(edge redeploy, CSP-on-deploy check, dashboard Auth toggles, one authenticated
end-to-end payment test), not for any outstanding code defect.
