# zarketplace — Brand Kit

**The permanent source of truth for how zarketplace looks and sounds.**
Product UI, marketing assets, presentations, landing pages, social media, advertisements, animation, typography, colour, spacing — everything visual starts here.

This handbook was reverse-engineered from the shipped product. When in doubt, the live product is the reference implementation; this document explains *why* it looks and sounds the way it does, so new work extends the system instead of diluting it.

> **Scope.** This document governs **design only**. It says nothing about how the business works, what the transaction is, or what anything costs, and it must never regain that language. For the model, the terminology and the words we are not allowed to use, see **`COPY_RULES.md`**, which takes precedence over anything here that touches the business.

> The one unbreakable rule, stated up front: **"zarketplace" is always written in lowercase.** Even at the start of a sentence. Even in a headline. Even when everything around it is uppercase — the wordmark is the single lowercase element in a sea of caps, and that contrast *is* the brand.

---

# 1. Brand Foundation

## Mission
Make buying pre-owned feel as certain as buying new.

## Vision
Become where India buys pre-owned fashion, and keep the value already sitting in existing garments in circulation. The future of fashion isn't only producing new clothes; it's keeping good clothes in circulation.

## Purpose
Pre-owned shopping in India runs on guesswork - unclear prices, unclear condition, unclear whether anything will actually arrive. zarketplace exists to remove that guesswork.

## Brand personality
Five traits, in priority order:

1. **Blunt.** We say the thing directly. "Rest in peace dm4price." Not "Discover a better way to shop resale."
2. **Confident.** Big type, black and white, no decoration to hide behind. The brand never begs, never over-explains, never uses filler enthusiasm.
3. **Irreverent, with a purpose.** "F*ck Fast Fashion!" — the edge always points at waste, friction, and fast fashion. Never at people or communities.
4. **Trustworthy in the details.** Beneath the loud voice, the operational copy (FAQ, policies, order statuses) is calm, precise, and honest. Loud on billboards, exact on receipts.
5. **Culture-fluent, not culture-chasing.** Lowercase asides, "sell ur thrifted finds here," internet-native shorthand — used sparingly, like seasoning. We sound like gen-z because we are, not because we studied it.

## Core values
- **No friction.** Every upfront price, every removed step, every prefilled field is the brand keeping its promise.
- **Trust is infrastructure.** Checked items, secure payments, tracked shipping, and honest status updates are product features *and* brand features.
- **Circularity.** "Good clothes deserve another life." Reduce waste, buy pre-loved, keep clothes out of landfills.
- **Certainty.** Nothing about an order should require faith. What you see is what arrives, and what we say will happen is what happens.

## Emotional goals
When someone touches zarketplace, they should feel:

- **Relief** — "finally, no DMing, no haggling, no ghosting."
- **Cool by association** — the interface looks like a fashion editorial, not an e-commerce grid. Buying secondhand here feels like a flex, not a compromise.
- **Safe** — money, shipping, and delivery are visibly handled end to end by one company. Nothing ever feels informal.
- **Righteous** — every purchase quietly counts against fast fashion and landfill waste.

## Brand promise
**Clear price. Checked item. Tracked delivery. One source.**
Every asset we ever make should be reducible to some part of that sentence.

---

# 2. Visual Identity

## Design philosophy
The product's aesthetic is **monochrome editorial brutalism**: the visual language of high-fashion print (huge condensed headlines, letterspaced caps captions, black-and-white photography) executed with the honesty of brutalist web design (sharp rectangles, visible borders, no gradients-for-decoration, no rounded friendliness).

Four principles govern everything:

1. **Typography is the design.** There are almost no decorative elements. Hierarchy, emotion, and brand recognition are carried by type: weight (Black/900 everywhere), case (uppercase system voice vs. lowercase serif whispers), size (viewport-scale headlines vs. 9–11px micro-labels), and letter-spacing (0.2em–0.4em tracking on all labels).
2. **Black and white is the palette; photography is the color.** The chrome is strictly monochrome. The only rich color on any screen comes from listing photos and campaign imagery — which makes the merchandise the hero by default.
3. **Sharp, not soft.** Right angles, hard edges, visible 1px borders. Nothing bubbly, nothing glossy. The single deliberate exception: tiny circular count badges and check dots (perfect circles read as "marks," not "softness").
4. **Loud headline, quiet system.** Marketing surfaces shout (13vw type, marquee tickers, caution stripes). Transactional surfaces whisper (plain typographic status labels, faint gray empty states, thin borders). Never mix the registers.

## Color system

### Core palette (99% of every asset)
| Token | Value | Usage |
|---|---|---|
| Black | `#000000` | Primary. Text, buttons, dark sections, footer, hero backgrounds. |
| White | `#FFFFFF` | Primary. Page background, inverted text/buttons on dark. |
| Surface | zinc-50 `#FAFAFA` | Alternate section backgrounds, card image wells, empty states, FAQ cards. |
| Surface-2 | zinc-100 `#F4F4F5` | Pressed/open states of surfaces (e.g., expanded FAQ item). |

### Opacity tints (how "gray" happens)
zarketplace has no gray swatches — grays are **opacities of black or white**, which keeps every tint harmonious on any background:

- **On white:** `black/80` hover text · `black/60` secondary text · `black/40`–`black/50` tertiary labels & muted meta · `black/30` disabled/empty text · `black/10` strong borders · `black/5` hairline borders.
- **On black:** `white/80` body links · `white/60` muted text · `white/40` faint · `white/10` hairline borders · `white/5` subtle section dividers.

### Functional accents (use only for their exact job — never decoratively)
| Color | Value | Only used for |
|---|---|---|
| Offer yellow | yellow-50 `#FEFCE8` + solid black border | Launch offers / promotions callout cards & badges. |
| Alert red | red-600 `#DC2626` | Destructive actions (sign out), "On Sale" flag on Instagram share cards. |
| Verified green | emerald-50 bg / emerald-700 text / emerald-200 border | "Email Verified" style confirmation chips only. |
| Warning amber | amber-50 bg / amber-700 text / amber-200 border | "Unverified"/pending chips only. |

**Rule:** if you're reaching for a color to make something "pop," use scale, weight, or inversion (black↔white) instead. Color is a *signal*, never a *style*.

### Gradients
Only two, both functional not decorative: `#000 → #1a1a1a` vertical (adds depth to large dark surfaces) and `#fff → #f9f9f9` vertical (soft light surfaces). Plus black→transparent→black overlays used to seat photography under text. No colored gradients, ever.

## Typography

### Typefaces
- **Inter** — the workhorse. Weights loaded: 400, 500, 600, 700, 800, **900**. Everything is Inter unless it's deliberately the serif.
- **Playfair Display (italic)** — the counterpoint. Used *only* for short, lowercase, emotional phrases that soften or subvert a shouted headline: "buy pre-loved." · "another life." · "sell ur thrifted finds here."

### The typographic system (five registers)
| Register | Spec | Example |
|---|---|---|
| **Display headline** | Inter 900 (Black), UPPERCASE, tracking-tighter (−0.05em), line-height 0.85–0.95, huge (viewport-scaled: 13vw mobile / 8vw desktop on hero; 4xl–8xl on sections) | "REST IN PEACE DM4PRICE." |
| **Serif whisper** | Playfair Display, italic, lowercase, roughly 60–75% the size of the headline it accompanies, normal-to-tight tracking | *another life.* |
| **Micro-label** (the brand's signature) | Inter 900, UPPERCASE, 9–11px, letter-spacing 0.2em–0.4em | BROWSE · LIST ITEM · SCAN TO SHOP |
| **Body** | Inter 500–700, often UPPERCASE with tracking-widest at xs–sm sizes, relaxed line-height; sentence-case Inter 500 for long-form legal/support text | Section descriptions, FAQ answers |
| **Price/number** | Inter 900, tight tracking, large — numbers are display type | Rs. 1,499 |

### Rules
- **Wider tracking as type gets smaller; tighter tracking as it gets bigger.** Displays are tracking-tighter; micro-labels are tracking-[0.3em]. Never the reverse.
- The serif never appears in caps, never carries information, never exceeds one short phrase. It is a single italic breath between shouts.
- **900 is the default weight** for anything that names, labels, or calls to action. 400–500 exists only for long-form reading.
- Currency is always **"Rs."** (e.g., `Rs. 1,499`), en-IN formatting, no decimals. Not ₹, not INR.

## Iconography
- **Library: Lucide** (stroke icons) — thin, geometric, consistent 2px stroke.
- **Sizes:** 16px (`h-4 w-4`) standard; 12–14px inline with micro-labels; 20px max for nav toggles.
- Icons are **companions to labels, never replacements** — an icon almost always sits beside uppercase text (e.g., `Package` + "MY PURCHASES"). Exceptions: universally understood glyphs (search, close, cart, hamburger).
- Icons are always monochrome (current text color). No filled icons, no duotone, no colored icons, no icon backgrounds/containers.
- Recurring vocabulary: `ArrowRight`/`ArrowUpRight` (go/external), `Sparkles` (offers), `IndianRupee` (payouts), `PackageCheck` (checked at our hub), `ShoppingBag` (cart), `Package` (orders), `Truck` (shipping), `X` (close), `ChevronDown` (expand), `Instagram`/`Youtube`/`Twitter`/`MessageCircle` (social).

## Shapes
- **The rectangle is the brand shape.** Buttons, cards, inputs, modals, badges, panels — all sharp-cornered rectangles.
- **Perfect circles** appear only as tiny functional marks: cart count badges, black check dots (`✓` in a 20px black circle).
- One graphic device: the **diagonal caution stripe** — 45° repeating black/white stripes (10px bands) — used as thin bands framing the launch ticker. It signals "announcement / hazard-tape energy" and may be reused for launch/drop moments, sparingly.
- No blobs, no organic shapes, no rounded-corner "friendly" containers, no polygons.

## Borders
- **Hairlines everywhere:** `1px` at `black/5` on white, `white/10` on black. Borders define structure quietly.
- **Solid black 1px borders** promote an element to "important callout" (launch offer card, pricing receipt, format toggles).
- **2px borders** mean "selected" (chosen thumbnail) or serve as underline accents (`border-b-2 border-black` under inline links).
- Section changes on light backgrounds use `border-y border-black/5` rather than color changes.

## Shadows
Shadows are rare and semantic:
- **Elevation:** `shadow-2xl` on floating menus/dropdowns; `shadow-xl` on image previews. No small/medium decorative shadows on cards or buttons at rest.
- **The glow:** white CTAs on black backgrounds carry a soft white glow — `0 0 30px rgba(255,255,255,0.2–0.3)`. This is the *only* "special effect" in the system; reserve it for primary CTAs on dark heroes.
- Never drop-shadow text. Never colored shadows.

## Grid
- **Content max-width: 1280px** (`max-w-7xl`), horizontal padding 16 / 24 / 32px (mobile / sm / lg). Long-form text pages narrow to `max-w-3xl`–`max-w-4xl`.
- **Product grid:** 2 columns on mobile, 4 on desktop. Column gap 24px; row gap 40–48px (rows breathe more than columns).
- **Product image ratio: 3:4 portrait**, always — the editorial fashion crop.
- Split sections use a 12-column mental model (e.g., 5/7 headline-vs-content splits).
- **Nav height: 80px** fixed, translucent white + heavy backdrop blur, hairline bottom border. Page content starts below it (`pt-24`–`pt-32`).

## Spacing
- Base unit 4px; common rhythm: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96px.
- **Sections are generous:** 64–96px vertical padding (`py-16 sm:py-24`). Headline-to-content gaps 32–48px.
- **Buttons are tall:** primary CTAs use 16–24px vertical padding (py-4 to py-6) with tiny 10–11px type inside — a small voice in a big room. That proportion (huge hit area, micro type) is a signature.
- Dense information (order rows, dropdowns) still gets 12–24px internal padding — nothing ever feels cramped.

## Illustration style
zarketplace does not use illustration. **No mascots, no spot illustrations, no 3D renders, no clip art, no emoji-as-graphics.** Where another brand would place an illustration, we place: a photograph, a huge typographic statement, or nothing (whitespace). If a diagram is genuinely needed (e.g., "how it works"), build it from the existing vocabulary: numbered steps in black circles, uppercase micro-labels, hairline connectors, black & white only.

## Photography style
Photography is the *only* source of richness, in two registers:

1. **Product photography (the merchandise):** honest, well-lit, real photos of the real garment. Framed in 3:4 portrait on a zinc-50 well. Never filtered into monochrome — product photos keep their true color because accuracy is trust.
2. **Campaign/mood photography (the brand):** dark, textural, high-contrast imagery — garment piles, denim close-ups, landfill textures, red-tinted fabric walls. Always used **behind** type at 30–40% opacity under black gradient overlays (`from-black via-transparent to-black`). The photo is atmosphere; the typography is the message. Text must always pass contrast over it.

No stock-photo smiling models, no lifestyle-catalog gloss, no pastel flat-lays. Grit over gloss.

## Motion principles
The motion system (Motion/Framer Motion in product) has a distinct character: **fast, weighted, expensive-feeling.**

- **Signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`** (easeOutExpo family) — fast start, long soft landing. Use for all entrances and drawers.
- **Core moves:**
  - *Masked line reveal:* headlines rise from `y:100%` to `0` inside an `overflow:hidden` wrapper (~0.8s). The signature hero move.
  - *Fade-rise:* content enters at `opacity:0, y:20px` → settled (0.5–0.8s), staggered ~0.2–0.3s between siblings.
  - *Scale-settle:* modals enter at `scale:0.95, opacity:0` → full.
  - *Press feedback:* CTAs `hover:scale(1.05)`, `active:scale(0.95)` — every button physically responds.
  - *Slow zoom:* product images scale to 1.05 over **700ms** on hover — luxurious, never snappy.
  - *Parallax:* background imagery drifts ~20% with scroll on heroes.
  - *Marquee:* the ticker scrolls linearly, seamlessly looped, ~28s per cycle. Never bouncy.
- **Timing bands:** micro-feedback 150–250ms · entrances 500–800ms · ambient (marquee, parallax) tens of seconds.
- **Never:** bounce/spring overshoot on UI, spinning logos, confetti, attention-seeking wiggles. Motion confirms and reveals; it doesn't perform.

---

# 3. UI Principles

## How interfaces should feel
Like a limited-run fashion zine that happens to process payments. Confident, fast, stark, slightly intimidating at first glance — then surprisingly effortless to actually use. The loudness lives in marketing surfaces (home, section headers); the moment a user is doing a task (listing, paying, tracking), the interface becomes calm, prefilled, and precise.

## Button philosophy
- **Two buttons only:**
  - *Primary:* solid fill inverted from the background (black on white / white on black), sharp corners, tall padding, 10–11px Inter 900 uppercase tracking-[0.2em–0.4em] label, hover scale 1.05, active scale 0.95. On dark heroes, add the white glow.
  - *Secondary:* 1px outline in the foreground color, same typography; hover = fill inversion (outline white → solid white w/ black text).
- **Tertiary actions** are typographic links: uppercase micro-label with a 2px bottom border, or a plain underline.
- Labels are verbs, 1–3 words: BROWSE · START SELLING · LIST ITEM · BUY IT NOW · DOWNLOAD.
- Disabled = 50% opacity. Loading = spinner icon + present-progressive label ("GENERATING..."). Never change a button's size while loading.
- Never: rounded pills, colored buttons, gradient fills, drop shadows at rest, icon-only primary CTAs.

## Card philosophy
- Cards are **barely there**: a 3:4 image on a zinc-50 well with a `black/5` hairline and (at most) a 2px corner radius on the image only — then unboxed text below. The photo is the card.
- Text under a card: title (xs bold caps, 2-line clamp) → price (base, 900, black; strikethrough original in `black/40` if on sale) → muted meta row (brand · size, 10px bold caps `black/40`).
- On-image flags are rectangles in the top/bottom corners: black bg + white 9px caps ("SALE") or white/90 bg + black caps (condition). Max two flags per image.
- Hover = the slow 700ms image zoom. No lift, no shadow, no border color change.

## Layout philosophy
- **One idea per section.** Each full-width band makes a single statement (a headline, a grid, a claim + proof list) and alternates background: white → zinc-50 → black → black-with-photo.
- **Asymmetry inside symmetry:** sections are full-bleed and centered as bands, but content within them splits unevenly (5/7), right-aligns, or left-aligns — the eye never falls into a template rhythm.
- Editorial header pattern: giant headline left / small underlined "VIEW ALL ↗" utility link right, baseline-aligned.
- Long-form pages (policies, about, FAQ): single narrow column, back-link at top, stacked zinc-50 panels per section, optionally ending on an inverted black panel for the closing statement.

## Whitespace usage
Whitespace is the luxury signal. Big sections get 96px of air; grids get taller row gaps than column gaps; buttons get far more padding than their label needs. When a layout feels empty, resist filling it — either scale the type up or leave it. Density is only acceptable in operator surfaces (admin, vendor portal tables), and even there rows get real padding.

## Hierarchy
Built in this order of tools: **size → weight/case → opacity → position**. Color is *not* a hierarchy tool.
1. The one thing: huge 900 uppercase display.
2. Actions: black/white blocks (fills draw the eye on a monochrome page).
3. Supporting info: micro-labels at descending opacities (black → /60 → /40 → /30).
4. Status: typography only — a plain 10px black caps label; add underline when it needs attention. **No colored status pills** (the two email-verification chips are the sanctioned exception).

## Accessibility considerations
- Maximal core contrast (pure black on pure white) — protect it: body text never lighter than `black/60`; `black/40` and below is only for short labels, not sentences.
- Text over photography always sits on a dark overlay/scrim; verify contrast on the busiest region of the image.
- Visible focus: 2px outline in the foreground color, offset 2px (`focus-visible:outline`) — already standard in the footer; apply everywhere.
- Tap targets stay generous (tall buttons, py-4+ drawer links); inputs hold a 16px minimum font on mobile (prevents iOS zoom).
- All-caps micro type is a brand signature but a legibility tax — keep such passages short, tracked wide, and never below 9px (product) / 18pt-equivalent (social images).
- Icons never carry meaning alone: pair with text or `aria-label`. Respect `prefers-reduced-motion` by dropping parallax/marquee to static.

---

# 4. Voice & Tone

## Writing style
Two registers, deliberately split — knowing which one you're in is 90% of writing for zarketplace:

- **Campaign voice (headlines, heroes, social):** blunt, irreverent, culture-fluent, funny at the expense of friction and fast fashion. Short declaratives. Wordplay welcome ("rest in peace dm4price"). Occasional lowercase internet-speak as the serif whisper ("sell ur thrifted finds here").
- **System voice (UI copy, FAQ, policies, emails, statuses):** calm, exact, second-person, zero hype. Says precisely what happens and when ("You have 72 hours from the time an item sells to hand it to the courier."). Honest about limits and consequences. Never jokes about money, shipping, or disputes.

**Which register wins.** The campaign voice stays blunt and irreverent, aimed at friction, waste, and fast fashion — never at the transaction itself. We are the counterparty on every order now, so anything touching money, condition, or delivery is written in the system voice, even inside a headline. Be loud about the belief; be exact about the deal.

## Vocabulary
- **Own these words:** pre-loved · pre-owned · thrifted · resale · drops · finds · listings · checked · tracked · payout · offer · circular fashion · "no DM for price."
- **We say "buy" and "sell"** — not "shop our collection," not "discover."
- Never "users." "Customers" only in legal text. For what to call everyone else, and for the words that are outright banned on money and the transaction, see **`COPY_RULES.md`** — terminology is model-governed, not brand-governed.
- Money is always a rupee amount: "Rs. 1,499."
- **Banned (voice):** "curated" (unless literal), "elevate," "luxury for less," "guilt-free," "shopaholic," "steal" (for price), "preloved gems," corporate hedges ("we strive to," "please note that"), and any exclamation-point enthusiasm in system copy.

## Grammar preferences
- **zarketplace is always lowercase** — in headlines, sentence-starts, legal text, everywhere.
- Campaign headlines take terminal periods ("Available now." "Rest in peace dm4price."). The period is part of the confidence.
- Sentence fragments are fine in campaign voice; system voice uses complete sentences.
- Second person ("you"), first person plural for the company ("we," "our team").
- Contractions welcome in both voices ("there's," "it's," "isn't").
- Numerals over spelled-out numbers ("72 hours," "48 hours").
- One asterisk-censored expletive exists in the brand's vocabulary ("F*ck Fast Fashion!") — always self-censored with the asterisk, always aimed at fast fashion/waste, never at people, and used at most once per surface. Treat it as the strongest card in the deck; it loses power if played often.

## Headlines
- 2–6 words. Weight-900 uppercase, tight, with a period.
- Formulas that work: *kill the old way* ("Rest in peace dm4price.") · *plain statement of value* ("Available now." / "Resale, without the friction.") · *cause + serif payoff* ("Reduce waste," → *buy pre-loved.*) · *belief statement* ("Good clothes deserve" → *another life.*).
- The headline/serif pairing is the brand's rhetorical signature: **shout the principle in caps, whisper the humanity in italic lowercase.**

## Calls to action
- Imperative verbs, 1–3 words, uppercase: BROWSE · GET AN OFFER · BUY IT NOW · SCAN TO SHOP · VIEW ALL.
- One primary CTA per section. Ever.
- CTAs state the action, not the aspiration — "START SELLING," never "BEGIN YOUR JOURNEY."
- Social CTAs may be a sentence in system voice: "Just listed on @zarketplace — link in bio. Scan the QR to shop direct."

## Things to avoid
- Uppercase "Zarketplace" or "ZARKETPLACE" in running text (the wordmark asset renders the name; text always lowercase).
- Fake urgency ("HURRY! ONLY 2 LEFT!!") — real scarcity (one-of-one listings) speaks for itself.
- Emoji in product UI and headlines. (Sparingly acceptable in Instagram *captions*, never on the image.)
- Punching down: no jokes about the items people sell us, buyers' budgets, or thrift itself. Thrift is the hero.
- Sustainability preachiness — one clean line ("Keep clothes in circulation and out of landfills.") beats a paragraph of guilt.
- Hedging in system copy: say "Your payout is released once we accept your item," not "payouts are typically processed within…" unless legally required.

---

# 5. Instagram Identity

Instagram is zarketplace's home turf — the audience lives there, and the product literally generates its own IG assets (the built-in share-card generator). Feed content must look like the product grew an Instagram account, not like a marketing team found a template.

**A zarketplace carousel should feel like flipping through a stark, oversized fashion zine that occasionally talks like your funniest friend.** Black and white pages, enormous type, one idea per slide, real photos when photos appear, and a deadpan punchline or plain-spoken fact on every slide.

## Cover slide principles
- **One huge statement, nothing else.** Inter Black (900), uppercase, tracking-tight, 2–6 words, period included. Sized like the hero: type should occupy 60%+ of the slide width.
- Default: black background, white type (matches the hero). Inverted white/black covers are allowed for variety within a series.
- Optionally add the serif whisper as a second line (Playfair italic lowercase) and/or one micro-label kicker at top (9–11px-equivalent caps, tracking 0.3em, 50% opacity — e.g., "VENDOR GUIDE — 01").
- The wordmark sits small at the bottom, centered or bottom-left. Never enlarge the wordmark to fill space.
- If the topic is a launch/drop/announcement, the caution-stripe band may frame the top and bottom edges.
- No cover ever uses: more than ~10 words, a colored background, rounded frames, or stock imagery.

## Body slide layout
- **One idea per slide.** If a slide needs two paragraphs, it's two slides.
- Grid: generous margins (≥96px at 1080px scale), content anchored top-left or centered, wordmark or handle small at bottom, slide number as a micro-label ("02 / 07") top-right.
- Alternate backgrounds through the deck the way the site alternates sections: black → white → zinc-50 → photo-backed. Avoid two identical backgrounds in a row.
- Structure per slide: micro-label kicker (the topic) → statement in display caps (the point) → 1–2 short supporting lines in small tracked caps at 60% opacity (the detail).
- Lists render like the site's proof grid: black check-dot circles + short uppercase items — max 5 per slide.

## Typography hierarchy (per slide)
1. **Kicker:** Inter 900 caps, ~24–28px at 1080 scale, tracking 0.3–0.4em, 50% opacity.
2. **Statement:** Inter 900 caps, 90–160px, tracking-tight, line-height 0.9.
3. **Whisper (optional):** Playfair Display italic lowercase, ~60% of statement size.
4. **Support:** Inter 700 caps, 30–36px, tracking 0.15–0.2em, 60–80% opacity, max 3 lines.
5. **Meta (page number, handle):** Inter 900 caps, ~22px, tracking widest, 40% opacity.

Never more than three type levels visible on one slide (kicker + statement + support is the ceiling).

## Icon usage
Lucide stroke icons only, monochrome, drawn at the same visual weight as on-site (thin 2px strokes scaled up). One icon per concept, always paired with its caps label, never decorative sprinkles. No emoji on slides, no filled/3D/gradient icons, no icon grids as filler.

## Image usage
- Product photos: full-bleed or in the 3:4 portrait well on zinc-50, exactly like a ListingCard. Keep true color.
- Mood photos: always under a dark scrim (30–40% image opacity or black gradient overlay) with type on top — identical treatment to the site's photo sections.
- The built-in share card is the canonical product-post format: full-bleed photo, bottom `rgba(0,0,0,0.7)` info panel, 900-weight uppercase title, price in display type, bordered chips for size/condition, white QR block + "SCAN TO SHOP," centered wordmark above a `white/18` hairline. Red `#DC2626` "ON SALE" flag top-left when discounted. Don't redesign this per post — consistency is the point.
- Never: filters that tint product colors, borders/frames around the whole slide, collage chaos, watermarks other than the wordmark/handle.

## CTA slide (last slide)
- Layout mirrors the hero: statement + one or two site-style "buttons" (drawn as solid white block / outlined block with caps micro-labels — BROWSE · START SELLING) + wordmark + handle.
- One instruction max: "link in bio" or a QR block ("SCAN TO SHOP"), not both fighting.
- May close with the serif whisper as a sign-off (*see you on the other side of dm4price.*).
- Follow prompt style: "FOLLOW @ZARKETPLACE FOR MORE" as a micro-label, not a plea.

## Storytelling style
Problem → punchline → proof. Open on the pain (the DM screenshot energy: "dm price?" "is this available?" silence), land the joke or the blunt reframe, then show how zarketplace kills it, ending on one concrete action. Stories are told from inside the culture — the reseller's grind, the buyer's ghosting fatigue — never from a corporate observer's distance.

## Educational style
Teach like the FAQ reads: numbered, concrete, no fluff. "HOW TO PRICE YOUR THRIFTED FINDS — 01 CHECK SOLD LISTINGS, 02 BE HONEST ABOUT CONDITION…" Facts get sources when they're claims (the About page cites its market stat — do the same: small 40%-opacity caps citation line). Every educational deck ends with the action the lesson enables (list it, buy it, check the guide).

## Premium vs playful balance
**Premium look, playful mouth. Roughly 80% premium / 20% playful.**
- The *visual system never loosens*: no cursive stickers, no bright colors, no meme fonts, no hand-drawn scribbles. Premium is non-negotiable in form.
- The *copy carries all the play*: the joke lives in Inter Black caps, deadpan, or in a lowercase serif aside. A meme concept is fine; it gets re-set in brand typography (the format is borrowed, the skin is ours).
- System-voice topics (payments, disputes, shipping rules) get zero jokes. Campaign topics (fast fashion, DM culture, fits) can go as hard as "F*ck Fast Fashion!" — once per deck, max.

---

# 6. Content Pillars

Recurring themes, each mapped to its register:

1. **Buyer education** *(system voice)* — how buying works, order tracking, cancellation windows, condition grades explained, how to read a listing. Goal: first purchase confidence.
2. **Vendor education** *(system voice, empowering)* — how to list, shoot photos on a budget, price honestly, the 72-hour handoff rule, how payouts hit your UPI. Goal: more, better listings.
3. **Doing it properly** *(campaign + system mix)* — no DM haggling, honest condition grading, hand off on time. What good looks like.
4. **Sustainability & circular fashion** *(campaign voice, one-line facts)* — landfill imagery + "keep clothes in circulation" energy; every resale is a garment saved. Never preachy; always one clean stat or line.
5. **Resale economy** *(educational, cited)* — India's ~$3.5B secondhand market growing 13%+/yr; the infrastructure story; why resale is the future of Indian fashion retail.
6. **Fashion & fits** *(campaign voice)* — drops, category spotlights (denim, vintage tees, sneakers), styling thrifted pieces, "available now" grids straight from live listings.
7. **Trust & authentication** *(system voice)* — every listing reviewed before it goes live, secure payments via Razorpay, zarketplace never sees your card details, not-as-described protection within 48 hours.
8. **Money saving** *(playful campaign)* — retail vs. resale price flexes in rupees, deal culture without "cheap" energy.
9. **Wardrobe economics** *(empowering)* — what people got for pieces they had stopped wearing, stated in rupees. The person who sold it is the protagonist.
10. **Community & culture** *(campaign voice)* — the anti-dm4price movement, thrift culture in India, gen-z fashion identity.

Content mix guidance: no pillar should exceed ~30% of a month's output; every week should touch at least one *education* pillar and one *culture* pillar.

---

# 7. Brand Inspiration

Brands whose visual or emotional language rhymes with ours — study the *why*, never copy the *what*:

- **Depop / Grailed** — resale-as-culture positioning; Grailed especially for monochrome, type-led retail UI where the merchandise is the only color.
- **SSENSE** — the proof that e-commerce can read as editorial: stark black/white chrome, typographic confidence, deadpan-intellectual social voice.
- **Off-White™ / Virgil-era graphic language** — industrial typography, quotation-mark irony, caution-stripe/hazard-tape graphic devices, helvetica-adjacent caps as a fashion statement.
- **Nike (campaign era)** — huge condensed caps + short declarative + period; one-idea-per-frame discipline.
- **Balenciaga (digital)** — brutalist web aesthetics as a luxury signal; proof that "harsh" reads as "expensive."
- **Vestiaire Collective** — trust-infrastructure storytelling for resale (verification, authentication) — their *substance*, not their softer visual style.
- **Monocle / fashion zines** — micro-caps captions, letterspaced labels, editorial grids, photography treated as full-bleed atmosphere.

The synthesis: **SSENSE's chrome, Depop's audience, Nike's copywriting discipline, Off-White's graphic irreverence — pointed at Indian resale culture.**

---

# 8. Do's and Don'ts

## Do
- Write "zarketplace" lowercase, always, everywhere.
- Let typography do the design; make the type bigger before adding anything.
- Keep chrome black & white; let product photography be the only color.
- Use sharp rectangles, hairline borders, tall buttons with tiny caps labels.
- Pair every shouted caps headline with (at most) one italic serif whisper.
- Use the `[0.16, 1, 0.3, 1]` ease and masked-reveal entrances for motion.
- Cite real numbers when making market claims.
- Keep system copy honest, exact, and calm — especially about money and shipping.
- End every asset with exactly one clear action.
- Show real listings and real garments whenever possible.

## Don't
- Don't capitalize the brand name, add "™/®" decorations to running text, or set the name in Playfair.
- Don't introduce brand colors, colored gradients, or colored status pills.
- Don't round corners on buttons, cards, or containers.
- Don't use illustration, mascots, 3D renders, or emoji-as-design.
- Don't put drop shadows on resting elements or glows on light backgrounds.
- Don't use bouncy/spring animation, spinning logos, or confetti.
- Don't fake urgency, inflate claims, or joke in payment/dispute/shipping copy.
- Don't use more than one expletive-censored headline per surface — or aim it at people.
- Don't fill whitespace. Emptiness is the brand breathing.
- Don't tint or filter product photos — color accuracy is a trust feature.

---

# 9. Design Rules

The non-negotiables, condensed for anyone producing anything:

1. **Palette:** `#000`, `#FFF`, zinc-50; grays only as black/white opacities; yellow-50/red-600/emerald/amber strictly for their functional jobs.
2. **Type:** Inter (900 for anything that labels or leads; 500–700 for reading) + Playfair Display italic lowercase for one short whisper per composition. Nothing else, ever.
3. **Case & tracking:** UPPERCASE with 0.2–0.4em tracking for all labels/micro-copy; tracking-tighter for display; the serif is always lowercase.
4. **Corners:** 0px radius. (Exceptions: circular count badges/check dots; ≤2px radius on product-image wells.)
5. **Borders:** 1px black/5 (light) or white/10 (dark) for structure; solid 1px black for callouts; 2px for selection.
6. **Buttons:** solid inversion or 1px outline; tall padding; 10–11px 900 caps labels; scale 1.05/0.95 feedback; glow only on dark heroes.
7. **Images:** product = 3:4 portrait, true color; mood = dark-scrimmed under type.
8. **Layout:** 1280px max width; one idea per section; alternate white/zinc/black bands; generous 64–96px section padding.
9. **Status & feedback:** typography carries state (weight, underline, opacity) — not colored chips.
10. **Currency:** "Rs. 1,499" — en-IN grouping, no decimals, never ₹ glyph in UI copy.
11. **Wordmark:** text-only, provided PNG assets (`wordmark-w-tp.png` on light / `wordmark-tp.png` on dark); never redraw, stretch, recolor, outline, or place on a busy area without a scrim; minimum clear space = the height of the wordmark on all sides.
12. **When extending the system:** find the closest existing pattern in the product and match it. Inventing a new pattern requires updating this document.

---

# 10. Social Media Rules

1. **Handle:** @zarketplace everywhere (Instagram, X, YouTube). Profile image: the approved pfp asset (`final-pfp.png` lineage); bio in lowercase, blunt, one line + link.
2. **Grid discipline:** the Instagram grid should read as alternating black and white tiles with occasional full-photo tiles — plan covers so no two adjacent posts share a background.
3. **Formats:** carousels for education/story (5–8 slides), single share-card posts for listings, stories for drops/offers (9:16 share-card format), reels thumbnails follow cover-slide rules.
4. **Captions:** first line does the work (it's the preview) — campaign voice, lowercase-friendly, ≤2 emoji max, then line-broken detail in system voice, then CTA ("link in bio"), then 3–6 hashtags max (#thriftindia #resale #preloved #zarketplace territory — no hashtag walls).
5. **Product posts:** always generated from real listings via the share-card system (photo + price + QR + wordmark). Never mock up fake listings.
6. **Offers:** offer content states a rupee amount and may use the caution-stripe device. Never a percentage, and never a claim the product cannot keep.
7. **Engagement voice:** replies and DMs use system voice with campaign warmth — helpful, exact, quick, no corporate templates ("Hi! Every listing is reviewed before it goes live — you're safe here.").
8. **Never post:** other platforms' watermarks, unlicensed memes with source branding, user photos without permission, colored template graphics, or anything that jokes about an active order/dispute.
9. **X (Twitter):** copy-first platform — headlines and one-liners in lowercase deadpan; screenshots of product moments; same vocabulary rules.
10. **YouTube:** thumbnails = cover-slide rules (huge caps, b/w, real photo under scrim); the sustainability/mission long-form lives here ("Why This Matters").

---

# 11. Animation Rules

For reels, motion graphics, ads, and any animated asset:

1. **Easing:** everything eases out long — `cubic-bezier(0.16, 1, 0.3, 1)` or equivalent. No linear moves (except marquees), no springs/bounces/elastic.
2. **The masked type reveal is the signature move:** lines of caps type rise from below a crop line, staggered 0.15–0.25s per line. Open every motion piece with it.
3. **Fade-rise for everything else:** 20px rise + fade, 0.5–0.8s.
4. **Photos move slow:** 1.00→1.05 scale drifts (Ken Burns energy) over 3–6s; parallax layers max ~20% travel.
5. **Marquees:** linear, seamless loop, ~25–30s/cycle, caps phrases separated by dim dividers — the launch-ticker pattern.
6. **Cuts over transitions:** hard cuts on beat; if a transition is needed, use a black or white full-frame wipe. Never crossfades, zoom-blurs, spins, or glitch packs.
7. **Type is never distorted:** no warps, waves, 3D extrusion, per-letter jumble effects. Type may move as a block or by line — that's it.
8. **Timing bands:** logo/wordmark resolve ≤1s; message hold ≥1.5s per statement; total ad ≤15s ideally.
9. **Sound (reels/ads):** trend audio is fine for campaign content; keep it deadpan-cool over hype; system-voice content (how-tos) uses clean VO or silence + type.
10. **End card:** wordmark on black (or white), one CTA line, hold 1.5s. Always the same. Familiarity is the asset.

---

# 12. Canva Guidelines

For marketers and editors building assets in Canva (or any template tool):

**Setup**
- Canvas: 1080×1080 (feed), 1080×1920 (story/reel), 1280-wide for web banners.
- Fonts: **Inter** (use Black/900 for headlines and labels — if unavailable, Inter Bold is *not* an acceptable substitute for display; install the full family) and **Playfair Display Italic**.
- Brand colors to save: `#000000`, `#FFFFFF`, `#FAFAFA`; functional-only: `#FEFCE8` (offer bg), `#DC2626` (sale/alert). Do not add more.
- Upload the wordmark PNGs (light-bg and dark-bg variants) and the pfp; never use Canva text to typeset "zarketplace" as a logo.

**Building slides**
- Margins: ≥96px on all sides at 1080 scale. Snap content to top-left or center.
- Headline: Inter Black, ALL CAPS, letter-spacing −2% to −5%, line-height 0.9, with a period.
- Micro-labels: Inter Black, ALL CAPS, 22–28px, letter-spacing +20% to +40%, 40–60% opacity.
- Whisper: Playfair Display Italic, lowercase, ~60% of headline size.
- Photos: full-bleed with a black rectangle at 60–70% opacity (or a black→transparent gradient) *under* the type; or in a 3:4 frame on `#FAFAFA` with a 1px `#000000` @5% border.
- "Buttons" on slides: sharp rectangles, solid black or white (or 1px outline), caps label at small size, generous padding. Never Canva's rounded button elements.
- Icons: Lucide set only (import SVGs) — search "lucide" and keep strokes thin and monochrome.

**Hard bans in Canva**
- No Canva stock illustrations, stickers, frames, or "elements" decoration.
- No drop-shadow, glow (except white glow behind CTAs on black), bevel, or curved text effects.
- No additional fonts "that look close." No color palettes from Canva themes.
- No rounded corners on any rectangle.
- Before exporting, self-check: *Could this slide sit inside the product without anyone noticing it was made elsewhere?* If not, fix it.

---

# 13. Future Content Instructions

Standing orders for every future request — content, design, code, campaign, or asset:

1. **This document governs.** Every future landing page, post, ad, deck, email, or feature UI is checked against BrandKit.md before shipping. If a request conflicts with this kit, flag the conflict rather than silently diverging.
2. **The product is the reference implementation.** When this document is ambiguous, open the product and find the nearest existing pattern (Home hero, ListingCard, LaunchOfferBanner, ShareInstagramModal, Footer are the canonical five). Extend; don't invent.
3. **New patterns update the kit.** If genuinely new territory is entered (a format this kit doesn't cover), design it from the system's principles, then add the decision to this document so the next person inherits it.
4. **Voice check before publish:** Is the brand name lowercase? Is the register right (campaign vs. system)? Is there exactly one CTA? Would the system voice survive a screenshot in a dispute?
5. **Visual check before publish:** black/white chrome? Inter 900 caps + tracking? Sharp corners? One idea per frame? Real photos, true color? Whitespace intact?
6. **Honesty check before publish:** every claim about payouts, shipping windows, condition checks, and market size must match the current product and policies. Run the copy against `COPY_RULES.md` before it ships.
7. **Scale assumption:** write and build as if dozens of designers, marketers, editors, and copywriters will reuse the asset as a template — name layers, keep source files, use the tokens in this kit, leave no magic values unexplained.

---

*zarketplace is an ADNIZ Private Limited project. This brand kit is an internal document — v1.0, July 2026, derived from the shipped MVP.*
