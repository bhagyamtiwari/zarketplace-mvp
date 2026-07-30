#!/usr/bin/env python3
"""Generates both seller PDFs from scripts/seller_content.py.

Layout follows BrandKit: monochrome, uppercase micro-labels with wide tracking,
sharp rectangles, hairline rules, numbered black circles. No connector arrows,
no diagram shapes beyond circles and rules, one serif italic whisper per cover.

Images are numbered slots. Drop files named slot-01.jpg .. slot-13.jpg into
public/seller-guide-slots/ and rerun; until then each slot draws as an empty
framed box printing its own number and subject, so the layout never shifts.

Run:  python3 scripts/seller_pdfs.py
Out:  public/zarketplace-welcome-pack.pdf
      public/zarketplace-seller-guide.pdf
"""
import os
import sys

from reportlab.lib.colors import Color, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seller_content as T  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "images")
SLOTS = os.path.join(ROOT, "public", "seller-guide-slots")

W, H = A4
M = 40
CW = W - 2 * M

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
FAINT = Color(0, 0, 0, alpha=0.32)
HAIR = Color(0, 0, 0, alpha=0.13)
WELL = Color(0, 0, 0, alpha=0.035)
W70 = Color(1, 1, 1, alpha=0.70)
W30 = Color(1, 1, 1, alpha=0.30)


class Doc:
    """Thin wrapper holding the canvas and a running y cursor."""

    def __init__(self, path, kicker):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle(os.path.basename(path))
        self.c.setAuthor("zarketplace")
        self.kicker = kicker
        self.page = 0
        self.y = 0

    # -- primitives ----------------------------------------------------------
    def tracked(self, x, y, text, font, size, track, colour=black, align="l"):
        width = self.c.stringWidth(text, font, size) + track * max(len(text) - 1, 0)
        if align == "c":
            x -= width / 2
        elif align == "r":
            x -= width
        to = self.c.beginText(x, y)
        to.setFont(font, size)
        to.setCharSpace(track)
        to.setFillColor(colour)
        to.textOut(text)
        self.c.drawText(to)
        return width

    def wrap(self, text, font, size, max_w, track=0.0):
        def measure(t):
            return self.c.stringWidth(t, font, size) + track * max(len(t) - 1, 0)
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

    def body(self, x, y, text, size=8.2, lead=12.2, max_w=CW, colour=GREY, font=None, track=0.55):
        font = font or BODY_F
        for ln in self.wrap(text.upper(), font, size, max_w, track):
            self.tracked(x, y, ln, font, size, track, colour)
            y -= lead
        return y

    def rule(self, y, x0=M, x1=W - M, colour=HAIR, w=0.6):
        self.c.setStrokeColor(colour)
        self.c.setLineWidth(w)
        self.c.line(x0, y, x1, y)

    def circle_num(self, x, y, n, r=8, fill=black, fg=white, size=7):
        self.c.setFillColor(fill)
        self.c.circle(x, y, r, stroke=0, fill=1)
        self.c.setFont(BLACK_F, size)
        self.c.setFillColor(fg)
        self.c.drawCentredString(x, y - size / 2 + 0.7, str(n))

    def check_mark(self, x, y, ok=True, r=5.5):
        """Brand marks, not emoji: filled circle + tick, or hairline square + cross."""
        if ok:
            self.c.setFillColor(black)
            self.c.circle(x, y, r, stroke=0, fill=1)
            self.c.setStrokeColor(white)
            self.c.setLineWidth(1.2)
            self.c.lines([(x - 2.6, y + 0.2, x - 0.8, y - 2.0), (x - 0.8, y - 2.0, x + 2.8, y + 2.6)])
        else:
            self.c.setStrokeColor(Color(0, 0, 0, alpha=0.45))
            self.c.setLineWidth(0.9)
            self.c.rect(x - r, y - r, r * 2, r * 2, stroke=1, fill=0)
            self.c.lines([(x - 2.4, y - 2.4, x + 2.4, y + 2.4), (x - 2.4, y + 2.4, x + 2.4, y - 2.4)])

    # -- slots ---------------------------------------------------------------
    def slot(self, n, x, y, w, h, label, quiet=False):
        """A numbered image slot. Draws the photo if present, a labelled frame if not."""
        path = None
        for ext in (".jpg", ".jpeg", ".png"):
            p = os.path.join(SLOTS, f"slot-{n:02d}{ext}")
            if os.path.exists(p):
                path = p
                break
        if path:
            self.c.saveState()
            clip = self.c.beginPath()
            clip.rect(x, y, w, h)
            self.c.clipPath(clip, stroke=0, fill=0)
            img = ImageReader(path)
            iw, ih = img.getSize()
            s = max(w / iw, h / ih)
            self.c.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2,
                             iw * s, ih * s, mask="auto")
            self.c.restoreState()
            self.c.setStrokeColor(HAIR)
            self.c.setLineWidth(0.6)
            self.c.rect(x, y, w, h, stroke=1, fill=0)
        else:
            self.c.setFillColor(WELL)
            self.c.rect(x, y, w, h, stroke=0, fill=1)
            self.c.setStrokeColor(Color(0, 0, 0, alpha=0.22))
            self.c.setLineWidth(0.7)
            self.c.setDash(3, 3)
            self.c.rect(x, y, w, h, stroke=1, fill=0)
            self.c.setDash()
            if quiet:
                # Cover: caption sits in the corner so it never sits under the
                # headline that is drawn on top of this frame.
                self.tracked(x + w - 10, y + 9, f"SLOT {n:02d} · {label.upper()}", BOLD_F, 5.6,
                             1.0, Color(0, 0, 0, alpha=0.35), align="r")
            else:
                self.tracked(x + w / 2, y + h / 2 + 4, f"SLOT {n:02d}", BLACK_F, 7, 1.6,
                             Color(0, 0, 0, alpha=0.40), align="c")
                for i, ln in enumerate(self.wrap(label.upper(), BOLD_F, 5.8, w - 12, 0.8)):
                    self.tracked(x + w / 2, y + h / 2 - 7 - i * 8, ln, BOLD_F, 5.8, 0.8,
                                 Color(0, 0, 0, alpha=0.32), align="c")

    def cover(self, n, h, head, whisper, sub=None):
        """Full-width cover band: photo slot, scrim, headline, serif whisper."""
        y = self.y - h
        self.slot(n, M, y, CW, h, "Cover image", quiet=True)
        if any(os.path.exists(os.path.join(SLOTS, f"slot-{n:02d}{e}"))
               for e in (".jpg", ".jpeg", ".png")):
            self.c.setFillColor(Color(0, 0, 0, alpha=0.58))
            self.c.rect(M, y, CW, h, stroke=0, fill=1)
            fg, sub_fg = white, W70
        else:
            fg, sub_fg = black, GREY
        self.tracked(M + 22, y + h - 46, head, BLACK_F, 26, -0.4, fg)
        self.c.setFont(SERIF_F, 24)
        self.c.setFillColor(fg)
        self.c.drawString(M + 24, y + h - 74, whisper)
        if sub:
            self.tracked(M + 24, y + 20, sub, BOLD_F, 7.6, 1.5, sub_fg)
        self.y = y - 30

    # -- chrome --------------------------------------------------------------
    def masthead(self, total=2):
        self.page += 1
        bh = 60
        self.c.setFillColor(black)
        self.c.rect(0, H - bh, W, bh, stroke=0, fill=1)
        mark = os.path.join(IMG, "zark-reg-tp-web.png")
        if os.path.exists(mark):
            img = ImageReader(mark)
            iw, ih = img.getSize()
            mh = 19
            self.c.drawImage(img, M, H - bh + (bh - mh) / 2, iw * (mh / ih), mh, mask="auto")
        self.tracked(W - M, H - bh + 33, self.kicker, BLACK_F, 8, 2.2, white, align="r")
        self.tracked(W - M, H - bh + 19, f"{self.page} OF {total}", BOLD_F, 7, 1.8, W30, align="r")
        self.y = H - bh - 30

    def footer(self, text):
        self.rule(M + 21)
        self.tracked(M, M + 9, text, BOLD_F, 6.6, 1.4, FAINT)
        self.tracked(W - M, M + 9, "zarketplace.com", BLACK_F, 6.8, 1.4, FAINT, align="r")

    def section(self, label):
        self.tracked(M, self.y, label, BLACK_F, 9, 2.5, black)
        self.rule(self.y - 8)
        self.y -= 26

    def dark_block(self, h):
        y = self.y - h
        self.c.setFillColor(black)
        self.c.rect(M, y, CW, h, stroke=0, fill=1)
        return y

    def steps(self, items, cols=3, gap=22):
        """Numbered steps on a measured grid. Circles and hairlines, never arrows."""
        colw = (CW - gap * (cols - 1)) / cols
        textw = colw - 26
        rows = (len(items) + cols - 1) // cols
        # Height of the tallest cell in each row, so rows never collide.
        heights = []
        for r in range(rows):
            tallest = 0
            for label, sub in items[r * cols:(r + 1) * cols]:
                nl = len(self.wrap(label.upper(), BLACK_F, 8.2, textw, 1.4))
                ns = len(self.wrap(sub.upper(), BOLD_F, 6.6, textw, 0.9))
                tallest = max(tallest, nl * 11 + ns * 9.6 + 12)
            heights.append(tallest)

        y0 = self.y
        for i, (label, sub) in enumerate(items):
            r, cidx = divmod(i, cols)
            x = M + cidx * (colw + gap)
            yy = y0 - sum(heights[:r])
            self.circle_num(x + 9, yy - 5, i + 1)
            ty = yy - 8
            for ln in self.wrap(label.upper(), BLACK_F, 8.2, textw, 1.4):
                self.tracked(x + 26, ty, ln, BLACK_F, 8.2, 1.4, black)
                ty -= 11
            ty -= 3
            for ln in self.wrap(sub.upper(), BOLD_F, 6.6, textw, 0.9):
                self.tracked(x + 26, ty, ln, BOLD_F, 6.6, 0.9, GREY)
                ty -= 9.6
        self.y = y0 - sum(heights)

    def note(self, text):
        """A quiet aside, offset by a short black rule."""
        self.c.setStrokeColor(black)
        self.c.setLineWidth(1.4)
        self.c.line(M, self.y + 6, M + 16, self.y + 6)
        self.y = self.body(M + 26, self.y, text, max_w=CW - 26, colour=Color(0, 0, 0, alpha=0.72))
        self.y -= 10

    def bullets(self, x, y, items, w, ok=None, size=7.6, lead=13):
        for it in items:
            if ok is None:
                self.c.setFillColor(black)
                self.c.circle(x + 2, y + 2.4, 1.6, stroke=0, fill=1)
                tx = x + 10
            else:
                self.check_mark(x + 5.5, y + 2.4, ok)
                tx = x + 18
            for i, ln in enumerate(self.wrap(it.upper(), BOLD_F, size, w - (tx - x), 0.8)):
                self.tracked(tx, y - i * 10, ln, BOLD_F, size, 0.8, GREY)
                y -= 0 if i == 0 else 10
            y -= lead
        return y

    def save(self):
        self.c.save()


# =============================================================================
# Document 1 - welcome pack
# =============================================================================
def build_welcome(path):
    d = Doc(path, T.D1_KICKER)

    # --- page 1 --------------------------------------------------------------
    d.masthead()
    d.y += 30
    d.cover(1, 150, T.D1_HEAD, T.D1_WHISPER, T.D1_INTRO)

    d.section("WHY SELL HERE")
    cols, gap = 4, 18
    colw = (CW - gap * (cols - 1)) / cols
    tallest = 0
    for _icon, label, line in T.PROMISES:
        nl = len(d.wrap(label.upper(), BLACK_F, 8.2, colw, 1.2))
        ns = len(d.wrap(line.upper(), BOLD_F, 6.6, colw, 0.9))
        tallest = max(tallest, 22 + nl * 11 + ns * 9.6)
    for i, (_icon, label, line) in enumerate(T.PROMISES):
        x = M + i * (colw + gap)
        d.c.setFillColor(black)
        d.c.rect(x, d.y - 2, 14, 2.2, stroke=0, fill=1)
        ty = d.y - 19
        for ln in d.wrap(label.upper(), BLACK_F, 8.2, colw, 1.2):
            d.tracked(x, ty, ln, BLACK_F, 8.2, 1.2, black)
            ty -= 11
        ty -= 2
        for ln in d.wrap(line.upper(), BOLD_F, 6.6, colw, 0.9):
            d.tracked(x, ty, ln, BOLD_F, 6.6, 0.9, GREY)
            ty -= 9.6
    d.y -= tallest + 16

    d.section("HOW SELLING WORKS")
    d.steps(T.HOW_SELLING, cols=3)
    d.y -= 18

    bh = 84
    by = d.dark_block(bh)
    d.tracked(M + 22, by + bh - 34, T.KEEP_HEAD, BLACK_F, 34, -0.5, white)
    ty = by + bh - 30
    for ln in T.KEEP_LINES:
        for wln in d.wrap(ln.upper(), BOLD_F, 7.2, CW - 150, 0.9):
            d.tracked(M + 130, ty, wln, BOLD_F, 7.2, 0.9, W70)
            ty -= 10.4
        ty -= 2
    d.y -= 22
    d.section("ONE LISTING = ONE ITEM")
    half = (CW - 30) / 2
    d.tracked(M, d.y, "ALLOWED", BLACK_F, 7, 1.8, black)
    ly = d.bullets(M, d.y - 16, T.ALLOWED, half, ok=True)
    d.tracked(M + half + 30, d.y, "NOT ALLOWED", BLACK_F, 7, 1.8, black)
    ry = d.bullets(M + half + 30, d.y - 16, T.NOT_ALLOWED, half, ok=False)
    d.y = min(ly, ry) - 4
    d.note(T.ONE_ITEM_NOTE)

    d.footer("Page 1 of 2  ·  Welcome")

    # --- page 2 --------------------------------------------------------------
    d.c.showPage()
    d.masthead()

    d.section("GREAT PHOTOS SELL FASTER")
    n = len(T.PHOTO_SLOTS)
    gap = 9
    fw = (CW - gap * (n - 1)) / n
    fh = fw * 4 / 3
    top = d.y
    caption_lines = 1
    for caption, subject, required in T.PHOTO_SLOTS:
        caption_lines = max(caption_lines, len(d.wrap(caption.upper(), BLACK_F, 5.9, fw, 1.0)))
    for i, (caption, subject, required) in enumerate(T.PHOTO_SLOTS):
        x = M + i * (fw + gap)
        d.slot(i + 2, x, top - fh, fw, fh, subject)
        cy = top - fh - 12
        for ln in d.wrap(caption.upper(), BLACK_F, 5.9, fw, 1.0):
            d.tracked(x + fw / 2, cy, ln, BLACK_F, 5.9, 1.0, black, align="c")
            cy -= 8
        d.tracked(x + fw / 2, top - fh - 12 - caption_lines * 8 - 1,
                  "REQUIRED" if required else "RECOMMENDED",
                  BOLD_F, 5.1, 0.9, GREY if required else FAINT, align="c")
    d.y = top - fh - 38 - caption_lines * 8

    d.tracked(M, d.y, "USE", BLACK_F, 7, 1.8, black)
    d.tracked(M + half + 30, d.y, "SKIP", BLACK_F, 7, 1.8, black)
    ly = d.bullets(M, d.y - 15, T.PHOTO_USE, half, lead=11)
    ry = d.bullets(M + half + 30, d.y - 15, T.PHOTO_SKIP, half, lead=11)
    d.y = min(ly, ry) - 10
    d.note(T.PHOTO_NOTE)

    cw2 = (CW - 22) / 2
    ch = 92
    top = d.y
    for i, (title, sub) in enumerate(T.COMPARE):
        x = M + i * (cw2 + 22)
        d.slot(8 + i, x, top - ch, cw2, ch, title)
        d.tracked(x, top - ch - 13, title.upper(), BLACK_F, 7.6, 1.3, black)
        d.tracked(x, top - ch - 23, sub.upper(), BOLD_F, 6.4, 0.9, GREY)
    d.y = top - ch - 40

    d.section("DESCRIBE IT ACCURATELY")
    x = M
    for chip in T.DESCRIBE_CHIPS:
        wd = d.c.stringWidth(chip.upper(), BLACK_F, 7) + 1.4 * len(chip) + 20
        d.c.setStrokeColor(black)
        d.c.setLineWidth(0.9)
        d.c.rect(x, d.y - 6, wd, 20, stroke=1, fill=0)
        d.tracked(x + 10, d.y, chip.upper(), BLACK_F, 7, 1.4, black)
        x += wd + 8
    d.y -= 26
    d.y = d.body(M, d.y, T.DESCRIBE_NOTE)
    d.y -= 12

    d.section("PRICE IT FAIRLY")
    d.y = d.body(M, d.y, T.PRICE_NOTE)
    d.y -= 16

    hh = 92
    hy = d.dark_block(hh)
    ty = hy + hh - 26
    d.tracked(M + 22, ty, T.HELP_HEAD, BLACK_F, 13, 1.4, white)
    ty -= 24
    d.tracked(M + 22, ty, T.WHATSAPP, BLACK_F, 15, 0.6, white)
    ty -= 18
    for ln in T.HELP_LINES:
        d.tracked(M + 22, ty, ln.upper(), BOLD_F, 6.8, 0.9, W70)
        ty -= 10
    d.tracked(W - M - 22, hy + hh - 50, T.EMAIL, BLACK_F, 8.6, 0.6, white, align="r")
    d.tracked(W - M - 22, hy + hh - 64, T.INSTAGRAM, BOLD_F, 7.4, 1.0, W70, align="r")
    d.footer("Page 2 of 2  ·  Listing well")

    d.save()
    return path


# =============================================================================
# Document 2 - guide and FAQ
# =============================================================================
def build_guide(path):
    d = Doc(path, T.D2_KICKER)

    # --- page 1 --------------------------------------------------------------
    d.masthead()
    d.y += 30
    d.cover(10, 130, T.D2_HEAD, T.D2_WHISPER)

    d.section("AFTER YOUR ITEM SELLS")
    d.steps(T.AFTER_SALE, cols=3)
    d.y -= 14
    d.note(T.DEADLINE_NOTE)
    d.y -= 6

    d.section("PACKING")
    n = len(T.PACK_SLOTS)
    gap = 16
    pw = (CW - gap * (n - 1)) / n
    ph = pw * 3 / 4
    top = d.y
    for i, name in enumerate(T.PACK_SLOTS):
        x = M + i * (pw + gap)
        d.slot(11 + i, x, top - ph, pw, ph, name)
        d.tracked(x, top - ph - 13, name.upper(), BLACK_F, 6.8, 1.2, black)
    d.y = top - ph - 30
    d.y = d.bullets(M, d.y, T.PACK_TIPS, CW, lead=11.5)
    d.y -= 12

    bh = 96
    by = d.dark_block(bh)
    half = (CW - 60) / 2
    d.tracked(M + 22, by + bh - 26, "HELD UNTIL BOTH ARE TRUE", BLACK_F, 8, 1.8, white)
    ty = by + bh - 44
    for ln in T.PAYOUT_HELD:
        for wln in d.wrap(ln.upper(), BOLD_F, 7, half, 0.9):
            d.tracked(M + 22, ty, wln, BOLD_F, 7, 0.9, W70)
            ty -= 10
        ty -= 3
    x2 = M + half + 60
    d.tracked(x2, by + bh - 26, "THEN RELEASED", BLACK_F, 8, 1.8, white)
    ty = by + bh - 44
    for ln in T.PAYOUT_THEN:
        for wln in d.wrap(ln.upper(), BOLD_F, 7, half, 0.9):
            d.tracked(x2, ty, wln, BOLD_F, 7, 0.9, W70)
            ty -= 10
        ty -= 3
    d.footer("Page 1 of 2  ·  After the sale")

    # --- page 2 --------------------------------------------------------------
    d.c.showPage()
    d.masthead()

    d.section("NEED TO CHANGE A LISTING?")
    d.y = d.body(M, d.y, T.EDIT_NOTE)
    d.y -= 16

    d.section("WHAT ISN'T ALLOWED")
    half = (CW - 30) / 2
    mid = (len(T.BANNED) + 1) // 2
    ly = d.bullets(M, d.y, T.BANNED[:mid], half, ok=False, lead=13)
    ry = d.bullets(M + half + 30, d.y, T.BANNED[mid:], half, ok=False, lead=13)
    d.y = min(ly, ry) - 2
    d.note(T.BANNED_NOTE)

    d.section("FREQUENTLY ASKED")
    colw = (CW - 30) / 2
    ys = [d.y, d.y]
    for i, (q, a) in enumerate(T.FAQ):
        col = 0 if i < 3 else 1
        x = M + col * (colw + 30)
        yy = ys[col]
        d.tracked(x, yy, q.upper(), BLACK_F, 7.6, 1.3, black)
        yy -= 12
        for ln in d.wrap(a.upper(), BOLD_F, 6.8, colw, 0.9):
            d.tracked(x, yy, ln, BOLD_F, 6.8, 0.9, GREY)
            yy -= 9.8
        ys[col] = yy - 12
    d.y = min(ys) - 4

    d.section("BEFORE YOU LIST")
    colw = (CW - 30) / 2
    for i, item in enumerate(T.CHECKLIST):
        col, row = divmod(i, 3)
        x = M + col * (colw + 30)
        yy = d.y - row * 17
        d.c.setStrokeColor(black)
        d.c.setLineWidth(0.9)
        d.c.rect(x, yy - 6, 8, 8, stroke=1, fill=0)
        d.tracked(x + 17, yy - 4, item.upper(), BOLD_F, 7.4, 0.9, GREY)
    d.y -= 3 * 17 + 14

    d.section("WHO PAYS WHAT")
    half = (CW - 40) / 2
    d.tracked(M, d.y, "BUYER PAYS SHIPPING AT CHECKOUT", BLACK_F, 7.4, 1.5, black)
    ry = d.y - 16
    for label, rate in T.SHIPPING:
        d.tracked(M, ry, label.upper(), BOLD_F, 7, 1.0, GREY)
        d.tracked(M + half, ry, rate, BLACK_F, 7.4, 0.8, black, align="r")
        ry -= 11.6
    x2 = M + half + 40
    d.tracked(x2, d.y, "YOU PAY NOTHING", BLACK_F, 7.4, 1.5, black)
    d.body(x2, d.y - 16, "Unless you switch on free shipping for a listing, in which "
                         "case that cost comes out of your payout. Everything else, "
                         "including Buyer Protection, is on the buyer.",
           size=7, lead=10.4, max_w=half, track=0.55)
    d.y = ry - 18

    ch = 88
    cy = d.dark_block(ch)
    d.tracked(M + 22, cy + ch - 32, T.CLOSING_HEAD, BLACK_F, 17, 0.8, white)
    d.c.setFont(SERIF_F, 16)
    d.c.setFillColor(W70)
    d.c.drawString(M + 24, cy + ch - 56, T.CLOSING_WHISPER)
    d.tracked(W - M - 22, cy + ch - 34, "WHATSAPP", BLACK_F, 6.8, 1.8, W30, align="r")
    d.tracked(W - M - 22, cy + ch - 52, T.WHATSAPP, BLACK_F, 11, 0.6, white, align="r")
    d.footer("Page 2 of 2  ·  Guide and FAQ")

    d.save()
    return path


if __name__ == "__main__":
    os.makedirs(SLOTS, exist_ok=True)
    a = build_welcome(os.path.join(ROOT, "public", "zarketplace-welcome-pack.pdf"))
    b = build_guide(os.path.join(ROOT, "public", "zarketplace-seller-guide.pdf"))
    print(f"wrote {a}\nwrote {b}")
