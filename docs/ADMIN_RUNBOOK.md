# zarketplace admin runbook

**If _____, do _____.** Everything below is done in the admin console at `/admin`.
Every action writes an audit row (System → Audit Logs): who, when, before, after, why.

---

## The daily loop (5 minutes)

Open **Overview**. It shows six numbers that each mean "someone is waiting on you":

| Number | Means | Go to |
|---|---|---|
| Pending listings | Sellers waiting for approval | Listings → Pending Approval |
| To verify | Payment needs confirming | Orders → Awaiting Verification |
| To book pickup | Auto-booking did not happen | Shiprocket → Pickup Queue |
| Open claims | A buyer raised a problem | Support → Open Claims |
| Payouts due | Sellers owed money now | Payouts → Processing |
| Shipping failures | Parcel stuck, RTO, or failed delivery | Shiprocket → Failed / RTO / NDR |
| No pickup address | Live listing that can never ship | Listings → Missing Pickup Address |

If all seven are zero, there is nothing to do.

---

## Listings

**If a new listing needs review**
Listings → Pending Approval → click the row → check photos, condition, authenticity, price → **Approve** or **Reject**.
Approving emails the seller "your listing is live". Rejecting does not email them, so message them separately if the reason matters.

**If a listing has no pickup address**
Listings → Missing Pickup Address. These can never be shipped: booking fails after the buyer has already paid.
Ask the seller to edit the listing and add it. You cannot approve a listing without one (the database blocks it).

**If a listing is wrong, fake, or the seller went quiet**
Open it → **Suspend** (temporary, reversible) or **Archive** (retire it) or **Delete** (permanent; existing orders keep their record).
Use Suspend when you expect it to come back. Use Reject at moderation time.

**If a rejected listing should have been approved**
Listings → Rejected → open it → **Approve**. It goes live immediately.

---

## Orders and payments

**If a payment is stuck at "awaiting verification"**
Check Razorpay for the payment first. If Razorpay shows it captured, open the order → **Mark Paid**.
If Razorpay shows nothing, leave it. The buyer was not charged and can retry.

**If the buyer says they paid but the order is not paid**
Search their email or order number in the top search bar. Open the order and read **Timeline** + **Emails sent**.
If Razorpay has the payment and we do not, **Mark Paid**. If Razorpay does not, they were not charged.

**If two people paid for the same item ("payment conflict")**
Razorpay → Conflicts. The second buyer's money must go back.
Open the order → **Refund via Razorpay** → give a reason. This refunds them, marks the order refunded, and emails them. Nothing else to do.

**If a buyer wants to cancel or wants a refund**
Open the order → **Refund via Razorpay**. This refunds the full amount, relists the item, voids any unpaid payout, and emails the buyer.
If the order was never paid, the button reads **Cancel & relist** instead. Same idea, no money moves.

**If the seller cannot fulfil an order**
Same as above: **Refund via Razorpay**, reason "seller could not fulfil". The listing goes back on sale automatically; the seller is emailed.
If they do this repeatedly, Users → find them → **Flag**.

**If a payment failed**
Nothing to do. The buyer was not charged, keeps the retry link, and the item stays reserved for 20 minutes.

---

## Shipping

**If an order is paid but no pickup was booked**
Shiprocket → Pickup Queue. Booking normally happens automatically the moment payment lands.
Open the order → **Book Pickup (Shiprocket)**. If it errors, read the message:
- "missing pickup address" → the seller's address is incomplete; get it fixed, then rebook.
- Shiprocket auth or KYC error → fix in the Shiprocket dashboard, then rebook.
- Anything else → book manually in Shiprocket, then **Mark Shipped** here.

**If the courier never picked up**
Check Shiprocket's dashboard for the AWB. Reschedule the pickup there. Our order stays "shipped" and needs no change.

**If the parcel is returning to the seller (RTO)**
Shiprocket → Failed / RTO / NDR. The buyer never got the item, so they must be refunded:
open the order → **Refund via Razorpay**, reason "RTO". Tell the seller their item is coming back.

**If delivery failed / buyer unreachable (NDR)**
Same view. First try: contact the buyer, confirm the address and phone, ask Shiprocket to reattempt.
If it cannot be delivered, refund the buyer as above.

**If the parcel is delivered but our status is wrong**
Open the order → **Mark Delivered**. This starts the 48-hour review window and creates the payout.

---

## Claims and disputes

**If a buyer reports a problem with the item**
Find the order → **Open Claim**. This freezes the seller's payout until you close it.
Then decide:
- Buyer is right → **Refund via Razorpay**.
- Seller is right → **Close Claim**; the payout releases on schedule.
Record the reasoning in **Internal notes** on the order. Future you will need it.

**If a claim comes in after the seller was already paid**
The payout cannot be un-paid from the console. Refund the buyer from Razorpay directly and recover from the seller out of band. Note it on the order.

---

## Payouts

**If a seller is asking where their money is**
Payouts → find the order.
- "Pending" → the 48-hour review window is still open. Tell them the release date shown.
- "Processing" → releasable now; pay it.
- "Paid" → already sent; give them the date.

**If a payout is ready**
Payouts → Processing → send the UPI transfer yourself → then click **Mark Paid**.
Mark Paid only records that you sent it. It does not move money. Never click it before the transfer is actually done.
The seller is emailed the exact amount.

**If the seller offered free shipping**
Their payout is the asking price minus the real shipping cost. The console and their email both show this breakdown. This is intended: they chose to cover shipping.

**If a payout looks wrong**
Payout amount is set at delivery from the order's amount, minus shipping only when the seller offered free shipping. zarketplace takes no fee. If it still looks wrong, do not pay; check the order drawer's Payment and Payout sections first.

---

## Users

**If a seller is suspicious (fake items, no-shows, self-dealing)**
Users → find them → **Flag** (a watch marker) or **Ban** (blocks them).
Buyers cannot buy their own listings; the database blocks it, so you will not see wash sales.

**If someone needs admin access**
Users → find them → **Admin**. Give this to as few people as possible; admins can move money.

---

## When something looks broken

**If an email did not arrive**
System → Email Logs. Find the send.
- "sent" → it left our side; tell them to check spam.
- "failed" → hover for the provider error.
- nothing listed → the trigger never fired; do the action again.

**If you need to know who changed something**
System → Audit Logs. Every admin action, with before and after state and the reason given.

**If you cannot find an order**
Use the search bar at the top. It searches order number, buyer email, seller email, phone, tracking number, AWB, Shiprocket ID, and listing title.

---

## Rules that protect you

These are enforced by the database, not by the interface. You cannot break them by clicking the wrong thing:

- A seller cannot buy their own listing.
- A listing cannot go live without a complete pickup address.
- Two buyers cannot both own one item: the second payment becomes a conflict and is refundable in one click.
- A payout cannot be released before the 48-hour review window closes, or while a claim is open.
- Buyers and sellers cannot change prices, payment fields, or order status.
- A duplicate payment webhook cannot double-charge, double-email, or double-sell.

## What is still manual

- Approving every listing.
- Sending the actual UPI transfer for payouts.
- Deciding claims.
- Rescheduling pickups and chasing RTO/NDR in the Shiprocket dashboard.
