// Reads a listing photo before anything is laid out on it, so the layout can
// follow the photograph rather than force every photo into one template.
// See docs/SHARE_IMAGE_SYSTEM.md, "Layouts, chosen by the photograph".
//
// Works on a small copy (SAMPLE_W wide): the answers are proportions, and a
// 160px copy gives them in a few milliseconds.

export type RGB = [number, number, number];

export interface PhotoAnalysis {
  width: number;
  height: number;
  /** The backdrop: the median colour of the photo's border. */
  backdrop: RGB;
  /** The border is one even colour, so the photo can melt into a paper of that colour. */
  uniform: boolean;
  /** The garment's bounds, as fractions of the photo (pixels unlike the backdrop). */
  box: { x: number; y: number; w: number; h: number };
  /** Where the detail is (a print, a logo, stitching), as fractions of the photo. */
  focus: { x: number; y: number };
  /** Mean lightness of the whole photo, 0 to 1. */
  lum: number;
  /** The garment's average colour, for tinting the paper. */
  garment: RGB;
  /** How much detail each row and each column holds, for choosing a crop. */
  rowDetail: number[];
  colDetail: number[];
}

const SAMPLE_W = 160;
/** How far from the backdrop a pixel must be to count as garment. */
const FOREGROUND_DIST = 34;
/** How close to the backdrop a border pixel must be to count as backdrop. */
const BORDER_DIST = 24;

const dist = (a: RGB, r: number, g: number, b: number) =>
  Math.sqrt((a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2);

export const luminance = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Null when the photo cannot be read (a cross-origin image without CORS). */
export function analysePhoto(img: HTMLImageElement): PhotoAnalysis | null {
  const W = SAMPLE_W;
  const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);
  let px: Uint8ClampedArray;
  try { px = ctx.getImageData(0, 0, W, H).data; } catch { return null; }
  const at = (x: number, y: number) => (y * W + x) * 4;

  // The border, three pixels deep.
  const br: number[] = [], bg: number[] = [], bb: number[] = [];
  const border: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x > 2 && x < W - 3 && y > 2 && y < H - 3) continue;
      const i = at(x, y);
      br.push(px[i]); bg.push(px[i + 1]); bb.push(px[i + 2]);
      border.push(i);
    }
  }
  const backdrop: RGB = [median(br), median(bg), median(bb)];
  const even = border.filter((i) => dist(backdrop, px[i], px[i + 1], px[i + 2]) < BORDER_DIST).length;
  const uniform = even / border.length >= 0.8;

  // Garment pixels, and the detail inside them.
  const colCount = new Array(W).fill(0);
  const rowCount = new Array(H).fill(0);
  let lumSum = 0, gr = 0, gg = 0, gb = 0, gn = 0;
  let ex = 0, ey = 0, ew = 0;
  const rowDetail = new Array(H).fill(0);
  const colDetail = new Array(W).fill(0);
  const lumAt = (i: number) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      lumSum += lumAt(i) / 255;
      if (dist(backdrop, px[i], px[i + 1], px[i + 2]) <= FOREGROUND_DIST) continue;
      colCount[x]++; rowCount[y]++;
      gr += px[i]; gg += px[i + 1]; gb += px[i + 2]; gn++;
      // Detail inside the garment only: the line where garment meets backdrop
      // is its outline, not its detail, and would pull a crop to the edges.
      const isGarment = (j: number) => dist(backdrop, px[j], px[j + 1], px[j + 2]) > FOREGROUND_DIST;
      if (x > 0 && y > 0 && isGarment(at(x - 1, y)) && isGarment(at(x, y - 1))) {
        const edge = Math.abs(lumAt(i) - lumAt(at(x - 1, y))) + Math.abs(lumAt(i) - lumAt(at(x, y - 1)));
        if (edge > 18) {
          ex += x * edge; ey += y * edge; ew += edge;
          // Rows and columns count detailed pixels, not edge strength, so a
          // wide print outweighs a small high-contrast tag.
          rowDetail[y] += 1; colDetail[x] += 1;
        }
      }
    }
  }

  // Bounds that ignore stray specks: a column or row counts once a few
  // percent of it is garment.
  const firstOver = (counts: number[], min: number) => counts.findIndex((n) => n > min);
  const lastOver = (counts: number[], min: number) => counts.length - 1 - [...counts].reverse().findIndex((n) => n > min);
  const cMin = Math.max(1, H * 0.02), rMin = Math.max(1, W * 0.02);
  let x0 = firstOver(colCount, cMin), x1 = lastOver(colCount, cMin);
  let y0 = firstOver(rowCount, rMin), y1 = lastOver(rowCount, rMin);
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const box = { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H };

  const focus = ew > 0
    ? { x: ex / ew / W, y: ey / ew / H }
    : { x: box.x + box.w / 2, y: box.y + box.h / 2 };

  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    backdrop,
    uniform,
    box,
    focus,
    lum: lumSum / (W * H),
    garment: gn > 0 ? [gr / gn, gg / gn, gb / gn] : backdrop,
    rowDetail,
    colDetail,
  };
}

/**
 * Where a crop window of `fraction` (0 to 1) of the photo should start, as a
 * fraction, so it holds the most detail: a print stays whole and plain fabric
 * is what gets cut. Ties go to the window nearest the centre.
 */
export function bestWindow(detail: number[], fraction: number): number {
  const n = detail.length;
  const span = Math.max(1, Math.min(n, Math.round(n * fraction)));
  if (span >= n) return 0;
  let sum = 0;
  for (let i = 0; i < span; i++) sum += detail[i];
  let best = sum, bestAt = 0;
  const mid = (n - span) / 2;
  for (let i = 1; i + span <= n; i++) {
    sum += detail[i + span - 1] - detail[i - 1];
    if (sum > best * 1.0001 || (Math.abs(sum - best) <= best * 0.0001 && Math.abs(i - mid) < Math.abs(bestAt - mid))) {
      best = sum; bestAt = i;
    }
  }
  return bestAt / n;
}
