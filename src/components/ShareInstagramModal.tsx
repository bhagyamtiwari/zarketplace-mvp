// ShareInstagramModal - lets a seller download polished Instagram-ready
// images of their listing. Supports:
//   - Square (1:1, 1080x1080) feed posts and Story (9:16, 1080x1920)
//   - Multiple hero images: the seller picks which listing photo to feature,
//     or hits "Download all" to get one image per listing photo
//   - QR code linking to the product URL, plus @zarketplace branding overlaid
//     on the photo and inside the info panel

import * as React from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2, Square, Smartphone } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';

type Format = 'square' | 'story';

// Card dimensions. The hero image is full-bleed; the info panel is a
// semi-transparent dark overlay anchored to the bottom of the card.
const LAYOUTS: Record<Format, {
  w: number; h: number;
  panelH: number;  // height of the bottom overlay panel
  previewScale: number;
}> = {
  square: { w: 1080, h: 1080, panelH: 340, previewScale: 0.34 },
  story:  { w: 1080, h: 1920, panelH: 500, previewScale: 0.22 },
};

// Always points at the production domain regardless of where the seller
// generates the image (localhost dev, preview deploys, etc.). The whole point
// of this image is to drive scanners to the live site.
const PUBLIC_SITE_URL = 'https://zarketplace.com';

function productUrl(listing: Listing): string {
  const path = listing.sku ? `/item/${listing.sku}` : `/product/${listing.id}`;
  return `${PUBLIC_SITE_URL}${path}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  listing: Listing;
}

export function ShareInstagramModal({ open, onClose, listing }: Props) {
  const [format, setFormat] = React.useState<Format>('square');
  const [imageIdx, setImageIdx] = React.useState(0);
  const [downloading, setDownloading] = React.useState<'one' | 'all' | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const allImages = React.useMemo(() => {
    const arr = (listing.image_urls && listing.image_urls.length > 0) ? listing.image_urls : [listing.image_url];
    return arr.filter(Boolean);
  }, [listing]);

  // Reset image picker when modal re-opens.
  React.useEffect(() => { if (open) setImageIdx(0); }, [open]);

  async function captureCurrent(): Promise<string> {
    if (!cardRef.current) throw new Error('card not mounted');
    return await toPng(cardRef.current, {
      cacheBust: true,
      pixelRatio: 1,
      width: LAYOUTS[format].w,
      height: LAYOUTS[format].h,
      style: { transform: 'none', transformOrigin: 'top left' },
    });
  }

  function triggerDownload(dataUrl: string, suffix: string) {
    const a = document.createElement('a');
    const safeTitle = (listing.title || 'listing').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    a.href = dataUrl;
    a.download = `zarketplace-${safeTitle}-${suffix}.png`;
    a.click();
  }

  const downloadOne = async () => {
    setDownloading('one');
    try {
      const url = await captureCurrent();
      triggerDownload(url, `${format}-${imageIdx + 1}`);
    } catch (e) {
      console.error('share image failed', e);
      alert('Could not generate the image. Wait for the photo to finish loading and try again.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadAll = async () => {
    setDownloading('all');
    try {
      // Iterate, render each image as the hero, capture, download.
      for (let i = 0; i < allImages.length; i++) {
        setImageIdx(i);
        // Wait two animation frames so React commits + the <img> swaps.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        // Allow the new image to fetch/decode.
        await new Promise((r) => setTimeout(r, 300));
        const url = await captureCurrent();
        triggerDownload(url, `${format}-${i + 1}`);
        // Tiny gap so browsers don't dedupe rapid downloads.
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) {
      console.error('bulk share image failed', e);
      alert('Bulk download failed partway through. Try downloading them one at a time.');
    } finally {
      setDownloading(null);
    }
  };

  if (!open) return null;
  const layout = LAYOUTS[format];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="relative bg-white max-w-4xl w-full max-h-[95vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 z-10 h-8 w-8 flex items-center justify-center hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>

          <div className="p-6 sm:p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/50">Share to Instagram</span>
              <h2 className="text-2xl font-black tracking-tighter uppercase">Generate post image</h2>
              <p className="text-[11px] font-bold uppercase tracking-widest text-black/40 leading-relaxed max-w-xl">
                Download a branded post or story image of your listing in one click.
              </p>
            </div>

            {/* Format toggle */}
            <div className="flex gap-1 border border-black/10 self-start">
              {([['square', 'Square 1:1', Square], ['story', 'Story 9:16', Smartphone]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => setFormat(k)}
                  className={cn(
                    'px-4 py-2.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 transition-colors',
                    format === k ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50',
                  )}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {/* Image picker (only if multiple photos) */}
            {allImages.length > 1 && (
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-black/60">
                  Hero photo  ({imageIdx + 1}/{allImages.length})
                </span>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {allImages.map((src, i) => (
                    <button key={i} onClick={() => setImageIdx(i)}
                      className={cn(
                        'relative aspect-square w-20 flex-shrink-0 overflow-hidden border-2 transition-all',
                        imageIdx === i ? 'border-black' : 'border-transparent opacity-50 hover:opacity-100',
                      )}>
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="bg-zinc-100 p-4 sm:p-6 flex justify-center">
              <div
                style={{
                  width: layout.w * layout.previewScale,
                  height: layout.h * layout.previewScale,
                }}
                className="relative overflow-hidden shadow-xl"
              >
                <div
                  style={{
                    transform: `scale(${layout.previewScale})`,
                    transformOrigin: 'top left',
                    width: layout.w,
                    height: layout.h,
                  }}
                >
                  <ShareCard
                    ref={cardRef}
                    listing={listing}
                    heroImage={allImages[imageIdx]}
                    format={format}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={downloadOne} disabled={downloading !== null}
                className="flex-1 bg-black text-white py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {downloading === 'one' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading === 'one' ? 'Generating...' : `Download this ${format}`}
              </button>
              {allImages.length > 1 && (
                <button onClick={downloadAll} disabled={downloading !== null}
                  className="flex-1 border border-black py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {downloading === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading === 'all' ? 'Downloading all...' : `Download all ${allImages.length}`}
                </button>
              )}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
              Caption tip: <span className="text-black">Just listed on @zarketplace - link in bio. Scan the QR to shop direct.</span>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// ShareCard - the actual image rendered at full pixel size for capture.
// ============================================================================

const ShareCard = React.forwardRef<HTMLDivElement, {
  listing: Listing;
  heroImage: string;
  format: Format;
}>(function ShareCard({ listing, heroImage, format }, ref) {
  const layout = LAYOUTS[format];
  const isStory = format === 'story';
  const price = listing.sale_price ?? listing.price;
  const hasSale = !!listing.sale_price && listing.sale_price < listing.price;

  // Type-safety for line-clamp via plain CSS.
  const titleClamp: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <div
      ref={ref}
      style={{
        width: layout.w,
        height: layout.h,
        position: 'relative',
        background: '#000',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#000',
        overflow: 'hidden',
      }}
    >
      {/* FULL-BLEED HERO IMAGE */}
      <img
        src={heroImage}
        crossOrigin="anonymous"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {/* Sale flag, top-left */}
      {hasSale && (
        <div style={{
          position: 'absolute', top: 32, left: 32,
          background: '#dc2626', color: '#fff',
          padding: '10px 16px',
          fontSize: 14, fontWeight: 900, letterSpacing: 4,
          textTransform: 'uppercase',
        }}>
          On Sale
        </div>
      )}

      {/* INFO PANEL: translucent dark overlay anchored to the bottom of the
          full-bleed image, so the photo stays visible underneath. Kept
          compact (small padding, no wasted vertical room) so most of the
          photo stays uncovered. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: layout.panelH,
        background: 'rgba(0,0,0,0.7)', color: '#fff',
        padding: isStory ? 40 : 30,
        display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box',
      }}>
        {/* TOP ROW: title + meta on left, QR on right */}
        <div style={{
          flex: 1,
          display: 'flex',
          gap: 24,
          alignItems: 'flex-start',
          minHeight: 0,
        }}>
          {/* Left text column */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
          }}>
            <h1 style={{
              fontSize: isStory ? 52 : 42,
              fontWeight: 900,
              letterSpacing: -1.5,
              textTransform: 'uppercase',
              lineHeight: 0.95,
              margin: 0,
              ...titleClamp,
              WebkitLineClamp: 2,
            }}>
              {listing.title}
            </h1>

            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap',
              fontSize: isStory ? 18 : 15, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase',
            }}>
              {listing.brand && <span style={chipStyle}>{listing.brand}</span>}
              {listing.size && <span style={chipStyle}>Size {listing.size}</span>}
              {listing.condition && <span style={chipStyle}>{listing.condition}</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 'auto' }}>
              <span style={{ fontSize: isStory ? 46 : 38, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
                {formatCurrency(price)}
              </span>
              {hasSale && (
                <span style={{
                  fontSize: 20, fontWeight: 800, color: '#a3a3a3', textDecoration: 'line-through',
                }}>
                  {formatCurrency(listing.price)}
                </span>
              )}
            </div>
          </div>

          {/* Right QR column */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ background: '#fff', padding: 10, lineHeight: 0 }}>
              <QRCode
                value={productUrl(listing)}
                size={isStory ? 170 : 130}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.8,
            }}>
              Scan to shop
            </span>
          </div>
        </div>

        {/* BOTTOM ROW: centered registered wordmark, at its native aspect
            ratio (1083x202 - already cropped tight to the glyphs, unlike the
            old square wordmark asset, so no crop-window hack needed). */}
        <div style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: '2px solid rgba(255,255,255,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src="/images/registered-wordmark/zark-reg-tp.png"
            alt="zarketplace (r)"
            crossOrigin="anonymous"
            style={{ height: isStory ? 30 : 22, width: (isStory ? 30 : 22) * WORDMARK_RATIO, objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
});

const WORDMARK_RATIO = 1083 / 202;

const chipStyle: React.CSSProperties = {
  border: '2px solid rgba(255,255,255,0.25)',
  padding: '8px 14px',
};
