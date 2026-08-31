# DRAFT FOR COUNSEL REVIEW — NOT FOR USE

**Brief to tax counsel**
**Prepared:** 31 August 2026
**From:** zarketplace
**Subject:** Compliant structure for a principal reseller of pre-owned goods
purchased from unregistered individuals

---

## The question we are asking

**We operate as a principal reseller. We buy pre-owned items from unregistered
individuals and resell them under our own GSTIN. What is the compliant
structure?**

We are asking what compliance looks like for the business as it is built. We
are not asking how to avoid any classification, and if the correct answer is
that we are an e-commerce operator with the obligations that follow, we want to
know that plainly so we can implement it.

Nothing in this brief is a settled position. Everything in §5 is open.

---

## 1. One transaction, end to end

A single concrete example, exactly as the system runs it today.

**The parties**

- **Vendor** — an individual resident in Delhi. Not GST-registered. Selling a
  personal item. Not carrying on a business.
- **zarketplace** — GST-registered. Hub in Delhi. Buys and resells pre-owned
  fashion.
- **Buyer** — a consumer in Bangalore, Karnataka. Not registered.

**The sequence**

1. **Day 0.** The Vendor lists a coat and asks for Rs. 5,000.
2. **Day 0.** zarketplace reviews it and offers a fixed **acquisition price of
   Rs. 3,200**. The Vendor accepts. This price is fixed before any resale price
   exists, is not a proportion of anything, and never changes.
3. **Day 1.** zarketplace lists the coat **at its own price, set by it alone**,
   for Rs. 5,400. The Vendor is not told this figure and has no say in it. The
   listing shows zarketplace as the seller. The Vendor is not named anywhere.
4. **Day 6.** The Buyer pays **Rs. 5,400 to zarketplace**, into zarketplace's
   own account. No split, no escrow, no transfer to any third party. A
   zarketplace tax invoice is issued to the Buyer under zarketplace's GSTIN.
5. **Day 6.** zarketplace issues a prepaid courier label at its own cost. The
   coat is collected **from the Vendor's Delhi address** and consigned **to
   zarketplace's Delhi hub**. zarketplace is consignee.
6. **Day 8.** The coat arrives. zarketplace checks it against the listing.
   **This is a match check, not authentication.** It is accepted into
   inventory. **Title and risk pass to zarketplace at this point.**
7. **Day 8.** zarketplace pays the Vendor **Rs. 3,200** from its own funds.
   This payment is triggered by acceptance at the hub. It is not triggered by,
   derived from, or conditional on the Buyer's payment, and it would be made
   even if the Buyer's payment later failed or were refunded.
8. **Day 8.** zarketplace repacks the coat in its own packaging and dispatches
   it **from its Delhi hub to the Buyer in Bangalore**, as consignor under its
   own GSTIN.

**The two legs**

| | Inbound (purchase) | Outbound (sale) |
|---|---|---|
| Supplier | Vendor (unregistered, Delhi) | zarketplace (registered, Delhi) |
| Recipient | zarketplace | Buyer (unregistered, Karnataka) |
| Consideration | Rs. 3,200 | Rs. 5,400 |
| Fixed when | Before listing | At listing, by zarketplace alone |
| Trigger for payment | Hub acceptance | Checkout |
| Movement | Delhi → Delhi | Delhi → Karnataka |

**How the system enforces the separation.** The vendor payout record has no
column that can hold an order, a sale or a payment reference; a payout is
raised by hub acceptance alone. There is no split-payment integration. The
resale price is not readable by a vendor through any interface. These are
structural, not policy — we can demonstrate them.

---

## 2. What we believe we are doing

We buy goods and resell them. We take title, we take the risk of not selling,
we set the resale price alone, and we pay a price we fixed in advance
regardless of what happens next.

## 3. Why we are unsure

The goods never physically sit with us before they are sold. We list an item we
have agreed to buy but do not yet possess, and we only take delivery once a
customer has committed. An adviser could characterise that as facilitating a
sale between two other people, with the purchase and resale as form rather than
substance.

We would rather have this tested now.

## 4. What we have not assumed

- That the GST answer determines the income-tax answer. We treat §194-O as a
  separate question.
- That Rule 32(5) margin valuation is available to us.
- That being a principal for one purpose makes us a principal for all.

---

## 5. Open questions for counsel

**5.1 Section 52 / ECO classification (GST).**
Are we an "electronic commerce operator" owning a platform for electronic
commerce, notwithstanding that we take title? Does TCS under §52 apply? If the
purchase and resale are respected, is there any supply by the Vendor "through"
us at all? What facts would change the answer — for example, listing before
taking possession?

**5.2 Section 194-O (Income Tax) — please analyse separately.**
The definition of an e-commerce operator in §194-O differs from GST. Does it
catch us? If it does while GST does not, what withholding applies to a payment
that we characterise as the purchase price of goods rather than as a payment to
an e-commerce participant?

**5.3 Rule 32(5) — margin scheme, per category.**
Are we a "person dealing in buying and selling of second hand goods"? Is the
inbound purchase from an unregistered individual with no ITC availed? If Rule
32(5) applies, is GST on the margin (Rs. 5,400 − Rs. 3,200 = Rs. 2,200)? Does
availability differ by category — garments, footwear, leather goods, watches,
jewellery? What breaks it: minor repair, cleaning, repacking?

**5.4 Reverse charge on purchases from unregistered vendors.**
Does RCM apply to our purchase from an unregistered individual? Does it matter
that the Vendor is not in business and is selling a personal effect — is that a
"supply in the course or furtherance of business" at all? If it is not a
supply, what documentation should support the purchase?

**5.5 Self-invoicing for the purchase leg.**
Under §31(3)(f) and Rule 46, what document should we raise for a purchase from
an unregistered individual? Content, timing, series. Does the answer change if
RCM does not apply?

**5.6 E-way bill where dispatch origin is the Vendor's address.**
The inbound consignment moves from the Vendor's home to our hub, arranged and
paid for by us, with us as consignee and an unregistered non-business
individual as consignor. Who generates the e-way bill? Does the threshold apply
per consignment? Does an intra-Delhi movement need one? For the outbound leg
Delhi → Karnataka, we assume we generate it as consignor — please confirm.

**5.7 Place of supply, both legs.**
Inbound: Delhi to Delhi, both parties in Delhi — intra-state, if it is a supply
at all. Outbound: our Delhi hub to a Karnataka consumer — we assume §10(1)(a),
IGST on movement terminating in Karnataka. Please confirm both, and tell us
whether the Vendor's location has any bearing on the outbound leg's place of
supply. It should not, on our reading, since the Vendor is not a party to it.

**5.8 Registration and returns.**
Any registration consequence of buying in one state and shipping nationally
from a single hub? Do we need registration anywhere we deliver? How should both
legs be reported in GSTR-1 and GSTR-3B, particularly under Rule 32(5)?

**5.9 Anything we have not asked.**
If there is a question we should be asking and have not, we would rather hear
it now.

---

## 6. What we can provide

- Vendor agreement and buyer terms (drafts accompanying this brief)
- Complete schema showing the two transactions and the absence of any link
  between a vendor payout and a buyer payment
- Sample records for a full transaction end to end
- Payment integration showing a single capture to our own account, no splits

## 7. What we are asking for

1. Whether the structure as described is compliant as a principal-reseller
   model.
2. If not, what specifically would have to change.
3. The correct treatment for each of §5.1–5.8.
4. Whether to seek an advance ruling on Rule 32(5), §52, or both.

We have not launched at volume and can still change the structure. We would
rather change it now than defend it later.
