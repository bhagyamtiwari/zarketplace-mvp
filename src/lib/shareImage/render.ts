// Draws a share image on a canvas. The design system it implements, and the
// reasoning behind every number here, is docs/SHARE_IMAGE_SYSTEM.md.
//
// Order of work: read the photo (analyse.ts), pick the layout it suits, set
// the type block (its height decides how much room the garment gets), then
// paint paper, photo and type. The garment is never painted over.

import type { ShareData } from './data';
import { analysePhoto, bestWindow, luminance, type PhotoAnalysis, type RGB } from './analyse';
// qr.js: a small QR encoder, used only for the optional print QR.
import QRCodeImpl from 'qr.js/lib/QRCode';
import ErrorCorrectLevel from 'qr.js/lib/ErrorCorrectLevel';

export type ShareFormat = 'square' | 'story';
export type ShareLayout = 'auto' | 'float' | 'plate' | 'full';
type Layout = Exclude<ShareLayout, 'auto'>;

const FONT = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';

interface Spec {
  W: number; H: number; margin: number;
  brand: number; name: number; price: number; details: number; sig: number;
  gapBrandName: number; gapNameNext: number; gapPriceDetails: number; gapDetailsSig: number;
  /** Lowest point any text may reach. On a story, above Instagram's reply bar. */
  textBottom: number;
  /** Where a floated garment may start. On a story, below Instagram's top bar. */
  floatTop: number;
  qr: number;
}

const SPECS: Record<ShareFormat, Spec> = {
  square: {
    W: 1080, H: 1080, margin: 72,
    brand: 23, name: 42, price: 36, details: 23, sig: 23,
    gapBrandName: 12, gapNameNext: 20, gapPriceDetails: 14, gapDetailsSig: 18,
    textBottom: 1080 - 60, floatTop: 64, qr: 120,
  },
  story: {
    W: 1080, H: 1920, margin: 84,
    brand: 30, name: 56, price: 46, details: 29, sig: 29,
    gapBrandName: 16, gapNameNext: 26, gapPriceDetails: 18, gapDetailsSig: 40,
    textBottom: 1920 - 300, floatTop: 180, qr: 160,
  },
};

// Inter's ascent and descent as fractions of the size, for setting baselines.
const ASC = 0.92;
const DESC = 0.26;
const NAME_LEADING = 1.14;
const BRAND_TRACKING = 0.14;

// ---------------------------------------------------------------- colour ---

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const css = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

const LIGHT_PAPER: RGB = [244, 242, 238];
const DARK_INK: RGB = [20, 20, 20];
const LIGHT_INK: RGB = [244, 242, 238];

/** Plate paper: a near-white (or near-black) carrying a trace of the garment's hue. */
function platePaper(a: PhotoAnalysis | null): RGB {
  if (!a) return LIGHT_PAPER;
  const [h, s] = rgbToHsl(a.garment);
  const light = a.lum > 0.28;
  return hslToRgb(h, Math.min(s, 0.35) * 0.35, light ? 0.952 : 0.085);
}

// ------------------------------------------------------------------ type ---

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width;
  return w + tracking * Math.max(0, [...text].length - 1);
}

/** Letter-spaced text. Canvas letterSpacing is not in every browser yet, so by hand. */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align: Align) {
  const w = trackedWidth(ctx, text, tracking);
  let cx = align === 'center' ? x - w / 2 : align === 'end' ? x - w : x;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

/**
 * The name, wrapped to at most two lines. It shrinks to 80% before giving
 * up, then ends in an ellipsis rather than spilling.
 */
function wrapName(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let scale = 1; scale >= 0.8; scale -= 0.05) {
    const s = Math.round(size * scale);
    setFont(ctx, 400, s);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !line) line = next;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) return { lines, size: s };
    if (scale - 0.05 < 0.8) {
      const kept = lines.slice(0, 2);
      let last = kept[kept.length - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1).trimEnd();
      kept[kept.length - 1] = lines.length > 2 || ctx.measureText(kept[kept.length - 1]).width > maxW ? `${last}…` : last;
      return { lines: kept, size: s };
    }
  }
  return { lines: [text], size };
}

// ------------------------------------------------------------ type block ---

type Align = 'start' | 'center' | 'end';
type Role = 'primary' | 'secondary';

interface Op {
  text: string; weight: number; size: number;
  /** Baseline, from the top of the block. */
  y: number;
  /** From the block's left edge; read with `align`. */
  x: number; align: Align;
  role: Role; tracked?: boolean;
}

interface Block { ops: Op[]; height: number }

type Arrangement = 'split' | 'left' | 'center';

/**
 * Lays out brand, name, price, details and signature for one arrangement:
 *   split  - brand, name and details left; price right on the name's first
 *            line; signature right on the details line. Square plate.
 *   left   - one left-aligned stack. Story plate, both full-bleed.
 *   center - one centred stack. Float.
 * Positions only; nothing is painted here.
 */
function buildBlock(
  ctx: CanvasRenderingContext2D, s: Spec, format: ShareFormat, data: ShareData,
  arrangement: Arrangement, width: number,
): Block {
  const ops: Op[] = [];
  const ax = arrangement === 'center' ? width / 2 : 0;
  const align: Align = arrangement === 'center' ? 'center' : 'start';
  let y = 0;

  setFont(ctx, 500, s.price);
  const priceW = ctx.measureText(data.price).width;

  if (data.brand) {
    y += s.brand * ASC;
    ops.push({ text: data.brand.toUpperCase(), weight: 600, size: s.brand, y, x: ax, align, role: 'primary', tracked: true });
    y += s.brand * DESC + s.gapBrandName;
  }

  const nameMaxW = arrangement === 'split' ? width - priceW - 56 : width;
  const name = wrapName(ctx, data.name, nameMaxW, s.name);
  y += name.size * ASC;
  const firstNameBaseline = y;
  name.lines.forEach((line, i) => {
    if (i > 0) y += name.size * NAME_LEADING;
    ops.push({ text: line, weight: 400, size: name.size, y, x: ax, align, role: 'primary' });
  });
  y += name.size * DESC;

  if (arrangement === 'split') {
    ops.push({ text: data.price, weight: 500, size: s.price, y: firstNameBaseline, x: width, align: 'end', role: 'primary' });
  } else {
    y += s.gapNameNext + s.price * ASC;
    ops.push({ text: data.price, weight: 500, size: s.price, y, x: ax, align, role: 'primary' });
    y += s.price * DESC;
  }

  const details = data.details.join('  ·  ');
  if (details) {
    y += (arrangement === 'split' ? s.gapNameNext : s.gapPriceDetails) + s.details * ASC;
    ops.push({ text: details, weight: 400, size: s.details, y, x: ax, align, role: 'secondary' });
    y += s.details * DESC;
  }

  // The signature: once, lowercase, quiet. On a story it carries the one
  // call to action; on a square the name of the site is enough.
  const story = format === 'story';
  setFont(ctx, 400, s.details);
  const detailsW = details ? ctx.measureText(details).width : 0;
  setFont(ctx, 600, s.sig);
  const sigW = ctx.measureText('zarketplace').width;
  // Shares the details line when there is room for both, with a clear gap.
  const sigBesideDetails = detailsW + sigW + 64 <= width;
  if ((arrangement === 'split' || (!story && arrangement === 'left')) && sigBesideDetails) {
    const baseline = details ? y - s.details * DESC : y + s.gapDetailsSig + s.sig * ASC;
    ops.push({ text: 'zarketplace', weight: 600, size: s.sig, y: baseline, x: width, align: 'end', role: 'primary' });
    if (!details) y = baseline + s.sig * DESC;
  } else if (arrangement === 'split' || (!story && arrangement === 'left')) {
    y += s.gapDetailsSig + s.sig * ASC;
    ops.push({ text: 'zarketplace', weight: 600, size: s.sig, y, x: width, align: 'end', role: 'primary' });
    y += s.sig * DESC;
  } else {
    y += s.gapDetailsSig + s.sig * ASC;
    if (story) {
      setFont(ctx, 600, s.sig); const a = ctx.measureText('zarketplace').width;
      setFont(ctx, 400, s.sig); const b = ctx.measureText('shop this piece →').width;
      if (arrangement === 'center') {
        const gap = 36, total = a + gap + b, left = width / 2 - total / 2;
        ops.push({ text: 'zarketplace', weight: 600, size: s.sig, y, x: left, align: 'start', role: 'primary' });
        ops.push({ text: 'shop this piece →', weight: 400, size: s.sig, y, x: left + a + gap, align: 'start', role: 'secondary' });
      } else {
        ops.push({ text: 'zarketplace', weight: 600, size: s.sig, y, x: 0, align: 'start', role: 'primary' });
        ops.push({ text: 'shop this piece →', weight: 400, size: s.sig, y, x: width, align: 'end', role: 'secondary' });
      }
    } else {
      ops.push({ text: 'zarketplace', weight: 600, size: s.sig, y, x: ax, align, role: 'primary' });
    }
    y += s.sig * DESC;
  }

  return { ops, height: y };
}

function paintBlock(ctx: CanvasRenderingContext2D, block: Block, left: number, top: number, ink: RGB, secondaryAlpha: number) {
  ctx.textBaseline = 'alphabetic';
  for (const op of block.ops) {
    setFont(ctx, op.weight, op.size);
    ctx.fillStyle = css(ink, op.role === 'secondary' ? secondaryAlpha : op.text === 'zarketplace' ? 0.88 : 1);
    const x = left + op.x, y = top + op.y;
    if (op.tracked) {
      drawTracked(ctx, op.text, x, y, op.size * BRAND_TRACKING, op.align);
    } else {
      ctx.textAlign = op.align === 'center' ? 'center' : op.align === 'end' ? 'right' : 'left';
      ctx.fillText(op.text, x, y);
    }
  }
}

// ---------------------------------------------------------------- photos ---

interface Rect { x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The photo filling `area`, cropped where it holds the most detail: the
 * window over the rows (or columns) with the most edges, so a print stays
 * whole and plain fabric is what gets cut. Centred when unread.
 */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, area: Rect, a: PhotoAnalysis | null, clearH = area.h) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(area.w / iw, area.h / ih);
  const sw = area.w / scale, sh = area.h / scale;
  const sx = sw < iw ? (a ? bestWindow(a.colDetail, sw / iw) * iw : (iw - sw) / 2) : 0;
  // `clearH` is the top part of the area no type covers: the detail is placed
  // there, and only what lies below it goes behind the type.
  const sy = sh < ih ? (a ? bestWindow(a.rowDetail, Math.min(sh, clearH / scale) / ih) * ih : (ih - sh) / 2) : 0;
  ctx.drawImage(img, clamp(sx, 0, iw - sw), clamp(sy, 0, ih - sh), sw, sh, area.x, area.y, area.w, area.h);
}

/**
 * The garment centred in `area` at the largest size that fits, with the
 * photo's edges feathered into the paper so no rectangle shows. The paper is
 * the photo's own backdrop colour, which is what makes this seamless.
 */
function drawFloat(ctx: CanvasRenderingContext2D, img: HTMLImageElement, a: PhotoAnalysis, area: Rect) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const bw = a.box.w * iw, bh = a.box.h * ih;
  const scale = Math.min(area.w / bw, area.h / bh, 1.5);
  const dw = iw * scale, dh = ih * scale;
  const dx = area.x + area.w / 2 - (a.box.x * iw + bw / 2) * scale;
  const dy = area.y + area.h / 2 - (a.box.y * ih + bh / 2) * scale;

  const off = document.createElement('canvas');
  off.width = ctx.canvas.width; off.height = ctx.canvas.height;
  const o = off.getContext('2d')!;
  o.drawImage(img, dx, dy, dw, dh);
  const f = Math.min(dw, dh) * 0.07;
  o.globalCompositeOperation = 'destination-out';
  const fade = (x0: number, y0: number, x1: number, y1: number, rect: Rect) => {
    const g = o.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = g;
    o.fillRect(rect.x, rect.y, rect.w, rect.h);
  };
  fade(dx, 0, dx + f, 0, { x: dx, y: dy, w: f, h: dh });
  fade(dx + dw, 0, dx + dw - f, 0, { x: dx + dw - f, y: dy, w: f, h: dh });
  fade(0, dy, 0, dy + f, { x: dx, y: dy, w: dw, h: f });
  fade(0, dy + dh, 0, dy + dh - f, { x: dx, y: dy + dh - f, w: dw, h: f });
  ctx.drawImage(off, 0, 0);
}

// ---------------------------------------------------------------- the QR ---

function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, ink: RGB, paper: RGB) {
  const qr = new QRCodeImpl(-1, ErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const modules: boolean[][] = qr.modules;
  const n = modules.length;
  const cell = size / (n + 2);
  ctx.fillStyle = css(paper);
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = css(ink);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) ctx.fillRect(x + (c + 1) * cell, y + (r + 1) * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

// ---------------------------------------------------------------- public ---

export interface LoadedPhoto { img: HTMLImageElement; analysis: PhotoAnalysis | null }

const loaded = new Map<string, Promise<LoadedPhoto>>();

/** Loads (once) and reads a photo. CORS-enabled, so the canvas can be exported. */
export function loadPhoto(url: string): Promise<LoadedPhoto> {
  let p = loaded.get(url);
  if (!p) {
    p = new Promise<LoadedPhoto>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => resolve({ img, analysis: analysePhoto(img) });
      img.onerror = () => { loaded.delete(url); reject(new Error(`Could not load ${url}`)); };
      img.src = url;
    });
    loaded.set(url, p);
  }
  return p;
}

/** Inter in the three weights the system uses, before anything is measured. */
let wordmark: HTMLImageElement | null = null;

/** Inter in the weights the system uses, and the white wordmark, before anything is measured. */
export async function ensureFonts(): Promise<void> {
  if (!wordmark) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { wordmark = img; resolve(); };
      img.onerror = () => resolve();
      img.src = '/images/wordmark-tight-white.png';
    });
  }
  try {
    await Promise.all([400, 500, 600].map((w) => document.fonts.load(`${w} 40px Inter`, '₹ Aa')));
    await document.fonts.ready;
  } catch { /* the Helvetica fallback in FONT takes over */ }
}

/** The layout a photo gets on Auto: float when its backdrop is even, plate otherwise. */
export function resolveLayout(layout: ShareLayout, analysis: PhotoAnalysis | null): Layout {
  if (layout !== 'auto') return layout === 'float' && !analysis ? 'plate' : layout;
  return analysis?.uniform ? 'float' : 'plate';
}

export interface RenderInput {
  format: ShareFormat;
  layout: ShareLayout;
  data: ShareData;
  photo: LoadedPhoto;
  qr?: boolean;
}

// The type sits on a solid black band under the photo: white type, the
// name in one line of weight (brand first, no eyebrow), the price, the
// details, the zarketplace wordmark at a size that reads, and the QR.
const BAND_SPEC: Record<ShareFormat, {
  margin: number; name: number; price: number; details: number; logoH: number;
  gapNamePrice: number; gapPriceDetails: number; gapDetailsLogo: number;
  padTop: number; padBottom: number; qr: number; contentBottom: number; minPhoto: number;
}> = {
  square: { margin: 64, name: 50, price: 46, details: 26, logoH: 46, gapNamePrice: 18, gapPriceDetails: 12, gapDetailsLogo: 34, padTop: 54, padBottom: 56, qr: 168, contentBottom: 1080 - 56, minPhoto: 600 },
  story: { margin: 80, name: 66, price: 60, details: 33, logoH: 62, gapNamePrice: 24, gapPriceDetails: 16, gapDetailsLogo: 46, padTop: 76, padBottom: 300, qr: 220, contentBottom: 1920 - 300, minPhoto: 1100 },
};

const BAND: RGB = [10, 10, 10];
const WHITE: RGB = [255, 255, 255];

export function renderShare({ format, layout, data, photo, qr = true }: RenderInput): HTMLCanvasElement {
  const s = SPECS[format];
  const b = BAND_SPEC[format];
  const canvas = document.createElement('canvas');
  canvas.width = s.W; canvas.height = s.H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const { img, analysis } = photo;
  const mode = resolveLayout(layout, analysis);

  const qrW = qr ? b.qr + 40 : 0;
  const textW = s.W - 2 * b.margin - qrW;
  const title = data.brand && !data.name.toLowerCase().includes(data.brand.toLowerCase().replace(/\s*\(.*\)$/, ''))
    ? `${data.brand} ${data.name}` : data.name;
  const name = wrapName(ctx, title, textW, b.name);
  const details = data.details.join('  ·  ');
  const logoW = wordmark ? (wordmark.naturalWidth / wordmark.naturalHeight) * b.logoH : 0;

  // Height of the type, top to bottom.
  let h = name.size * ASC + (name.lines.length - 1) * name.size * NAME_LEADING + name.size * DESC;
  h += b.gapNamePrice + b.price * ASC + b.price * DESC;
  if (details) h += b.gapPriceDetails + b.details * ASC + b.details * DESC;
  h += b.gapDetailsLogo + (wordmark ? b.logoH : b.details);
  h = Math.max(h, qr ? b.qr : 0);

  const contentTop = b.contentBottom - h;
  const bandTop = Math.max(b.minPhoto, contentTop - b.padTop);
  const top = bandTop + b.padTop;

  // The photo.
  if (mode === 'full') {
    drawCover(ctx, img, { x: 0, y: 0, w: s.W, h: s.H }, analysis, bandTop);
    const g = ctx.createLinearGradient(0, bandTop - 220, 0, bandTop + 40);
    g.addColorStop(0, 'rgba(10,10,10,0)');
    g.addColorStop(1, 'rgba(10,10,10,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, bandTop - 220, s.W, 260);
    ctx.fillStyle = css(BAND, 0.92);
    ctx.fillRect(0, bandTop + 40, s.W, s.H - bandTop - 40);
  } else {
    if (mode === 'float' && analysis) {
      ctx.fillStyle = css(analysis.backdrop);
      ctx.fillRect(0, 0, s.W, bandTop);
      const pad = format === 'story' ? 150 : 56;
      drawFloat(ctx, img, analysis, { x: b.margin, y: pad, w: s.W - 2 * b.margin, h: bandTop - pad - (format === 'story' ? 56 : 40) });
    } else {
      drawCover(ctx, img, { x: 0, y: 0, w: s.W, h: bandTop }, analysis);
    }
    ctx.fillStyle = css(BAND);
    ctx.fillRect(0, bandTop, s.W, s.H - bandTop);
  }

  // The type.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = css(WHITE);
  let y = top + name.size * ASC;
  setFont(ctx, 500, name.size);
  name.lines.forEach((line, i) => { if (i > 0) y += name.size * NAME_LEADING; ctx.fillText(line, b.margin, y); });
  y += name.size * DESC + b.gapNamePrice + b.price * ASC;
  setFont(ctx, 600, b.price);
  ctx.fillText(data.price, b.margin, y);
  y += b.price * DESC;
  if (details) {
    y += b.gapPriceDetails + b.details * ASC;
    setFont(ctx, 400, b.details);
    ctx.fillStyle = css(WHITE, 0.72);
    ctx.fillText(details, b.margin, y);
    y += b.details * DESC;
  }
  y += b.gapDetailsLogo;
  if (wordmark) {
    ctx.drawImage(wordmark, b.margin, y, logoW, b.logoH);
  } else {
    setFont(ctx, 700, b.details);
    ctx.fillStyle = css(WHITE);
    ctx.fillText('zarketplace', b.margin, y + b.details * ASC);
  }

  if (qr) {
    // White tile, black modules: what every phone camera reads first time.
    drawQr(ctx, data.url, s.W - b.margin - b.qr, top, b.qr, DARK_INK, WHITE);
  }
  return canvas;
}
