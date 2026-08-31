# End-to-end dry run

A phone-friendly checklist for the first real transaction. Read the readiness
section first: **the happy path cannot complete today.**

---

# Readiness

## Blocking

**1. The hub address is not set.** `hub_location` exists with one empty row.
Until it has a real address, the outbound leg cannot be booked and the inbound
leg has nowhere to be delivered. Set it before the run:

```sql
UPDATE public.hub_location SET
  contact_name = 'zarketplace', phone = '<10 digits>',
  address = '<hub street>', address_2 = '<area>',
  city = '<city>', state = '<state>', pincode = '<pincode>'
WHERE id = 1;
```

The first outbound booking registers it with Shiprocket automatically and
stamps `registered_at`.

**2. Razorpay live-vs-test is unverified.** Unchanged. Check the mode in the
Razorpay modal at checkout before spending money.

**3. Shiprocket credentials are unproven.** They are set but have never
authenticated successfully in this codebase. The first booking either works or
returns a 502 naming the failure. Book the inbound leg on a cheap item first.

## Not blocking, but not ready

**4. `REMOVE_BG_API_KEY` is not set.** Background removal is inert. It fails
open — photos upload unchanged and nothing is blocked. Confirmed still off.

**5. The dispatch secret has not been rotated.** The digest on the deployed
function still matches the value generated during the build session, so it is
in that transcript and in `internal_config`. Rotate before the run:

```bash
NEW=$(openssl rand -hex 32)
supabase secrets set DISPATCH_SECRET="$NEW" --project-ref wfaxtxprngyrxsmahxxa
# then update internal_config.dispatch_secret to the same value
```

**6. Your own account is an admin.** `bhagyamtiwari@proton.me` has
`is_admin = true` and is already a vendor. Running the vendor half as yourself
tests nothing about isolation: an admin sees the resale price, the spread and
the hub queue. **Use a second, non-admin account as the vendor** — the gmail
account is non-admin and works.

**7. Vendor emails do not write to `email_log`.** They are recorded in
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

The inbound leg books itself the moment the payment webhook fires. Nothing to
press unless it failed.

- [ ] In `/hub` → **Coming in**, the item shows an AWB and a courier
- [ ] If it does not, press **Book inbound leg** on the card

**State:** `LABEL_ISSUED`, a `shipments` row with `leg = INBOUND`
**Email:** *Your label is ready* — courier and tracking number, and the ship-by
date again
**Check the label itself.** The consignor is the vendor's address and the
consignee is the hub. That is correct for this leg and only this leg.

## Step 6 · Post it  ⏱ ____ → ____

Real post. Hand the parcel to the courier, or drop it at the pickup point.

- [ ] Courier collects, or you drop off
- [ ] Within a few hours the scan lands and the item moves to **PICKED_UP**

**Check:** `picked_up_at` is set on the inbound shipment. This is the field
NO_SHIP and the 48-hour reminder both key off, and it was never being written
before this build.

If the courier is slow to scan and you want to carry on:

```sql
SELECT public.record_pickup_scan('<inbound-awb>');
```

That is the same function the courier webhook calls, so it exercises the real
path rather than faking the state.

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

- [ ] Press **Repacked**
- [ ] Press **Book outbound leg**. It is refused until the item has been
      accepted — worth trying it earlier once, to see the refusal
- [ ] Press **Shipped to buyer**

**State:** `REPACKED` → `SHIPPED_OUTBOUND`, a `shipments` row with
`leg = OUTBOUND`
**Check the outbound label. This is the single most important check in the
run.** The consignor must be the hub address. The vendor's name, street, city
and pincode must appear nowhere on it, and nowhere in the buyer's tracking.
A unit test asserts this on the payload; the label is the thing that proves it.

## Step 9 · Delivery  ⏱ ____ → ____

- [ ] Press **Delivered** in the hub
- [ ] Buyer tracking shows: Received at zarketplace → Checked & repacked →
      Shipped to you → delivered
- [ ] The inbound leg appears nowhere, and neither does an origin

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

---

# What still needs simulating

Only two things, and neither is a gap in the product.

**1. A slow courier scan.** If the pickup scan has not landed when you want to
carry on, call `record_pickup_scan('<awb>')`. That is the same function the
courier webhook calls, so the path is real — you are standing in for the
courier's timing, not for our code.

**2. The abandonment reminders.** The 30-day and 7-day emails fire off a date
60 days out. Move `abandonment_deadline` and run
`sweep_abandonment_reminders()`. Time is the only thing being faked.

Everything else in the run is now real: both labels are genuine Shiprocket
bookings, the pickup scan comes from the courier webhook, the payment is a real
capture and the refund a real reversal.

**Deliberately not simulated: NO_SHIP.** Testing it for real means letting a
ship-by deadline lapse with a parcel you have not posted, five days of waiting
and a real refund to yourself. The behaviour is asserted in SQL — it fires for
an item with no pickup scan and does not fire for one with a scan, verified on
the live database. Watch for it in production instead.
