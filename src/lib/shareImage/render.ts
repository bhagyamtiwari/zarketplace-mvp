// Draws a share image on a canvas: an Instagram post (1080 x 1080) or story
// (1080 x 1920). docs/SHARE_IMAGE_SYSTEM.md has the design and its reasons.
//
// One composition for both formats: the photo on top, then a black band that
// is all used. The item's name, its price at display size and its details on
// the left, the QR on the right, and a signature bar along the foot with the
// zarketplace wordmark and the address. Nothing in the band is filler.
// The photo is read first (analyse.ts): an even backdrop is extended to fill
// the photo area with the garment centred on it, anything else is cropped to
// where the detail is.

import type { ShareData } from './data';
import { analysePhoto, bestWindow, type PhotoAnalysis, type RGB } from './analyse';
// qr.js: a small QR encoder.
import QRCodeImpl from 'qr.js/lib/QRCode';
import ErrorCorrectLevel from 'qr.js/lib/ErrorCorrectLevel';

export type ShareFormat = 'square' | 'story';

const FONT = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';

// Inter's ascent and descent as fractions of the size, for setting baselines.
const ASC = 0.92;
const DESC = 0.26;
const NAME_LEADING = 1.12;

const css = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
const DARK_INK: RGB = [10, 10, 10];

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/**
 * The name, wrapped to at most two lines. It shrinks to 80% before giving
 * up, then ends in an ellipsis rather than spilling.
 */
function wrapName(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, maxLines = 2): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let scale = 1; scale >= 0.8; scale -= 0.05) {
    const s = Math.round(size * scale);
    setFont(ctx, 600, s);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !line) line = next;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { lines, size: s };
    if (scale - 0.05 < 0.8) {
      const kept = lines.slice(0, maxLines);
      let last = kept[kept.length - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1).trimEnd();
      kept[kept.length - 1] = lines.length > maxLines || ctx.measureText(kept[kept.length - 1]).width > maxW ? `${last}…` : last;
      return { lines: kept, size: s };
    }
  }
  return { lines: [text], size };
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
    await Promise.all([400, 600, 800].map((w) => document.fonts.load(`${w} 40px Inter`, '₹ Aa')));
    await document.fonts.ready;
  } catch { /* the Helvetica fallback in FONT takes over */ }
}

export interface RenderInput {
  format: ShareFormat;
  data: ShareData;
  photo: LoadedPhoto;
  qr?: boolean;
}

interface Spec {
  W: number; H: number; photoH: number; margin: number; padTop: number;
  name: number; price: number; details: number; gapNamePrice: number; gapPriceDetails: number;
  qr: number; gapQr: number;
  /** The signature bar along the foot: its height, the wordmark and the address. */
  barH: number; logoH: number; url: number;
  /** On a story, where Instagram's own bar sits over the photo. */
  photoPadTop: number;
}

const SPECS: Record<ShareFormat, Spec> = {
  square: {
    W: 1080, H: 1080, photoH: 640, margin: 60, padTop: 52,
    name: 46, price: 72, details: 28, gapNamePrice: 16, gapPriceDetails: 14,
    qr: 200, gapQr: 40, barH: 120, logoH: 52, url: 30, photoPadTop: 48,
  },
  story: {
    W: 1080, H: 1920, photoH: 1180, margin: 80, padTop: 76,
    name: 62, price: 104, details: 36, gapNamePrice: 22, gapPriceDetails: 18,
    qr: 260, gapQr: 48, barH: 210, logoH: 80, url: 40, photoPadTop: 170,
  },
};

const BAND: RGB = [10, 10, 10];
const WHITE: RGB = [255, 255, 255];

export function renderShare({ format, data, photo, qr = true }: RenderInput): HTMLCanvasElement {
  const s = SPECS[format];
  const canvas = document.createElement('canvas');
  canvas.width = s.W; canvas.height = s.H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const { img, analysis } = photo;

  // The photo. An even backdrop (most of ours: a garment laid on a plain
  // surface) is extended across the whole photo area so the garment sits
  // centred and large; any other photo is cropped to its detail.
  const area = { x: 0, y: 0, w: s.W, h: s.photoH };
  if (analysis?.uniform) {
    ctx.fillStyle = css(analysis.backdrop);
    ctx.fillRect(area.x, area.y, area.w, area.h);
    const pad = s.margin;
    drawFloat(ctx, img, analysis, { x: pad, y: s.photoPadTop, w: s.W - 2 * pad, h: s.photoH - s.photoPadTop - pad * 0.8 });
  } else {
    drawCover(ctx, img, area, analysis);
  }

  // The band.
  ctx.fillStyle = css(BAND);
  ctx.fillRect(0, s.photoH, s.W, s.H - s.photoH);

  const top = s.photoH + s.padTop;
  const textW = s.W - 2 * s.margin - (qr ? s.qr + s.gapQr : 0);
  const title = data.brand && !data.name.toLowerCase().includes(data.brand.toLowerCase().replace(/\s*\(.*\)$/, ''))
    ? `${data.brand} ${data.name}` : data.name;
  const name = wrapName(ctx, title, textW, s.name, format === 'story' ? 3 : 2);
  const details = data.details.join('  ·  ');

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = css(WHITE);
  let y = top + name.size * ASC;
  setFont(ctx, 600, name.size);
  name.lines.forEach((line, i) => { if (i > 0) y += name.size * NAME_LEADING; ctx.fillText(line, s.margin, y); });
  y += name.size * DESC + s.gapNamePrice + s.price * ASC;
  setFont(ctx, 800, s.price);
  ctx.fillText(data.price, s.margin - s.price * 0.03, y);
  y += s.price * DESC;
  if (details) {
    y += s.gapPriceDetails + s.details * ASC;
    setFont(ctx, 400, s.details);
    ctx.fillStyle = css(WHITE, 0.72);
    let line = details;
    while (line.length > 1 && ctx.measureText(line).width > textW) line = line.slice(0, -1);
    ctx.fillText(line === details ? line : `${line.trimEnd()}…`, s.margin, y);
  }

  if (qr) {
    // White tile, black modules: what every phone camera reads first time.
    drawQr(ctx, data.url, s.W - s.margin - s.qr, top, s.qr, DARK_INK, WHITE);
  }

  // The signature bar: a hairline, the wordmark large, the address beside it.
  const barTop = s.H - s.barH;
  ctx.fillStyle = css(WHITE, 0.18);
  ctx.fillRect(s.margin, barTop, s.W - 2 * s.margin, 2);
  const mid = barTop + s.barH / 2;
  if (wordmark) {
    const logoW = (wordmark.naturalWidth / wordmark.naturalHeight) * s.logoH;
    ctx.drawImage(wordmark, s.margin, mid - s.logoH / 2, logoW, s.logoH);
  } else {
    setFont(ctx, 800, s.logoH * 0.8);
    ctx.fillStyle = css(WHITE);
    ctx.fillText('zarketplace', s.margin, mid + s.logoH * 0.3);
  }
  setFont(ctx, 600, s.url);
  ctx.fillStyle = css(WHITE, 0.8);
  ctx.textAlign = 'right';
  ctx.fillText('zarketplace.com', s.W - s.margin, mid + s.url * 0.34);
  return canvas;
}
