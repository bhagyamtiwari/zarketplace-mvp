# Share image system

The images a vendor (or we) download from an item to post on Instagram.
Implemented in `src/lib/shareImage/` and drawn on a canvas; the modal in
`src/components/ShareInstagramModal.tsx` only previews and downloads.

**Principle: product > fashion > information > branding.** It should read
as a fashion post that happens to carry a price, the kind an archive or
resale account posts, not a listing exported as a flyer. Someone scrolling
should think "that's a good tee", then "₹1,490", then "on zarketplace".

## What it replaced, and why

The old card (`ShareCard`, until 2026-10-01) was one rigid template for both
formats: a full-bleed photo with a 70% black panel over the bottom third,
a 900-weight uppercase title, bordered metadata pills, the price in display
type with a strikethrough and a red "On Sale" box, a white QR block with
"SCAN TO SHOP", and a divider over a wordmark, the domain and the handle.
Everything had a container, everything was capitals, the panel covered the
garment, and the story was the square with a taller panel.

## Hierarchy

| Rank | Element | Treatment |
|---|---|---|
| 1 | The garment | The photograph, never covered by type |
| 2 | Brand + name | Brand small in tracked capitals; name in sentence case, regular weight |
| 3 | Price | `₹1,490`, medium weight, confident not loud |
| 4 | Details | One quiet line: `L · fits like L/XL · pristine` |
| 5 | Signature | `zarketplace`, lowercase, once |

There is exactly one uppercase element (the brand, as fashion sets it). No
pills, boxes, dividers, badges, shadows, outlines or text gradients. No QR
by default; no "scan to shop"; no handle; no sale flag or struck-out price.

## Layouts, chosen by the photograph

The renderer reads the photo before laying anything out (`analyse.ts`): the
colour of its border, whether that border is one even colour, the garment's
bounding box (pixels that differ from the border), and how much detail each
row and column holds (counted inside the garment only, by area, so a wide
print outweighs a small high-contrast tag and the garment's outline counts
for nothing). Every crop is the window with the most detail in it, so a
print stays whole and plain fabric is what gets cut.

- **Float** (auto when the border is an even colour, which is most of our
  photos: garments on a cleaned light or dark backdrop). The whole canvas
  becomes the photo's own backdrop colour, the photo is drawn so the garment
  sits centred and large, and its edges are feathered into the paper so no
  photo rectangle shows. A wide garment (a tee laid flat, a pair of shoes)
  gets the type centred under it; a narrow one (jeans, a standing shoe)
  gets asymmetric type instead: brand, name and details left, price right.
  Reads like an archive account's flat-lay.
- **Plate** (auto otherwise: detail shots, busy or uneven backgrounds). The
  photo fills the top of the canvas, cropped around where the detail is, and
  the type sits on a solid paper band below it, never on the photo. Paper is
  a near-white (or near-black for dark photos) tinted with the photo's own
  dominant hue. Brand, name and details left; price right.
- **Full bleed** (by choice). The photo covers the canvas; a gradient only
  over the lowest part carries white type, and the photo is placed so its
  most detailed band sits above the gradient: only plain fabric goes behind
  the type. For strong lifestyle shots.

The vendor can override Auto in the modal. The same garment photographed
differently gets a different composition; the type, sizes, spacing and
signature never change.

## Formats

All measurements are canvas pixels.

**Square, 1080 × 1080.** Margin 72. The type block is measured first and
the garment gets everything above it: on plate, a band of paper that hugs
the type (about 230 tall); on float, the type ends 60 from the bottom and
the garment area runs from 64 to 44 above the type. Signature bottom-right
on the details line, or on its own line when the details are long.

**Story, 1080 × 1920.** Margin 84. Instagram draws its own UI over roughly
the top 220 and bottom 300, so nothing that has to be read goes there: the
type block runs from about 1330 to 1620. The garment area is 0–1290 (plate,
under the top UI is fine for a photo) or 170–1300 (float), about 70% of the
frame. Signature `zarketplace` left and `shop this piece →` right, under the
details. The bottom 300 is left empty on purpose.

## Type (Inter, the site's grotesk; Helvetica Neue as fallback)

| Element | Square | Story | Weight | Notes |
|---|---|---|---|---|
| Brand | 23 | 30 | 600 | Uppercase, tracked +0.14em |
| Name | 42 | 56 | 400 | Sentence case, max 2 lines, shrinks to 80% before truncating |
| Price | 36 | 46 | 500 | `₹` + Indian grouping |
| Details | 23 | 29 | 400 | 60% ink |
| Signature | 23 | 29 | 600 | Lowercase, 85% ink; story CTA at 400 |

Line gaps: brand → name 10/14, name → price or details 18/24, details →
signature 0 (same baseline) / 34. Ink is `#141414` on light paper and
`#F4F2EE` on dark; secondary text is that ink at 60%.

## Colour

Inherited from the photograph, never a brand colour slapped on top. Float
uses the photo's own backdrop. Plate derives the paper from the photo's
average hue at very low saturation. Light or dark paper, and so the ink,
follows the photo's lightness.

## Data (`data.ts`)

Built only from fields that exist; nothing is invented.

- **Brand**: `listing.brand`, as written, set in capitals.
- **Name**: the title with the brand removed from its start or end (and any
  alias in brackets, e.g. `FA (F*cking Awesome)`), handles and domains
  removed, `T-Shirt`/`Tshirt` shortened to `Tee`, straight quotes curled,
  and shouted words (`MADE IN ITALY`) brought to title case while short
  acronyms (`USA`, `UFC`) stay. Falls back to the title.
- **Price**: `sale_price ?? price`, as `₹4,200`. No original price shown.
- **Details**, in order and each only if present: the listed size (`L`,
  `UK 7.5`, `W30`), the fit from the vendor's note (`fits like L/XL`, or
  `W33 L32` for `33x32`; dropped if it repeats the size), the condition in
  lowercase.
- There is no retail-price field yet. If one is added, it goes after the
  price as `retail ₹X` in the details style, only when it is higher, and
  never as a saving.

## Optional QR

Off by default. When switched on (for print), a small QR in the type band,
no label. Never on by default for feed or story.
