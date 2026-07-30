# Seller master PDF — script for approval

One document. Three pages. Welcome, onboarding and contact in a single file you
send once on WhatsApp. Replaces the two-document split.

Nothing is built until this is signed off.

---

## Before anything: six things in the draft that the product does not do

These matter more than layout. A guide that teaches sellers vocabulary or
promises features the site doesn't have creates support tickets.

**1. Payouts are not automatic.** The draft says "released automatically." Per
`docs/PAYMENTS.md`, a trigger creates the payout row at delivery, then **a human
pays the UPI and marks it paid**. Corrected below to "released" without
promising machine speed.

**2. The condition names are wrong.** Draft says *New with tags • Like New •
Excellent • Good • Fair*. The form offers **Pristine 5/5 · Great 4/5 · Good 3/5
· Fair 2/5 · As Is 1/5**. A seller taught "Excellent" will hunt for a grade that
isn't there. Using the product's own five, with their numbers.

**3. "Respond quickly to buyers" — there is no way to.** zarketplace has no
buyer-seller messaging. The product page never exposes seller contact details
(there's an explicit comment in `ProductPage.tsx` saying so). That line is cut
and replaced with something a seller can act on.

**4. No "original retail price" or "material" field exists.** The form takes
brand, category, gender, size, condition, description, price, sale price. Those
two go in the description, and the copy says so rather than implying a field.

**5. Listings cannot be edited.** Delete and relist. Carried over from the last
script; still true.

**6. Emoji.** ✅ ❌ ✔ ☐ 🎉 all become brand marks: filled black circle with a
white tick, hairline square with a cross, hairline empty square for checkboxes.
BrandKit bans emoji outright.

---

## What else should be in it

Your draft is missing the things sellers actually get wrong.

**The 72-hour pickup deadline.** Not mentioned anywhere in the draft, and it is
the single biggest failure point after listing. Gets its own callout on page 1
and a line in the timeline.

**The price floor.** New rule, now live: a listing cannot be priced below its
shipping category rate, because below that the seller earns nothing. Sellers
need to know before they hit the wall.

**Shipping rates, itemised.** Rs. 79 to Rs. 149 by category, buyer-paid. Sellers
ask this constantly.

**Every listing is reviewed before it goes live.** Sets the expectation that
publishing is not instant.

**UPI ID and Instagram lock on submit.** Cannot be changed after. Worth one line
before someone types the wrong handle.

**What happens if it doesn't sell.** Your "tips to sell faster" covers it, and
the Seller Tools Instagram image is the real answer.

---

## Type scale and graphic devices

Same system as the site, so the print piece and the product read as one brand.

| Register | Spec | Used for |
|---|---|---|
| Display | Arial Black, uppercase, tight tracking, 26–34pt | Cover headline, "100%", page openers |
| Serif whisper | Didot italic, lowercase, 16–24pt | One line per page, max |
| Section label | Arial Black, uppercase, 9pt, 2.5 tracking, hairline rule under | "1. BEFORE YOU SHOOT" |
| Sub-label | Arial Black, uppercase, 8pt, 1.4 tracking | Card titles, step names |
| Body | Arial, uppercase, 8.3pt, 0.55 tracking, 1.5 leading | Everything else |
| Micro | Arial Bold, uppercase, 6.5pt, 0.9 tracking | Captions, footnotes |

**Devices, and only these.** No arrows between boxes, no organic shapes, no
drop shadows, no colour.

- **Hairline rule** under every section label. 0.6pt at 12% black.
- **Numbered black circle**, 8pt radius, white numeral. Steps only.
- **Hairline card**, sharp corners, 0.7pt border. Groups related lines.
- **Solid black block**, full width. Reserved for the three moments that matter:
  the money, the payout timeline, the help panel.
- **Tick mark**: filled black circle, white tick. **Cross mark**: hairline
  square, thin cross. **Checkbox**: hairline square, empty.
- **Rail**: for the timeline, a single hairline running behind evenly spaced
  dots. This replaces arrows. Arrows between six steps at this width turn into
  visual noise, which is what you flagged before. Say the word and I'll swap in
  a thin chevron instead.
- **Photo slot**: dashed frame with its number and subject printed inside, until
  you send the image.

Colour: black, white, and one grey that is just black at 58%. The only colour
anywhere is inside your photographs.

---

# PAGE 1 — Welcome, how it works, the money

**MASTHEAD** — black band. Wordmark left. `SELLER GUIDE` and `1 OF 3` right.

**COVER BAND** — `SLOT 01`, full width × 150pt, dark scrim, type over it.

> ## WELCOME TO SELLING
> *sell your clothes. keep 100%.*
>
> Everything you need, once. Keep this handy.

**FOUR PROMISES** — one row, four columns, hairline card each.

| No selling fees | You keep 100% | Buyer pays shipping | We handle the rest |
|---|---|---|---|
| We take 0%. Not a launch offer. | Your asking price is your payout. | And the Buyer Protection fee. | Payments, pickup, delivery. |

**THE TIMELINE** — full-width black block. Six dots on a hairline rail.

`LISTED` → `SOLD` → `PICKED UP` → `IN TRANSIT` → `DELIVERED` → `PAID`

Under the rail, three timing markers only where they matter:
*Reviewed before it goes live* · *You have 72 hours to hand it off* ·
*48-hour review, then payout*

**THE 72-HOUR RULE** — hairline card, full width, the one deadline that bites.

> You have **72 hours** from the moment an item sells to pack it and hand it to
> the courier. We book and pay for the pickup. Miss it repeatedly and you lose
> selling access.

**THE MONEY** — split. Black block left, rate table right.

Left: **100%** · No listing fees. No selling fees. No hidden commissions. The
only deduction is shipping, and only if you switched on free shipping.

Right: **Buyer pays shipping at checkout**
Accessories & small items Rs. 79 · T-shirts & tops Rs. 80 · Jeans & bottoms
Rs. 99 · Footwear Rs. 129 · Jackets & heavy items Rs. 149

Footnote: *Your price cannot be lower than the shipping rate for its category.
Below that you earn nothing, so the form won't accept it.*

*Footer: Page 1 of 3 · How it works*

---

# PAGE 2 — List it well

**MASTHEAD** — `2 OF 3`

**1. BEFORE YOU SHOOT** — four ticks, two columns.

Wash or steam it · Empty every pocket · Lace shoes neatly · Include the original
box, dust bag or spare buttons if you have them

> Small things. They show up in the photos and in the price you get.

**2. THE PHOTO STRIP** — six numbered frames in one row, 3:4 each.

`SLOT 02` FRONT · `SLOT 03` BACK · `SLOT 04` TAG · `SLOT 05` CLOSE-UP ·
`SLOT 06` FLAW · `SLOT 07` ON-BODY

Front and back marked REQUIRED. On-body marked OPTIONAL. Shoot all six on one
real garment so the row reads as a single worked example.

**USE / AVOID** — two columns, ticks left, crosses right.

*Use:* natural daylight · clean uncluttered background · shot straight on · the
whole item in frame · front and back · close-ups of tags, labels and logos ·
every flaw, honestly

*Avoid:* screenshots · stock photos · heavy filters · dark rooms · cluttered
mirror shots · blurry frames · angles that hide damage

**PRO TIPS** — hairline card, two stacked lines, each with a small label.

> **CLEANER PHOTOS** — PhotoRoom or remove.bg will strip a messy background for
> free. A plain white backdrop makes a phone photo look shot for a catalogue.
>
> **CAN'T WRITE THE DESCRIPTION?** — Open ChatGPT, upload your photo, and ask it
> for a zarketplace listing description. Read what it gives you and fix anything
> that isn't true of your item. It writes the words, you own the accuracy.

**3. GOOD LISTING, BAD LISTING** — two slots side by side, 1:1, captioned.

`SLOT 08` **This sells** — lit, straight on, plain background, whole garment.
`SLOT 09` **This doesn't** — dim, cluttered, cropped, filtered.

The most useful thing in the document. A seller who sees the difference once
shoots better forever.

**4. SHOW EVERYTHING** — chips in a row, then one line.

Brand · Category · Size · Colour · Condition

> Material and original retail price are worth adding too. There's no field for
> them, so put them in the description. Any flaw, stain, fading or loose
> stitching goes in the photos **and** the description. Both.

**5. PRICE IT** — three short lines.

Free shipping is off unless you turn it on. It sells better, but the courier
cost comes out of your payout, so it's your call per item.

Search similar items before you decide · Unsure? Start slightly higher, you can
always come down · Realistic prices sell far faster

**6. ONE LISTING = ONE ITEM** — hairline card, ticks and crosses.

*Yes:* one hoodie · one jacket · one pair of sneakers
*No:* "multiple colours available" · "all sizes available" · "DM before buying"
· several unrelated items in one listing

> Own five identical tees? Five listings. The form rejects bundle phrasing
> automatically.

*Footer: Page 2 of 3 · Listing well*

---

# PAGE 3 — After the sale, standards, help

**MASTHEAD** — `3 OF 3`

**AFTER IT SELLS** — four numbered steps, one row.

1. **We notify you** — Straight away.
2. **Pack it** — The exact item, clean, with everything shown in the listing.
3. **We collect** — Doorstep pickup, booked and paid by us.
4. **Track it** — Seller Portal, then Sales.

**PACKAGING** — three slots, 4:3, plus three lines.

`SLOT 10` Folded · `SLOT 11` Wrapped · `SLOT 12` Sealed and ready

> Any clean, secure packaging is fine. A courier bag, a box, recycled packaging
> — as long as it protects the item. Pack shoes and accessories so nothing gets
> crushed in transit.

**PAYOUTS** — black block, two columns.

*Held until both are true:* the buyer has received the item · the 48-hour review
window has closed
*Then released:* to the UPI ID on your listing, at your full asking price

> Your UPI ID and Instagram handle lock to the listing when you submit. Check
> them before you publish, we can't change them after.

**THE CONDITION SCALE** — five rows, the product's own grades.

| 5/5 | Pristine | Never worn, or worn once. No visible wear. |
| 4/5 | Great | Lightly worn, well kept. No major flaws. |
| 3/5 | Good | Some wear. Slight fading or small imperfections. |
| 2/5 | Fair | Noticeable wear. Fading, loose threads, minor marks. |
| 1/5 | As Is | Thrashed. Stains, holes or broken hardware. Price accordingly. |

**SELLER STANDARDS** — crosses, two columns.

Counterfeit or replica items · stolen goods · misleading listings · a different
item than the one shown · hidden damage

> Repeated violations get listings removed and accounts suspended. Not sure if
> something's allowed? Ask before you list.

**SELL IT FASTER** — four ticks.

Bright, clear photos · an honest description · a competitive price · share it
everywhere

> After you publish, open **Seller Portal → Seller Tools** and generate a
> branded Instagram image for your listing in one click. More eyes, faster sale.

**QUICK CHECKLIST** — six empty hairline checkboxes, two columns.

☐ Item cleaned ☐ Photos taken ☐ Background removed (optional)
☐ All flaws shown ☐ Description written ☐ Price set

**HELP** — full-width black block. Two QR codes, right side.

> ## STUCK? MESSAGE US.
> **8505-ZARKET** *(8505-927538)*
> contact@zarketplace.com · @zarketplace
>
> Listings · pickups · shipping · payouts · buyer disputes · account issues.
> Just reply to the WhatsApp chat.

`QR 1` — opens the WhatsApp chat (`wa.me/918505927538`), labelled **CHAT TO US**
`QR 2` — opens Seller Tools, labelled **MAKE AN INSTAGRAM POST**

I checked the vanity number: **ZARKET on a phone keypad is exactly 927538**, so
8505-ZARKET is literally your number, not an approximation. Worth flexing. It
prints as the headline with the digits underneath in small type, so nobody has
to work it out under pressure.

**CLOSING LINE** — centred, small.

> Thanks for helping build India's best marketplace for pre-loved fashion.

*Footer: Page 3 of 3 · After the sale and help*

---

## Image slots

Eleven photos. Named `slot-01.jpg` … `slot-12.jpg`, dropped in
`public/seller-guide-slots/`. The layout is final before they arrive, so nothing
reflows when they land.

| Slot | Page | Ratio | Subject |
|---|---|---|---|
| 01 | 1 | 4:1 | Cover. Rail of clothes, or a packed parcel. Dark, textural. |
| 02–07 | 2 | 3:4 | One garment, six ways: front, back, tag, close-up, flaw, on-body. |
| 08 | 2 | 1:1 | A good listing photo. |
| 09 | 2 | 1:1 | A bad one. Dim, cluttered, filtered. |
| 10–12 | 3 | 4:3 | Packing: folded, wrapped, sealed. |

QR codes are generated, not supplied.

---

## Two open questions

**The Seller Tools QR needs a login.** Scanning it while signed out lands on a
sign-in wall, which is a slightly deflating first scan. Options: point it at
`/sell` instead, or leave it and accept the wall. Tell me which.

**Do you want the shipping rates in print at all?** They're accurate today but
they're the most likely thing to change. If you'd rather not reprint the PDF
when a rate moves, I can replace the table with "from Rs. 79, shown in the form"
and keep the exact figures on the site only.
