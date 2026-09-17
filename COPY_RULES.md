# Copy rules

The single reference for how zarketplace describes itself. Read this before
writing any user-facing text, code comment, variable name, or document.

`BrandKit.md` governs **design only** - typography, spacing, colour, layout,
component styling, tone of voice. It says nothing about how the business works,
and it must never regain business-model language. Anything about the
transaction, the money, or the legal structure lives here.

---

## The model, in one line

zarketplace is a **principal reseller**, not a marketplace. We buy items from
individuals ("vendors") and resell them under our own GSTIN.

```
Vendor  ->  zarketplace  ->  Buyer
```

Two separate transactions. Never one facilitated sale.

**A vendor never sets a price.** They send us the item and we come back with a
locked acquisition offer in rupees, which they accept or decline. That number is
fixed before any resale price exists, and it never changes.

A vendor naming a price is the single behaviour that makes us look like an agent
rather than a principal, so "asking price" is banned outright: not on the form,
not in copy, not in a variable name. See MODEL.md §2, hard rule 1.

The item stays with the vendor while it is listed. The buyer pays zarketplace in
full; we then send a prepaid label, collect from the vendor's door, check the
item at our hub, accept it into inventory, pay the vendor their locked price,
repack it and ship it to the buyer from our own address.

---

## Banned words

Never in user-facing copy, code comments, variable names, or generated
documents.

| Banned | Use instead |
| --- | --- |
| fee, fees | (nothing - a retail price is not itemised) |
| commission, cut, take rate | acquisition price, offer, payout |
| percentage, percent, `%` | a rupee amount |
| marketplace fee | acquisition price |
| "sold by [name]" | "Sold & shipped by zarketplace" |
| "your sale" | "your item" |
| "your buyer" | "your item" |
| "connect buyers and sellers" | "zarketplace buys and resells" |
| seller (in new code) | vendor |
| asking price, "what you want for it" | the offer, the acquisition price |
| "name your price", "set your price" | "we make you an offer" |

**Vendor economics are expressed only as rupee amounts.** Never as a
percentage, not even internally in code a user could see.

---

## The five hard rules

Breaking any of these breaks the legal basis of the business.

1. **No split payments.** No Razorpay Route, ever. The buyer's payment and the
   vendor's payout are independent money movements with different triggers and
   different timing. The buyer's payment goes 100% into zarketplace's own
   account. A payout is triggered by us accepting an item at the hub, never by
   a buyer paying.
2. **Vendor identity never reaches buyers.** No vendor names, profiles, pages
   or ratings on any buyer-facing surface.
3. **No buyer/vendor communication channel** of any kind.
4. **A vendor never sees, approves, or is told the resale price.** They see one
   number: their own locked payout.
5. **Every buyer-facing surface says "Sold & shipped by zarketplace."**

---

## Writing for each side

**To a buyer.** You are buying from one company, with one address and one
standard. Frame positively around what the buyer gets - every piece received,
checked and repacked by us before it ships. Never disparage individuals or
small sellers, and never imply the buyer is being protected *from* anyone.

**To a vendor.** Lead with the payout proposition: *"Tell us about your item.
We'll make you an offer."* Never invite them to name a figure: "what you want
for it" is in the banned list above, and it used to sit right here as the
recommended line. They are not becoming a seller and they are not running a
shop. They are selling us one item for a fixed rupee amount they agreed to in
advance.

**The vendor never "lists".** We list the item, because we sell it. So:

| Not | But |
| --- | --- |
| "your listing", "withdraw the listing" | "your item", "withdraw your item" |
| "when you listed it" | "when you accepted our offer" |
| "List it again" | "Send it to us again" |
| "Agree and list it" | "Accept this offer" |
| "if it doesn't sell" | "if we haven't sold it" |

---

## Pending

- **Fold the buyer-protection amount into the item price.** A retailer does not
  itemise a protection charge - the price is the price. Deferred to the backend
  pass; the copy pass only renamed the line item.
- **Rename schema-bound identifiers to `vendor`.** `seller_id`, the `sellers`
  table, `buyer_protection_*` columns and the email template filenames still
  carry the old word. Deferred to the backend pass. Rule: all *new* code uses
  `vendor`.
