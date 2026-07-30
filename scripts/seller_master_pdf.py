#!/usr/bin/env python3
"""Builds the single three-page seller master PDF.

Supersedes the earlier two-document split: welcome, onboarding and contact in
one file to send on WhatsApp.

Design per BrandKit: monochrome only, uppercase micro-labels with wide tracking,
sharp rectangles, hairline rules, numbered black circles, one serif italic
whisper per page. No arrows, no organic shapes, no colour. Headers and footers
are deliberately thin.

Every block is measured before it is drawn and the y cursor only ever moves by
what was actually consumed, so text cannot land on text.

Run:  python3 scripts/seller_master_pdf.py
Out:  public/zarketplace-seller-guide.pdf  and  ~/Downloads/
"""
import os
import shutil
import sys

import segno
from reportlab.lib.colors import Color, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "images")
SLOTS = os.path.join(ROOT, "public", "seller-guide-slots")
BUILD = os.path.join(ROOT, "public", ".qr-build")
OUT = os.path.join(ROOT, "public", "zarketplace-seller-guide.pdf")

WHATSAPP_URL = "https://wa.me/918505927538"
SELL_URL = "https://zarketplace.com/sell"

W, H = A4
M = 40
CW = W - 2 * M
MAST = 50          # thin masthead
FOOT = 34          # thin footer reserve

SUP = "/System/Library/Fonts/Supplemental"
BLACK_F, BOLD_F, BODY_F, SERIF_F = "Helvetica-Bold", "Helvetica-Bold", "Helvetica", "Times-Italic"
for name, path, target in [("ArialBlack", f"{SUP}/Arial Black.ttf", "BLACK_F"),
                           ("ArialB", f"{SUP}/Arial Bold.ttf", "BOLD_F"),
                           ("ArialR", f"{SUP}/Arial.ttf", "BODY_F"),
                           ("DidotIt", f"{SUP}/Didot.ttc", "SERIF_F")]:
    try:
        if path.endswith(".ttc"):
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=1))
        else:
            pdfmetrics.registerFont(TTFont(name, path))
        globals()[target] = name
    except Exception:
        pass

GREY = Color(0, 0, 0, alpha=0.58)
FAINT = Color(0, 0, 0, alpha=0.34)
HAIR = Color(0, 0, 0, alpha=0.13)
WELL = Color(0, 0, 0, alpha=0.035)
W70 = Color(1, 1, 1, alpha=0.70)
W35 = Color(1, 1, 1, alpha=0.35)

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("zarketplace seller guide")
c.setAuthor("zarketplace")
c.setSubject("How to shoot, list, ship and get paid on zarketplace")
_page = [0]
y = 0.0


# --- primitives --------------------------------------------------------------
def tracked(x, yy, text, font, size, track, colour=black, align="l"):
    width = c.stringWidth(text, font, size) + track * max(len(text) - 1, 0)
    if align == "c":
        x -= width / 2
    elif align == "r":
        x -= width
    to = c.beginText(x, yy)
    to.setFont(font, size)
    to.setCharSpace(track)
    to.setFillColor(colour)
    to.textOut(text)
    c.drawText(to)
    return width


def text_w(text, font, size, track=0.0):
    """Rendered width including tracking, without drawing anything."""
    return c.stringWidth(text, font, size) + track * max(len(text) - 1, 0)


def wrap(text, font, size, max_w, track=0.0):
    def measure(t):
        return c.stringWidth(t, font, size) + track * max(len(t) - 1, 0)
    words, lines, cur = text.split(), [], ""
    for wd in words:
        trial = f"{cur} {wd}".strip()
        if measure(trial) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def block_h(text, font, size, max_w, track, lead):
    """Height a wrapped paragraph will occupy. Measured before anything draws."""
    return len(wrap(text.upper(), font, size, max_w, track)) * lead


def body(x, yy, text, size=8.2, lead=12.0, max_w=CW, colour=GREY, font=None, track=0.55):
    font = font or BODY_F
    for ln in wrap(text.upper(), font, size, max_w, track):
        tracked(x, yy, ln, font, size, track, colour)
        yy -= lead
    return yy


def rule(yy, x0=M, x1=W - M, colour=HAIR, w=0.6):
    c.setStrokeColor(colour)
    c.setLineWidth(w)
    c.line(x0, yy, x1, yy)


def circle_num(x, yy, n, r=7.5, fill=black, fg=white, size=6.6):
    c.setFillColor(fill)
    c.circle(x, yy, r, stroke=0, fill=1)
    c.setFont(BLACK_F, size)
    c.setFillColor(fg)
    c.drawCentredString(x, yy - size / 2 + 0.6, str(n))


def tick(x, yy, r=5.0, on_dark=False):
    c.setFillColor(white if on_dark else black)
    c.circle(x, yy, r, stroke=0, fill=1)
    c.setStrokeColor(black if on_dark else white)
    c.setLineWidth(1.1)
    c.lines([(x - 2.3, yy + 0.2, x - 0.7, yy - 1.7), (x - 0.7, yy - 1.7, x + 2.5, yy + 2.3)])


def cross(x, yy, r=5.0):
    c.setStrokeColor(Color(0, 0, 0, alpha=0.45))
    c.setLineWidth(0.9)
    c.rect(x - r, yy - r, r * 2, r * 2, stroke=1, fill=0)
    c.lines([(x - 2.2, yy - 2.2, x + 2.2, yy + 2.2), (x - 2.2, yy + 2.2, x + 2.2, yy - 2.2)])


def checkbox(x, yy, r=4.6):
    c.setStrokeColor(Color(0, 0, 0, alpha=0.45))
    c.setLineWidth(0.9)
    c.rect(x - r, yy - r, r * 2, r * 2, stroke=1, fill=0)


def marks(x, yy, items, w, kind="tick", size=7.6, lead=12.5, colour=GREY):
    """Marked list. Returns the y left after the last item."""
    for it in items:
        if kind == "tick":
            tick(x + 5, yy + 2.3)
        elif kind == "cross":
            cross(x + 5, yy + 2.3)
        else:
            checkbox(x + 5, yy + 2.3)
        lines = wrap(it.upper(), BOLD_F, size, w - 18, 0.8)
        for i, ln in enumerate(lines):
            tracked(x + 18, yy - i * 9.6, ln, BOLD_F, size, 0.8, colour)
        yy -= max(lead, len(lines) * 9.6 + 3)
    return yy


def marks_h(items, w, size=7.6, lead=12.5):
    """Height marks() will consume, without drawing."""
    total = 0
    for it in items:
        n = len(wrap(it.upper(), BOLD_F, size, w - 18, 0.8))
        total += max(lead, n * 9.6 + 3)
    return total


# --- slots -------------------------------------------------------------------
def slot_path(n):
    for ext in (".jpg", ".jpeg", ".png"):
        p = os.path.join(SLOTS, f"slot-{n:02d}{ext}")
        if os.path.exists(p):
            return p
    return None


def slot(n, x, yy, w, h, label, quiet=False):
    path = slot_path(n)
    if path:
        c.saveState()
        clip = c.beginPath()
        clip.rect(x, yy, w, h)
        c.clipPath(clip, stroke=0, fill=0)
        img = ImageReader(path)
        iw, ih = img.getSize()
        s = max(w / iw, h / ih)
        c.drawImage(img, x + (w - iw * s) / 2, yy + (h - ih * s) / 2, iw * s, ih * s, mask="auto")
        c.restoreState()
        c.setStrokeColor(HAIR)
        c.setLineWidth(0.6)
        c.rect(x, yy, w, h, stroke=1, fill=0)
        return
    c.setFillColor(WELL)
    c.rect(x, yy, w, h, stroke=0, fill=1)
    c.setStrokeColor(Color(0, 0, 0, alpha=0.20))
    c.setLineWidth(0.7)
    c.setDash(3, 3)
    c.rect(x, yy, w, h, stroke=1, fill=0)
    c.setDash()
    if quiet:
        tracked(x + w - 10, yy + 9, f"SLOT {n:02d} · {label.upper()}", BOLD_F, 5.6, 1.0, FAINT, align="r")
        return
    tracked(x + w / 2, yy + h / 2 + 3, f"SLOT {n:02d}", BLACK_F, 6.8, 1.5, FAINT, align="c")
    for i, ln in enumerate(wrap(label.upper(), BOLD_F, 5.6, w - 10, 0.8)):
        tracked(x + w / 2, yy + h / 2 - 8 - i * 7.5, ln, BOLD_F, 5.6, 0.8, FAINT, align="c")


def qr(url, x, yy, size, caption):
    os.makedirs(BUILD, exist_ok=True)
    fn = os.path.join(BUILD, f"qr-{abs(hash(url))}.png")
    if not os.path.exists(fn):
        segno.make(url, error="m").save(fn, scale=12, border=1, dark="#000000", light="#ffffff")
    c.setFillColor(white)
    c.rect(x, yy, size, size, stroke=0, fill=1)
    c.drawImage(ImageReader(fn), x + 3, yy + 3, size - 6, size - 6, mask="auto")
    tracked(x + size / 2, yy - 10, caption.upper(), BLACK_F, 5.6, 1.2, W70, align="c")


# --- chrome ------------------------------------------------------------------
def masthead():
    """Thin black band: wordmark and a page number. Nothing else."""
    global y
    _page[0] += 1
    c.setFillColor(black)
    c.rect(0, H - MAST, W, MAST, stroke=0, fill=1)
    mark = os.path.join(IMG, "zark-reg-tp-web.png")
    if os.path.exists(mark):
        img = ImageReader(mark)
        iw, ih = img.getSize()
        mh = 16
        c.drawImage(img, M, H - MAST + (MAST - mh) / 2, iw * (mh / ih), mh, mask="auto")
    tracked(W - M, H - MAST + 20, f"SELLER GUIDE  {_page[0]}/3", BOLD_F, 7, 1.8, W35, align="r")
    y = H - MAST - 26


def footer(label):
    rule(FOOT + 12)
    tracked(M, FOOT, label.upper(), BOLD_F, 6.2, 1.3, FAINT)
    tracked(W - M, FOOT, "zarketplace.com", BLACK_F, 6.4, 1.3, FAINT, align="r")


def section(label):
    global y
    tracked(M, y, label.upper(), BLACK_F, 8.6, 2.4, black)
    rule(y - 8)
    y -= 25


def dark(h, w=None, x=None):
    """Black panel. Width defaults to full column; pass w for a split layout."""
    yy = y - h
    c.setFillColor(black)
    c.rect(x if x is not None else M, yy, w if w is not None else CW, h, stroke=0, fill=1)
    return yy


def card(h):
    yy = y - h
    c.setStrokeColor(Color(0, 0, 0, alpha=0.35))
    c.setLineWidth(0.8)
    c.rect(M, yy, CW, h, stroke=1, fill=0)
    return yy


# =============================================================================
# PAGE 1 - welcome, how it works, the money
# =============================================================================
masthead()
y += 26

# Cover
COVER_H = 132
cy = y - COVER_H
slot(1, M, cy, CW, COVER_H, "Cover image", quiet=True)
if slot_path(1):
    c.setFillColor(Color(0, 0, 0, alpha=0.58))
    c.rect(M, cy, CW, COVER_H, stroke=0, fill=1)
    fg, sub = white, W70
else:
    fg, sub = black, GREY
tracked(M + 22, cy + COVER_H - 44, "WELCOME TO SELLING", BLACK_F, 25, -0.4, fg)
c.setFont(SERIF_F, 22)
c.setFillColor(fg)
c.drawString(M + 24, cy + COVER_H - 70, "sell your clothes. keep 100%.")
tracked(M + 24, cy + 20, "Everything you need, once. Keep this handy.", BOLD_F, 7.4, 1.5, sub)
y = cy - 26

# Four promises
section("WHY SELL HERE")
PROMISES = [("No selling fees", "We take 0%. Not a launch offer."),
            ("You keep 100%", "Your asking price is your payout."),
            ("Buyer pays shipping", "And the Buyer Protection fee."),
            ("We handle the rest", "Payments, pickup, delivery.")]
cols, gap = 4, 16
colw = (CW - gap * (cols - 1)) / cols
tallest = 0
for label, line in PROMISES:
    tallest = max(tallest, 18 + block_h(label, BLACK_F, 8, colw, 1.2, 10.5)
                  + block_h(line, BOLD_F, 6.5, colw, 0.9, 9.4))
for i, (label, line) in enumerate(PROMISES):
    x = M + i * (colw + gap)
    c.setFillColor(black)
    c.rect(x, y - 2, 13, 2.0, stroke=0, fill=1)
    ty = y - 17
    for ln in wrap(label.upper(), BLACK_F, 8, colw, 1.2):
        tracked(x, ty, ln, BLACK_F, 8, 1.2, black)
        ty -= 10.5
    ty -= 2
    for ln in wrap(line.upper(), BOLD_F, 6.5, colw, 0.9):
        tracked(x, ty, ln, BOLD_F, 6.5, 0.9, GREY)
        ty -= 9.4
y -= tallest + 18

# Timeline
section("SOLD TO PAID")
TL = ["Listed", "Sold", "Picked up", "In transit", "Delivered", "Paid"]
TH = 78
ty0 = dark(TH)
rail_y = ty0 + TH - 30
step = CW / len(TL)
c.setStrokeColor(W35)
c.setLineWidth(0.7)
c.line(M + step / 2, rail_y, M + CW - step / 2, rail_y)
for i, label in enumerate(TL):
    cx = M + step / 2 + i * step
    c.setFillColor(white)
    c.circle(cx, rail_y, 4.2, stroke=0, fill=1)
    tracked(cx, rail_y - 16, label.upper(), BLACK_F, 7, 1.3, white, align="c")
notes = "Reviewed before it goes live   ·   72 hours to hand it off   ·   48-hour review, then payout"
tracked(M + CW / 2, ty0 + 16, notes, BOLD_F, 6.4, 1.0, W70, align="c")
y = ty0 - 24

# 72-hour rule
txt = ("You have 72 hours from the moment an item sells to pack it and hand it to the courier. "
       "We book and pay for the pickup. Miss it repeatedly and you lose selling access.")
h = 26 + block_h(txt, BODY_F, 8.2, CW - 34, 0.55, 12.0)
ky = card(h)
tracked(M + 17, ky + h - 17, "THE ONE DEADLINE", BLACK_F, 8.4, 1.8, black)
body(M + 17, ky + h - 33, txt, max_w=CW - 34, colour=Color(0, 0, 0, alpha=0.72))
y = ky - 24

# The money
section("THE MONEY")
half = (CW - 26) / 2
KEEP = ["No listing fees. No selling fees. No hidden commissions.",
        "The only deduction is shipping, and only if you switch on free shipping."]
kh = 26 + sum(block_h(t, BOLD_F, 6.9, half - 32, 0.9, 10.0) for t in KEEP) + 20
my = dark(kh, half)
tracked(M + 18, my + kh - 30, "100%", BLACK_F, 27, -0.4, white)
ty = my + kh - 46
for t in KEEP:
    for ln in wrap(t.upper(), BOLD_F, 6.9, half - 32, 0.9):
        tracked(M + 18, ty, ln, BOLD_F, 6.9, 0.9, W70)
        ty -= 10.0
    ty -= 2
rx = M + half + 26
tracked(rx, y - 10, "BUYER PAYS SHIPPING", BLACK_F, 7.6, 1.6, black)
# Live values from public.shipping_categories, checked 2026-07-30. The repo's
# seed migration is stale (79/80/99/129/149) - always read the database before
# reprinting this, rates have already drifted once.
RATES = [("Accessories & small", "Rs. 99"), ("T-shirts & tops", "Rs. 149"),
         ("Jeans & bottoms", "Rs. 149"), ("Footwear", "Rs. 249"),
         ("Jackets & heavy", "Rs. 259")]
ry = y - 25
for label, rate in RATES:
    tracked(rx, ry, label.upper(), BOLD_F, 6.9, 1.0, GREY)
    tracked(W - M, ry, rate, BLACK_F, 7.2, 0.8, black, align="r")
    ry -= 11.2
y = min(my, ry) - 16
y = body(M, y, "Turn on free delivery and the courier cost comes out of your payout, so your "
               "price has to be above it. With buyer-paid shipping, price it however you like.")
footer("Page 1 of 3 · How it works")

# =============================================================================
# PAGE 2 - list it well
# =============================================================================
c.showPage()
masthead()

section("1. BEFORE YOU SHOOT")
PREP = ["Wash or steam it", "Empty every pocket", "Lace shoes neatly",
        "Include the box or dust bag"]
pw = (CW - 3 * 14) / 4
for i, item in enumerate(PREP):
    x = M + i * (pw + 14)
    tick(x + 5, y + 2.3)
    for j, ln in enumerate(wrap(item.upper(), BOLD_F, 7.2, pw - 18, 0.8)):
        tracked(x + 18, y - j * 9.4, ln, BOLD_F, 7.2, 0.8, GREY)
y -= max(20, max(len(wrap(i.upper(), BOLD_F, 7.2, pw - 18, 0.8)) for i in PREP) * 9.4 + 8)
y = body(M, y, "Small things. They show up in the photos, and in the price you get.")
y -= 18

section("2. THE SIX SHOTS")
SHOTS = [("Front", "Front of the garment", "Required"),
         ("Back", "Back of the garment", "Required"),
         ("Tag", "Brand and size tag", "Recommended"),
         ("Close-up", "Fabric or stitching", "Recommended"),
         ("Flaw", "Any flaw, honestly", "Recommended"),
         ("On-body", "Worn, if you can", "Optional")]
n, gap = 6, 9
fw = (CW - gap * (n - 1)) / n
fh = fw * 4 / 3
top = y
for i, (cap, subject, req) in enumerate(SHOTS):
    x = M + i * (fw + gap)
    slot(i + 2, x, top - fh, fw, fh, subject)
    tracked(x + fw / 2, top - fh - 12, cap.upper(), BLACK_F, 6.0, 1.0, black, align="c")
    tracked(x + fw / 2, top - fh - 21, req.upper(), BOLD_F, 5.1, 0.9,
            GREY if req == "Required" else FAINT, align="c")
y = top - fh - 36

USE = ["Natural daylight", "Clean, uncluttered background", "Shot straight on",
       "The whole item in frame", "Close-ups of tags and logos", "Every flaw, honestly"]
AVOID = ["Screenshots or stock photos", "Heavy filters", "Dark rooms",
         "Cluttered mirror shots", "Blurry frames", "Angles that hide damage"]
half = (CW - 26) / 2
tracked(M, y, "USE", BLACK_F, 7.2, 1.8, black)
tracked(M + half + 26, y, "AVOID", BLACK_F, 7.2, 1.8, black)
ly = marks(M, y - 15, USE, half, "tick", lead=11.4)
ry = marks(M + half + 26, y - 15, AVOID, half, "cross", lead=11.4)
y = min(ly, ry) - 10

TIPS = [("Cleaner photos",
         "PhotoRoom or remove.bg strip a messy background for free. A plain backdrop "
         "makes a phone photo look shot for a catalogue."),
        ("Can't write the description?",
         "Upload your photo to ChatGPT and ask it for a zarketplace description. Read it "
         "back and fix anything that isn't true of your item. You own what it says.")]
th = 16
for t, d in TIPS:
    th += 11 + block_h(d, BODY_F, 7.4, CW - 34, 0.55, 10.6) + 7
ty0 = card(th)
ty = ty0 + th - 15
for t, d in TIPS:
    tracked(M + 17, ty, t.upper(), BLACK_F, 7.4, 1.4, black)
    ty -= 11
    ty = body(M + 17, ty, d, size=7.4, lead=10.6, max_w=CW - 34,
              colour=Color(0, 0, 0, alpha=0.66))
    ty -= 7
y = ty0 - 22

section("3. GOOD LISTING, BAD LISTING")
cw2 = (CW - 22) / 2
ch = 112
top = y
for i, (t, d) in enumerate([("This sells", "Lit, straight on, plain background, whole garment."),
                            ("This doesn't", "Dim, cluttered, cropped, filtered.")]):
    x = M + i * (cw2 + 22)
    slot(8 + i, x, top - ch, cw2, ch, t)
    tracked(x, top - ch - 13, t.upper(), BLACK_F, 7.6, 1.3, black)
    tracked(x, top - ch - 23, d.upper(), BOLD_F, 6.4, 0.9, GREY)
y = top - ch - 34
footer("Page 2 of 3 · Listing well")

# =============================================================================
# PAGE 3 - after the sale, standards, help
# =============================================================================
c.showPage()
masthead()

section("4. ONE LISTING = ONE ITEM")
half = (CW - 26) / 2
tracked(M, y, "YES", BLACK_F, 7.2, 1.8, black)
tracked(M + half + 26, y, "NO", BLACK_F, 7.2, 1.8, black)
ly = marks(M, y - 15, ["One hoodie", "One jacket", "One pair of sneakers"], half, "tick", lead=11.4)
ry = marks(M + half + 26, y - 15,
           ['"Multiple colours available"', '"All sizes available"', '"DM before buying"'],
           half, "cross", lead=11.4)
y = min(ly, ry) - 6
y = body(M, y, "Own five identical tees? Five listings. The form rejects bundle phrasing "
               "automatically. Brand, size, colour and condition are fields; material and "
               "original retail price go in the description.")
y -= 12

section("5. AFTER IT SELLS")
STEPS = [("We notify you", "Straight away."),
         ("Pack it", "The exact item, clean, with everything shown."),
         ("We collect", "Doorstep pickup, booked and paid by us."),
         ("Track it", "Seller Portal, then Sales.")]
cols, gap = 4, 16
colw = (CW - gap * (cols - 1)) / cols
tallest = 0
for label, sub in STEPS:
    tallest = max(tallest, 14 + block_h(label, BLACK_F, 7.8, colw - 24, 1.3, 10.4)
                  + block_h(sub, BOLD_F, 6.5, colw - 24, 0.9, 9.4))
for i, (label, sub) in enumerate(STEPS):
    x = M + i * (colw + gap)
    circle_num(x + 8, y - 4, i + 1)
    ty = y - 7
    for ln in wrap(label.upper(), BLACK_F, 7.8, colw - 24, 1.3):
        tracked(x + 23, ty, ln, BLACK_F, 7.8, 1.3, black)
        ty -= 10.4
    ty -= 2
    for ln in wrap(sub.upper(), BOLD_F, 6.5, colw - 24, 0.9):
        tracked(x + 23, ty, ln, BOLD_F, 6.5, 0.9, GREY)
        ty -= 9.4
y -= tallest + 14
y = body(M, y, "Any clean, secure packaging is fine. A courier bag, a box, recycled "
               "packaging, as long as it protects the item.")
y -= 10

HELD = ["The buyer has received the item.", "The 48-hour review window has closed."]
THEN = ["Paid to the UPI ID on your listing, at your full asking price.",
        "Your UPI and Instagram lock on submit. Check them before you publish."]
half = (CW - 46) / 2
ph = 26 + max(sum(block_h(t, BOLD_F, 6.9, half, 0.9, 10.0) + 3 for t in HELD),
              sum(block_h(t, BOLD_F, 6.9, half, 0.9, 10.0) + 3 for t in THEN))
py = dark(ph)
tracked(M + 18, py + ph - 20, "HELD UNTIL BOTH ARE TRUE", BLACK_F, 7.6, 1.7, white)
ty = py + ph - 36
for t in HELD:
    for ln in wrap(t.upper(), BOLD_F, 6.9, half, 0.9):
        tracked(M + 18, ty, ln, BOLD_F, 6.9, 0.9, W70)
        ty -= 10.0
    ty -= 3
x2 = M + half + 36
tracked(x2, py + ph - 20, "THEN RELEASED", BLACK_F, 7.6, 1.7, white)
ty = py + ph - 36
for t in THEN:
    for ln in wrap(t.upper(), BOLD_F, 6.9, half, 0.9):
        tracked(x2, ty, ln, BOLD_F, 6.9, 0.9, W70)
        ty -= 10.0
    ty -= 3
y = py - 24

section("6. THE CONDITION SCALE")
GRADES = [("5/5", "Pristine", "Never worn, or worn once. No visible wear."),
          ("4/5", "Great", "Lightly worn, well kept. No major flaws."),
          ("3/5", "Good", "Some wear. Slight fading or small imperfections."),
          ("2/5", "Fair", "Noticeable wear. Fading, loose threads, minor marks."),
          ("1/5", "As Is", "Thrashed. Stains, holes or broken hardware.")]
for g, name, desc in GRADES:
    tracked(M, y, g, BLACK_F, 7.6, 1.0, black)
    tracked(M + 26, y, name.upper(), BLACK_F, 7.6, 1.4, black)
    tracked(M + 104, y, desc.upper(), BOLD_F, 6.8, 0.9, GREY)
    y -= 12.4
y -= 8

section("7. NEVER LIST")
NEVER = ["Counterfeit or replica items", "Stolen goods", "Misleading listings",
         "A different item than shown", "Hidden damage"]
half = (CW - 26) / 2
mid = 3
ly = marks(M, y, NEVER[:mid], half, "cross", lead=11.4)
ry = marks(M + half + 26, y, NEVER[mid:], half, "cross", lead=11.4)
y = min(ly, ry) - 4
y = body(M, y, "Repeated violations get listings removed and accounts suspended. "
               "Not sure if something is allowed? Ask before you list.")
y -= 10

section("8. BEFORE YOU PUBLISH")
CHECK = ["Item cleaned", "Photos taken", "All flaws shown",
         "Description written", "Price set", "Ready to sell"]
half = (CW - 26) / 2
ly = marks(M, y, CHECK[:3], half, "box", lead=13.0)
ry = marks(M + half + 26, y, CHECK[3:], half, "box", lead=13.0)
y = min(ly, ry) - 10

# Help
hh = 100
hy = dark(hh)
tracked(M + 20, hy + hh - 26, "STUCK? MESSAGE US.", BLACK_F, 13, 1.3, white)
vanity_w = text_w("8505-ZARKET", BLACK_F, 19, 0.4)
tracked(M + 20, hy + hh - 50, "8505-ZARKET", BLACK_F, 19, 0.4, white)
tracked(M + 20 + vanity_w + 10, hy + hh - 50, "(8505-927538)", BOLD_F, 8, 0.8, W35)
ty = hy + hh - 68
tracked(M + 20, ty, "contact@zarketplace.com   ·   @zarketplace", BOLD_F, 6.8, 0.9, white)
ty -= 11
for ln in ["Listings · pickups · shipping · payouts · disputes · account issues.",
           "Just reply to the WhatsApp chat."]:
    tracked(M + 20, ty, ln.upper(), BOLD_F, 6.6, 0.9, W70)
    ty -= 10
qs = 52
qr(WHATSAPP_URL, W - M - 20 - qs * 2 - 22, hy + 26, qs, "chat to us")
qr(SELL_URL, W - M - 20 - qs, hy + 26, qs, "start a listing")
footer("Page 3 of 3 · Thanks for helping build India's best marketplace for pre-loved fashion")

c.save()
shutil.rmtree(BUILD, ignore_errors=True)

dl = os.path.expanduser("~/Downloads/zarketplace-seller-guide.pdf")
shutil.copyfile(OUT, dl)
print(f"wrote {OUT}\nwrote {dl}")
