# End-to-end dry run

A phone-friendly checklist for the first real transaction. Read the readiness
section first: **the happy path cannot complete today.**

---

# Readiness

## Blocking

**1. There is no inbound leg. The shipping code still ships vendor → buyer.**

`shiprocket-create-order` registers a Shiprocket pickup location at the
**vendor's address** and books delivery to the **buyer's address**. One leg,
direct, no hub. It is the old P2P shipping and it was never rewritten — that
work is Prompt 5, which has not been run.

Consequences if used as-is:

- the item never reaches the hub, so the match check never happens
- the vendor's address is the dispatch origin on the label and on tracking,
  which exposes vendor identity to the buyer
- nothing writes a `shipments` row, so `picked_up_at` is never set, so NO_SHIP
  cannot fire and the ship-by reminder cannot fire
- `hub_queue` never populates, so the hub console has nothing to work on

Steps 5, 6 and 8 of the walkthrough are blocked. Steps 1–4 and 7 work.

**2. Razorpay live-vs-test is unverified.** `RAZORPAY_KEY_ID` is set; its value
is not readable and its digest reveals nothing. Check before spending money:
open checkout, and the Razorpay modal shows the mode. A `rzp_test_` key means
step 4 moves no real money.

## Not blocking, but not ready

**3. `REMOVE_BG_API_KEY` is not set.** Background removal is inert. It fails
open — photos upload unchanged and nothing is blocked. Confirmed still off.

**4. The dispatch secret has not been rotated.** The digest on the deployed
function still matches the value generated during the build session, so it is
in that transcript and in `internal_config`. Rotate before the run:

```bash
NEW=$(openssl rand -hex 32)
supabase secrets set DISPATCH_SECRET="$NEW" --project-ref wfaxtxprngyrxsmahxxa
# then update internal_config.dispatch_secret to the same value
```

**5. Your own account is an admin.** `bhagyamtiwari@proton.me` has
`is_admin = true` and is already a vendor. Running the vendor half as yourself
tests nothing about isolation: an admin sees the resale price, the spread and
the hub queue. **Use a second, non-admin account as the vendor** — the gmail
account is non-admin and works.

**6. Vendor emails do not write to `email_log`.** They are recorded in
`vendor_notifications` with status and error, which is better, but the two
observability surfaces are now separate. Check both.

## Verified working

- **Email delivery pipeline.** A real notification was enqueued, drained,
  accepted by Resend, and marked `sent`. Historical `email_log` shows 40
  successful sends, so the sending domain is live. **You still need to confirm
  the message landed in the proton.me inbox** — acceptance by Resend is not
  delivery.
- **Cron.** All four jobs active. The dispatcher ran unattended at 19:45 UTC
  and succeeded, so pg_cron → pg_net → edge function works end to end.
- **Vendor listing submission.** Listing insert and acquisition insert both
  succeed from a real authenticated vendor session.
- **Vendor isolation, from a genuine non-admin session.** Sees their own offer
  amount; zero rows visible in the internal `acquisitions` table; cannot read
  `expected_resale`; cannot see another vendor's offer; `hub_queue` empty.
- **Shiprocket credentials are present.** Whether they authenticate is untested
  — the only code path that would prove it is the wrong one (see blocker 1).

---

# Before you start

- [ ] Rotate the dispatch secret (item 4)
- [ ] Confirm Razorpay mode (item 2)
- [ ] Sign in as the **non-admin** account on the phone; keep admin in a
      separate browser or a private window
- [ ] Confirm the pre-flight email landed in proton.me
- [ ] Have a real item to hand, and a card you are willing to charge
- [ ] Note the start time. Each step below has a time box to fill in.

Record for each step: **start**, **end**, **anything that surprised you**.

---

# Part 1 — happy path

## Step 1 · Submit an item as a vendor  ⏱ ____ → ____

On the phone, signed in as the non-admin account, at `/sell`.

- [ ] Photo guidance shows before the camera: lay flat, natural light, no
      mirror shots
- [ ] Upload 2–3 real photos. They upload unchanged (background removal off)
- [ ] Fill in details, set an asking price
- [ ] Submit

**Expect:** "We will come back within 24 hours". No listing is live.
**State:** `lifecycle_state = LISTED`, `offer_status = pending_pricing`
**Email:** none. Submission is not acknowledged by email — worth noting whether
that feels like a gap when you are the one waiting.
**Check:** the item shows under My Items as *With us*.

## Step 2 · Triage and make an offer  ⏱ ____ → ____

Admin browser, `/admin` → Listings → Pending Approval.

**This is throughput-capping step one. Time it honestly, including how long you
spend deciding the number.**

- [ ] The item shows a **Waiting** column with hours since submission
- [ ] Open it. The Acquisition panel shows what the vendor asked
- [ ] Enter an expected resale. The model's suggested payout appears beside the
      offer box
- [ ] Type the offer you actually want to make
- [ ] Send

**State:** `offer_status = offered`, amount locked
**Email:** *Your offer: Rs. X · <item>* — one number, no working, no resale price
**Check:** open that email and confirm it names no buyer, no percentage, and
nothing about what you plan to sell it for.

## Step 3 · Accept the offer as the vendor  ⏱ ____ → ____

Phone, `/vendor-portal`.

- [ ] "One item needs you" callout appears
- [ ] Offer screen shows **one rupee amount** and nothing else. No breakdown,
      no resale price, no expandable detail
- [ ] Accept → agreement screen, three separate tick boxes, none pre-ticked
- [ ] Tick all three, agree

**State:** `offer_status = accepted`, `ship_by_days` snapshotted (5)
**Check:** `ship_by_deadline` is still **null** — the clock starts at the sale,
not here. Then approve the listing in admin so it goes live.

## Step 4 · Buy it yourself  ⏱ ____ → ____

Different browser or a private window, signed in as a **third** account if you
have one, otherwise the admin account.

- [ ] Product page says **Sold & shipped by zarketplace**
- [ ] No vendor name, no seller rating, no message-seller
- [ ] Check out with a real card

**State:** `lifecycle_state = SOLD`, `ship_by_deadline` set to +5 days
**Emails:** buyer order confirmation; vendor *Time to post your item · by
<date>*
**Check:** the vendor email states the exact date. Confirm the buyer's emails
never mention a vendor.

## Step 5 · Inbound label  ⏱ ____ → ____

> **BLOCKED.** Nothing generates a vendor → hub label. Do not press the
> existing "Book Pickup (Shiprocket)" button in admin: it books a shipment from
> the vendor's address to the buyer's address, which skips the hub and puts the
> vendor's address on the buyer's parcel.

To carry on and test the rest, simulate:

```sql
INSERT INTO public.shipments (listing_id, leg, status, awb, courier)
VALUES ('<listing-id>', 'INBOUND', 'label_issued', 'TEST-AWB-1', 'Manual');
```

**Email:** *Your label is ready* fires on that insert. Confirm it arrives.

## Step 6 · Post it, or simulate the pickup scan  ⏱ ____ → ____

Real post to the hub if you can. Otherwise:

```sql
UPDATE public.shipments SET status='picked_up', picked_up_at=now()
 WHERE listing_id='<listing-id>' AND leg='INBOUND';
```

**Check:** with `picked_up_at` set, the NO_SHIP sweep must ignore this item.
Optionally verify by setting `ship_by_deadline` into the past and running
`SELECT public.sweep_no_ship();` — it should return 0.

## Step 7 · Receive, accept, pay  ⏱ ____ → ____

Admin, `/hub`.

**This is throughput-capping step two. Time the check itself, not the clicks.**

- [ ] Item appears under **Coming in**
- [ ] Press **Received**, with a hub note
- [ ] It moves to **On the bench**
- [ ] Press **Accept into inventory** — confirm dialog names the payout
- [ ] A payout appears, status **due**
- [ ] Press **Pay Rs. X**, then confirm you have actually sent the money

**State:** `ACCEPTED` → `PAYOUT_SENT`, `intake_status = paid`
**Emails:** *We have your item* · *Accepted · Rs. X on its way* · *Rs. X sent*
**Check:** the payout was raised by acceptance, with no reference to the
buyer's payment anywhere on the record.

## Step 8 · Repack and ship out  ⏱ ____ → ____

> **PARTIALLY BLOCKED.** The lifecycle steps work; the outbound label does not
> come from the hub address.

- [ ] Press **Repacked**
- [ ] Press **Shipped to buyer**

Post it yourself for the dry run. The existing Shiprocket call would use the
vendor's registered pickup location, not the hub.

## Step 9 · Delivery  ⏱ ____ → ____

- [ ] Press **Delivered** in the hub
- [ ] Buyer tracking shows delivery and never mentions the inbound leg

**State:** `DELIVERED` — terminal.

---

# Part 2 — failure path (second item)

Run steps 1–4 again with a second real item and a second real payment, then:

## Step 10 · Refuse at the hub  ⏱ ____ → ____

- [ ] Receive it
- [ ] Press **Refuse**, choose Condition or Authenticity, write what was wrong
- [ ] Confirm

**State:** `FAILED`, `intake_status = not_accepted`, listing archived,
**no payout raised**
**Email:** *We could not accept your item* — states the reason, offers the
return at vendor cost, and names the exact 60-day date
**Check:** vendor trust score dropped. Condition −20, authenticity −60.

## Step 11 · Refund the buyer  ⏱ ____ → ____

- [ ] `/hub` → **Refunds due**. The item is listed with hours waiting
- [ ] Press **Refund buyer**
- [ ] Confirm the money actually returns to the card (Razorpay dashboard, then
      the statement)

**Check:** the item was **not** relisted. The buyer's message says only that the
item is no longer available and they have been refunded in full — no vendor,
no reason, no third party.

## Step 12 · Abandonment clock  ⏱ ____ → ____

- [ ] As the vendor, ask for the item back. `return_shipping_paid_by = vendor`
- [ ] Try to dispose of it in `/hub` → **Holding**. It should refuse: the
      60-day window has not closed

Optionally test the reminders by moving the deadline:

```sql
UPDATE public.fulfillment_failures
   SET abandonment_deadline = now() + interval '29 days' WHERE id = '<failure-id>';
SELECT public.sweep_abandonment_reminders();   -- expect the 30-day email
```

---

# What to record

| Step | Minutes | Notes |
| --- | --- | --- |
| 2 · Triage | | the number that caps supply |
| 7 · Hub receive + accept | | the other one |
| 1, 3, 4 | | vendor and buyer friction |
| 10, 11 | | failure handling |

At roughly 40 triages a day per person, step 2 sets the ceiling on listings.
Step 7 sets the ceiling on completed transactions. Everything else scales.

# If something breaks

Do not fix it mid-run. Note the step, the exact wording, and what you expected.
A dry run that surfaces five real defects is a success.

Where to look:
- `vendor_notifications` — status, attempts, last_error, per email
- `lifecycle_events` — every state change with who and when
- `pending_refunds` — anything owed to a buyer
- `cron.job_run_details` — whether the sweeps ran
