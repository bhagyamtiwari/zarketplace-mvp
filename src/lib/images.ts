// Image pipeline. A phone photo is 1.5-8 MB; a browser never needs more than
// ~200 KB of it. Everything is resized and re-encoded in the browser before it
// reaches Supabase, so we pay for storage and egress once, at the small size,
// instead of reprocessing later.
//
// Three variants per photo:
//   thumb  400px  - grid cards on a phone
//   grid   800px  - grid cards on a desktop, gallery thumbnails
//   full  1600px  - product page hero, zoom
//
// Naming is the contract. A photo uploaded as
//   listings/<id>-<ts>-<i>-800.webp
// has its siblings at -400.webp and -1600.webp, so variantUrl() can pick a
// size by string substitution and nothing has to be stored per variant in the
// database. Listings uploaded before this pipeline keep whatever single URL
// they have, and variantUrl() returns it unchanged.

export type ImageVariant = 'thumb' | 'grid' | 'full';

export const VARIANT_WIDTH: Record<ImageVariant, number> = {
  thumb: 400,
  grid: 800,
  full: 1600,
};

// Quality per size. The small variants are only ever seen small, so they can
// be pushed harder than the full size a buyer zooms into.
const VARIANT_QUALITY: Record<ImageVariant, number> = {
  thumb: 0.72,
  grid: 0.78,
  full: 0.82,
};

// Matches the -<width>.<ext> suffix this pipeline writes.
const VARIANT_SUFFIX_RE = /-(?:400|800|1600)\.(webp|jpe?g|png)$/i;

// Unsplash photos (the demo stock) are resized by Unsplash itself: the width
// is a query parameter. Without this every demo card fetched a 1200px photo,
// even on a phone showing it 180px wide.
function isUnsplash(url: string): boolean {
  return url.startsWith('https://images.unsplash.com/');
}

function unsplashAt(url: string, width: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set('w', String(width));
    if (!u.searchParams.has('q')) u.searchParams.set('q', '75');
    if (!u.searchParams.has('auto')) u.searchParams.set('auto', 'format');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pick a size for a stored image URL. Returns the URL untouched when it was
 * not produced by this pipeline (every listing uploaded before it), so callers
 * never need to know which era an image came from.
 */
export function variantUrl(url: string | null | undefined, variant: ImageVariant): string {
  if (!url) return '';
  if (isUnsplash(url)) return unsplashAt(url, VARIANT_WIDTH[variant]);
  const m = url.match(VARIANT_SUFFIX_RE);
  if (!m) return url;
  return url.replace(VARIANT_SUFFIX_RE, `-${VARIANT_WIDTH[variant]}.${m[1]}`);
}

/**
 * srcset for a stored image, so the browser downloads the 400px file on a
 * phone and the 800px one on a desktop grid. Falls back to a single-entry
 * srcset for pre-pipeline images, which is a no-op the browser ignores.
 */
export function variantSrcSet(url: string | null | undefined, variants: ImageVariant[]): string | undefined {
  if (!url) return undefined;
  if (!isUnsplash(url) && !VARIANT_SUFFIX_RE.test(url)) return undefined;
  return variants.map((v) => `${variantUrl(url, v)} ${VARIANT_WIDTH[v]}w`).join(', ');
}

// WebP encoding is available in every browser we care about, but a canvas that
// cannot produce it silently hands back a PNG, which would be larger than the
// JPEG we started with. Detect once and fall back to JPEG on purpose.
let webpSupport: boolean | null = null;
async function supportsWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.8));
    webpSupport = !!blob && blob.type === 'image/webp';
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap applies EXIF orientation and decodes off the main
  // thread. Safari needs the option spelled out; older ones need the <img>.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = url;
    });
  } finally {
    // Revoked on the next tick so the decode above has finished with it.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

const NORMALIZE_TIMEOUT_MS = 30_000;

/** Rejects if `promise` has not settled within `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not read that image.')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * A photo straight off a phone, made into something every later step can
 * handle: decoded (which is what makes an iPhone HEIC or an untyped pick
 * usable), turned the right way up, no longer than `maxEdge` on its long side,
 * and saved as a JPEG on white. A 48MP phone photo was 10-20 MB, which the old
 * size check refused outright, and which was then sent whole to background
 * removal. Throws when the browser cannot read the image at all, or has not
 * managed to in 30 seconds: a decode that stalls must not leave the page
 * saying "Adding photos" for good.
 */
export async function normalizePhoto(file: File, maxEdge = 2400): Promise<File> {
  const bitmap = await within(loadBitmap(file), NORMALIZE_TIMEOUT_MS);
  const srcW = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const srcH = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (!srcW || !srcH) throw new Error('Could not read that image.');
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  // White under anything transparent, which JPEG would otherwise turn black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const blob = await within(
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92)),
    NORMALIZE_TIMEOUT_MS,
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Could not read that image.');
  const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

export interface EncodedImage {
  blob: Blob;
  width: number;
  ext: 'webp' | 'jpg';
}

// MODEL.md §9: consistency comes from processing, not from the vendor's camera.
// We enforce completeness of angles and never reject for lighting, which means
// the pipeline has to do the work instead - otherwise the grid is a jumble of
// letterboxed phone photos in six different white balances and reads as sloppy
// rather than as honest.
//
// Three passes, all deliberately gentle. The aim is a catalogue that scans as
// one set, not photos that look retouched: over-processing used clothing is the
// thing that suppresses trust in the first place.
const CARD_ASPECT = 3 / 4;

// Fill behind a photo that does not reach the edges. Matches the card's own
// bg-zinc-50 so the letterbox is invisible against the grid.
const NEUTRAL = '#fafafa';

// Cropping is preferable to bars, but not at any price: past this much loss we
// are cutting the garment rather than tidying the frame, so we letterbox.
const MAX_CROP = 0.12;

// Mid-grey in linear terms. Phone photos of clothing on a bed skew dark; this
// nudges them together without flattening a deliberately moody shot.
const TARGET_LUMA = 0.56;
const MIN_GAIN = 0.85;
const MAX_GAIN = 1.35;

/**
 * Average perceived brightness, 0-1, sampled from a small copy. Sampling a
 * 32px thumbnail rather than the full image keeps this off the main thread's
 * critical path; the number only needs to be roughly right.
 */
function meanLuma(bitmap: CanvasImageSource, w: number, h: number): number | null {
  try {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = Math.max(1, Math.round((h / w) * 32));
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(bitmap, 0, 0, c.width, c.height);
    const { data } = cx.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Rec. 601 luma, which is close enough to perceived brightness here.
      sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      n++;
    }
    return n ? sum / n : null;
  } catch {
    // A tainted canvas or a browser that refuses getImageData. Skip the pass
    // rather than fail the upload: a slightly dark photo beats no listing.
    return null;
  }
}

function supportsFilter(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.filter = 'brightness(1.01)';
    const ok = ctx.filter !== 'none';
    ctx.filter = 'none';
    return ok;
  } catch {
    return false;
  }
}

/**
 * Resize, normalise and re-encode one file into the three variants.
 *
 * Every variant comes out at the same 3:4 the cards render at, so the grid
 * stops depending on CSS cropping something it was never given. Images smaller
 * than a target width are not upscaled.
 */
export async function encodeVariants(file: File): Promise<Record<ImageVariant, EncodedImage>> {
  const bitmap = await loadBitmap(file);
  const srcW = 'width' in bitmap ? bitmap.width : 0;
  const srcH = 'height' in bitmap ? bitmap.height : 0;
  if (!srcW || !srcH) throw new Error('Could not read that image.');

  const webp = await supportsWebp();
  const mime = webp ? 'image/webp' : 'image/jpeg';
  const ext: 'webp' | 'jpg' = webp ? 'webp' : 'jpg';

  // How far the source is from the card's shape decides crop versus letterbox.
  const srcAspect = srcW / srcH;
  const cropLoss = srcAspect > CARD_ASPECT
    ? 1 - (CARD_ASPECT / srcAspect)   // too wide: we would lose width
    : 1 - (srcAspect / CARD_ASPECT);  // too tall: we would lose height
  const shouldCrop = cropLoss <= MAX_CROP;

  const luma = meanLuma(bitmap as CanvasImageSource, srcW, srcH);
  const gain = luma && luma > 0.01
    ? Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_LUMA / luma))
    : 1;

  const out = {} as Record<ImageVariant, EncodedImage>;
  for (const variant of ['thumb', 'grid', 'full'] as ImageVariant[]) {
    const targetW = Math.min(VARIANT_WIDTH[variant], srcW);
    const targetH = Math.round(targetW / CARD_ASPECT);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image.');

    // Painted first so a letterboxed photo sits on the neutral rather than on
    // transparency, which would encode as black in a jpeg.
    ctx.fillStyle = NEUTRAL;
    ctx.fillRect(0, 0, targetW, targetH);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (gain !== 1 && supportsFilter(ctx)) {
      ctx.filter = `brightness(${gain.toFixed(3)})`;
    }

    // Cover fills the frame and trims the overflow; contain fits the whole
    // garment and leaves neutral at the edges. Either way the output is 3:4.
    const scale = shouldCrop
      ? Math.max(targetW / srcW, targetH / srcH)
      : Math.min(targetW / srcW, targetH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;

    ctx.drawImage(
      bitmap as CanvasImageSource,
      (targetW - drawW) / 2,
      (targetH - drawH) / 2,
      drawW,
      drawH,
    );
    ctx.filter = 'none';

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, mime, VARIANT_QUALITY[variant]),
    );
    if (!blob) throw new Error('Could not process that image.');
    out[variant] = { blob, width: VARIANT_WIDTH[variant], ext };
  }

  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  return out;
}

// The social card is 1200x630 because that is what og:image:width/height
// promise and what every scraper lays out for. Two reasons it is its own file
// rather than a reuse of the full variant:
//   * a garment photo is 3:4, so pointing at it while declaring 1.91:1 makes
//     WhatsApp and Facebook crop the item's head and feet off;
//   * it is JPEG, not WebP - WhatsApp's preview renderer is unreliable with
//     WebP and silently shows no image at all, which is the exact failure this
//     whole task exists to fix.
// Letterboxed on white rather than cropped: the whole garment is the point.
export const SOCIAL_CARD_SUFFIX = '-og.jpg';

export async function encodeSocialCard(file: File): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const srcW = 'width' in bitmap ? bitmap.width : 0;
  const srcH = 'height' in bitmap ? bitmap.height : 0;
  if (!srcW || !srcH) throw new Error('Could not read that image.');

  const W = 1200, H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.min(W / srcW, H / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  ctx.drawImage(bitmap as CanvasImageSource, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

/**
 * Where the social card for a stored image lives. Returns null for images
 * uploaded before this pipeline, which have no card - the caller falls back to
 * the photo itself.
 */
export function socialCardUrl(url: string | null | undefined): string | null {
  if (!url || !VARIANT_SUFFIX_RE.test(url)) return null;
  return url.replace(VARIANT_SUFFIX_RE, SOCIAL_CARD_SUFFIX);
}
