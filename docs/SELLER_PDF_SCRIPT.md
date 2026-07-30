# Seller onboarding PDFs — script for approval

Two documents, two pages each, handed out on WhatsApp. This is the copy and the
layout plan only. Nothing is built until this is signed off.

**Every image is a numbered slot.** Send me files named `slot-01.jpg` and so on
and I drop them in. Until then each slot renders as an empty framed box with its
label printed inside, so the layout is final either way and nothing shifts when
the photos arrive.

**Layout rules I'm holding to:** one idea per panel, nothing overlapping, no
connector arrows or diagram shapes beyond numbered black circles and hairline
rules, generous white space. Emoji in the draft (✅ ❌ 🎉) become the brand's own
marks: a black circle with a white check, a hairline square with a cross, no
emoji anywhere.

---

## Three corrections to the draft

These are in the copy below already. Flagging them because they change what you
are promising sellers.

**1. There is no way to edit a listing.** The draft says "You can edit your
listing before it sells." The seller portal only offers *delete*. The only edit
button in there edits tracking on a sold order, not the listing. A seller who
reads that promise will hunt for a button that does not exist. Corrected copy
below tells them to delete and relist. Worth building the edit feature, but the
PDF cannot claim it today.

**2. Payouts are not automatic.** The draft says "your payout is released
automatically." Per `docs/PAYMENTS.md`, a DB trigger creates the payout row at
delivery, then **an admin pays the UPI by hand** and marks it paid out. Copy
below says the payout is released after the window closes, without promising
machine-speed. If you automate it later, one word changes.

**3. The in-product button is called "Generate Instagram image."** Not "Create
Instagram Post." It lives in Seller Portal → Seller Tools. Copy matches the
product so nobody is looking for the wrong label.

---

# PDF 1 — Welcome to Selling on zarketplace

## Page 1

**MASTHEAD** (black band, full bleed)
wordmark left · `WELCOME PACK` right · `1 OF 2`

**COVER BAND** — `SLOT 01` · full width × 150pt · a rail of clothes, a packed
parcel, or a seller at home. Dark, textural. Type sits over it under a scrim.

> ## WELCOME TO SELLING
> *sell your clothes. keep 100%.*
>
> Thanks for selling on zarketplace. Here is everything, once.

**FOUR PROMISES** — one row, four icons, label + one line each. No boxes.

| Icon | Label | Line |
|---|---|---|
| BadgePercent | No selling fees | We take 0%. Not a launch offer. |
| Wallet | You keep 100% | Your asking price is your payout. |
| Truck | Buyer pays shipping | And the Buyer Protection fee. |
| ShieldCheck | We handle the rest | Secure payments and delivery. |

**HOW SELLING WORKS** — six numbered black circles, hairline rule between them,
label + short line under each. Two rows of three.

1. **Create your listing** — Photos, details, condition, price.
2. **A buyer purchases** — Their money is held, not sent to you.
3. **We arrange pickup** — From your door. No labels, no courier queue.
4. **Your item is delivered** — Tracked the whole way.
5. **48-hour review** — The buyer checks it over.
6. **Payout released** — To your UPI.

**WHAT YOU KEEP** — solid black block, full width.

> ## 100%
> **You receive 100% of your listing price.**
> No listing fees. No selling fees. No hidden commissions.
> The only deduction is shipping, and only if you chose to offer free shipping.

*Footer: `Page 1 of 2 · Welcome` · `zarketplace.com`*

---

## Page 2

**MASTHEAD** — `2 OF 2`

**ONE LISTING = ONE ITEM** — two columns, marks not emoji.

*Allowed* (black circle, white check)
- One hoodie
- One pair of shoes
- One jacket

*Not allowed* (hairline square, cross)
- "Available in all sizes"
- "DM for colours"
- "Message for price"
- Several different items bundled into one listing

> Got five identical tees? Create five listings. The system rejects bundle
> phrasing automatically.

**GREAT PHOTOS SELL FASTER** — six slots in one row, 3:4 portrait, numbered,
label under each. Front and back marked REQUIRED.

`SLOT 02` Front · `SLOT 03` Back · `SLOT 04` Brand label · `SLOT 05` Size tag ·
`SLOT 06` Close-up detail · `SLOT 07` A flaw, shown honestly

Shoot these six on one real garment so the row reads as a single example.

**Use** — natural light · clean plain background · the whole item in frame ·
front and back · close-ups of tags · close-ups of every flaw

**Skip** — screenshots · stock images · heavy filters · dark rooms · busy
backgrounds · angles that hide damage

> Honest listings build trust and come back less often.

**SIDE BY SIDE** — two slots, 1:1, captioned. The single most useful thing in
the pack.

`SLOT 08` **This sells** — flat, lit, plain background, whole garment.
`SLOT 09` **This doesn't** — dim, cluttered, cropped, filtered.

**DESCRIBE IT ACCURATELY** — five inline chips, one line under.

Brand · Size · Colour · Condition · Any flaws

> Damage, stains or wear go in the photos *and* the description. Both.

**PRICE IT FAIRLY** — one line.

> Realistically priced items sell much faster. Check similar listings on
> zarketplace before you decide.

**NEED HELP?** — black block, full width.

> ## MESSAGE US ON WHATSAPP
> **+91 85059 27538**
> Listings, pickups, deliveries, payments, disputes. Just reply to the chat.
> contact@zarketplace.com · @zarketplace

*Footer: `Page 2 of 2 · Listing well` · `zarketplace.com`*

---

# PDF 2 — Seller Guide & FAQ

## Page 1

**MASTHEAD** — `SELLER GUIDE` · `1 OF 2`

**COVER BAND** — `SLOT 10` · full width × 130pt · a parcel being handed over, or
tape going across a box.

> ## YOUR ITEM SOLD.
> *now what.*

**AFTER YOUR ITEM SELLS** — six numbered steps, two rows of three.

1. **We notify you** — Straight away.
2. **Pack it securely** — You have 72 hours.
3. **We arrange pickup** — At your door.
4. **Track it** — Seller Portal → Sales.
5. **48-hour review** — Starts on delivery.
6. **Payout released** — To your UPI, no open claim.

> The 72-hour window is the one deadline that matters. Miss it repeatedly and
> you lose selling access.

**PACKING** — three slots, 4:3, captioned, plus a short list.

`SLOT 11` Folded neatly · `SLOT 12` Wrapped and taped · `SLOT 13` Labelled parcel ready

- Fold clothing neatly.
- Clean packaging, nothing reused and grubby.
- Protect shoes and accessories.
- Include everything shown in the listing.
- Ship the exact item in your photos.

**PAYOUTS** — black block, two columns.

> **Held until both are true**
> The buyer has received the item.
> The 48-hour review window has closed.
>
> **Then released**
> Paid to the UPI ID on your listing. No open claim, no delay.
> Your payout is your full asking price.

*Footer: `Page 1 of 2 · After the sale` · `zarketplace.com`*

---

## Page 2

**MASTHEAD** — `2 OF 2`

**NEED TO CHANGE A LISTING?** — corrected copy.

> There is no edit button yet. Delete the listing and create it again with the
> fix. If the item has already sold, message us on WhatsApp straight away and we
> will sort it with the buyer.

**WHAT ISN'T ALLOWED** — five items, hairline square + cross, one row of copy.

- Counterfeit items
- Misleading descriptions
- Photos that are not your item
- Stolen goods
- Prohibited products

> Not sure whether something is allowed? Ask before you list. Asking is free,
> a suspension isn't.

**FREQUENTLY ASKED** — five Q&A pairs, question in black caps, answer in grey
underneath. Two columns.

**When do I get paid?**
After delivery and the 48-hour buyer review window.

**Who pays shipping?**
The buyer, at checkout. Unless you switched on free shipping, in which case it
comes out of your payout.

**Are there selling fees?**
No. You keep 100% of your asking price.

**What if my item doesn't sell?**
Better photos, a fairer price, and share it. Seller Portal → Seller Tools
generates a branded Instagram image for any listing in one click.

**What if I need help?**
Reply to the WhatsApp chat. Any time.

**BEFORE YOU LIST** — six checkboxes, hairline squares.

☐ Clean your item
☐ Take great photos
☐ Mention every flaw
☐ Price it fairly
☐ Double-check the description
☐ One item per listing

**CLOSING** — black block.

> ## YOU'RE READY TO SELL.
> *start at zarketplace.com/sell*
> Questions? WhatsApp +91 85059 27538

*Footer: `Page 2 of 2 · Guide and FAQ` · `zarketplace.com`*

---

# Image slots, all together

Hand me these named `slot-01.jpg` … `slot-13.jpg`. Ratios matter more than
resolution; anything above 1200px on the long edge is plenty.

| Slot | Doc | Ratio | Subject |
|---|---|---|---|
| 01 | 1 | 4:1 wide | Cover. Rail of clothes or a packed parcel. Dark, textural. |
| 02–07 | 1 | 3:4 each | The six shots, all of one real garment: front, back, brand label, size tag, close-up detail, a flaw. |
| 08 | 1 | 1:1 | A good listing photo. |
| 09 | 1 | 1:1 | A bad one. Dim, cluttered, filtered. |
| 10 | 2 | 4:1 wide | Cover. Parcel being handed over, or tape across a box. |
| 11–13 | 2 | 4:3 each | Packing: folded, wrapped, labelled and ready. |

Slots 08 and 09 are the highest-value pair in either document. A seller who sees
the difference once will shoot better forever.

---

# Separate from the PDFs: the post-publish screen

Your suggestion, matched to the product's real labels. This is a code change in
`src/pages/Sell.tsx`, not part of the print pack.

> ## YOUR LISTING IS LIVE
> We'll notify you the moment someone buys it.
>
> Meanwhile, generate a branded Instagram image and share it. More eyes, faster
> sale.
>
> **[ GENERATE INSTAGRAM IMAGE ]**  ·  View my listings

One note: every listing is reviewed before it goes live, so a listing is
*submitted*, not instantly public. The screen should say "Your listing is in
review, we'll have it live shortly" unless you want to change that flow. Tell me
which and I'll build it.
