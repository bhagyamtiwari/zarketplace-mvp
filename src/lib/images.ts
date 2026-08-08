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

/**
 * Pick a size for a stored image URL. Returns the URL untouched when it was
 * not produced by this pipeline (every listing uploaded before it), so callers
 * never need to know which era an image came from.
 */
export function variantUrl(url: string | null | undefined, variant: ImageVariant): string {
  if (!url) return '';
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
  if (!url || !VARIANT_SUFFIX_RE.test(url)) return undefined;
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

export interface EncodedImage {
  blob: Blob;
  width: number;
  ext: 'webp' | 'jpg';
}

/**
 * Resize + re-encode one file into the three variants. Images smaller than a
 * target width are never upscaled - the variant is just capped at the source
 * size, so a small photo does not get bigger on the way in.
 */
export async function encodeVariants(file: File): Promise<Record<ImageVariant, EncodedImage>> {
  const bitmap = await loadBitmap(file);
  const srcW = 'width' in bitmap ? bitmap.width : 0;
  const srcH = 'height' in bitmap ? bitmap.height : 0;
  if (!srcW || !srcH) throw new Error('Could not read that image.');

  const webp = await supportsWebp();
  const mime = webp ? 'image/webp' : 'image/jpeg';
  const ext: 'webp' | 'jpg' = webp ? 'webp' : 'jpg';

  const out = {} as Record<ImageVariant, EncodedImage>;
  for (const variant of ['thumb', 'grid', 'full'] as ImageVariant[]) {
    const targetW = Math.min(VARIANT_WIDTH[variant], srcW);
    const targetH = Math.round((srcH / srcW) * targetW);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, mime, VARIANT_QUALITY[variant]),
    );
    if (!blob) throw new Error('Could not process that image.');
    out[variant] = { blob, width: VARIANT_WIDTH[variant], ext };
  }

  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  return out;
}
