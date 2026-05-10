// ShareInstagramModal - lets a seller download a polished Instagram-ready
// image of their listing (square 1:1 or story 9:16) with @zarketplace branding.
// The card is rendered offscreen at full pixel resolution and captured via
// html-to-image. A scaled-down preview is shown to the user.

import * as React from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2, Square, Smartphone } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';

function productUrl(listing: Listing): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zarketplace.com';
  // Prefer pretty SKU URL when available; fall back to UUID.
  const path = listing.sku ? `/item/${listing.sku}` : `/product/${listing.id}`;
  return `${origin}${path}`;
}

type Format = 'square' | 'story';

const DIMS: Record<Format, { w: number; h: number; previewScale: number }> = {
  square: { w: 1080, h: 1080, previewScale: 0.34 },
  story: { w: 1080, h: 1920, previewScale: 0.22 },
};

interface Props {
  open: boolean;
  onClose: () => void;
  listing: Listing;
}

export function ShareInstagramModal({ open, onClose, listing }: Props) {
  const [format, setFormat] = React.useState<Format>('square');
  const [downloading, setDownloading] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const download = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 1,
        width: DIMS[format].w,
        height: DIMS[format].h,
        // Force the captured element to render at full size regardless of CSS scaling.
        style: { transform: 'none', transformOrigin: 'top left' },
      });
      const a = document.createElement('a');
      const safeTitle = (listing.title || 'listing').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      a.href = dataUrl;
      a.download = `zarketplace-${safeTitle}-${format}.png`;
      a.click();
    } catch (err) {
      console.error('share image generation failed', err);
      alert('Could not generate the image. Try again, and make sure the listing image has finished loading.');
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
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

          <div className="p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/50">Share to Instagram</span>
              <h2 className="text-2xl font-black tracking-tighter uppercase">Generate post image</h2>
              <p className="text-[11px] font-bold uppercase tracking-widest text-black/40 leading-relaxed max-w-xl">
                Download a branded image of this listing and post it on Instagram. Tag @zarketplace so we can repost.
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

            {/* Preview - scaled-down version of the actual card */}
            <div className="bg-zinc-100 p-6 flex justify-center">
              <div
                style={{
                  width: DIMS[format].w * DIMS[format].previewScale,
                  height: DIMS[format].h * DIMS[format].previewScale,
                }}
                className="relative overflow-hidden shadow-xl"
              >
                <div
                  style={{
                    transform: `scale(${DIMS[format].previewScale})`,
                    transformOrigin: 'top left',
                    width: DIMS[format].w,
                    height: DIMS[format].h,
                  }}
                >
                  <ShareCard ref={cardRef} listing={listing} format={format} />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={download} disabled={downloading}
                className="flex-1 bg-black text-white py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? 'Generating...' : 'Download PNG'}
              </button>
              <button onClick={onClose}
                className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white">
                Done
              </button>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
              Tip: post it as a single-image feed post or story. Mention <span className="text-black">@zarketplace</span> in
              your caption and add the link in your bio so people can shop directly.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// The actual share card. Rendered at full pixel size; the modal scales it down
// for preview. html-to-image captures the inner DOM verbatim.
const ShareCard = React.forwardRef<HTMLDivElement, { listing: Listing; format: Format }>(
  function ShareCard({ listing, format }, ref) {
    const w = DIMS[format].w;
    const h = DIMS[format].h;
    const isStory = format === 'story';
    const imageHeight = isStory ? 1280 : 720;
    const price = listing.sale_price ?? listing.price;
    const hasSale = !!listing.sale_price && listing.sale_price < listing.price;

    return (
      <div
        ref={ref}
        style={{
          width: w,
          height: h,
          background: '#fff',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#000',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Image area */}
        <div style={{ width: w, height: imageHeight, position: 'relative', background: '#f4f4f5', flexShrink: 0 }}>
          <img
            src={listing.image_url}
            crossOrigin="anonymous"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Top-left brand chip */}
          <div style={{
            position: 'absolute', top: 36, left: 36,
            background: '#fff', padding: '14px 20px',
            fontSize: 18, fontWeight: 900, letterSpacing: 4,
            textTransform: 'uppercase',
          }}>
            {listing.brand || 'zarketplace'}
          </div>
          {/* Top-right sale flag */}
          {hasSale && (
            <div style={{
              position: 'absolute', top: 36, right: 36,
              background: '#dc2626', color: '#fff', padding: '14px 20px',
              fontSize: 18, fontWeight: 900, letterSpacing: 4,
              textTransform: 'uppercase',
            }}>
              On sale
            </div>
          )}
        </div>

        {/* Info panel - black */}
        <div style={{
          flex: 1,
          background: '#000',
          color: '#fff',
          padding: isStory ? '64px 56px 56px' : '52px 56px 44px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h1 style={{
              fontSize: isStory ? 88 : 72,
              fontWeight: 900,
              letterSpacing: -2,
              textTransform: 'uppercase',
              lineHeight: 0.95,
              margin: 0,
              wordBreak: 'break-word',
            }}>
              {truncate(listing.title, isStory ? 60 : 50)}
            </h1>

            {/* Meta row: size · condition */}
            <div style={{
              display: 'flex', gap: 16, flexWrap: 'wrap',
              fontSize: 18, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase',
            }}>
              {listing.size && <span style={chipStyle}>Size {listing.size}</span>}
              {listing.condition && <span style={chipStyle}>{listing.condition}</span>}
            </div>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 8 }}>
              <span style={{ fontSize: isStory ? 120 : 96, fontWeight: 900, letterSpacing: -3 }}>
                {formatCurrency(price)}
              </span>
              {hasSale && (
                <span style={{
                  fontSize: 36, fontWeight: 800, color: '#a3a3a3',
                  textDecoration: 'line-through',
                }}>
                  {formatCurrency(listing.price)}
                </span>
              )}
            </div>
          </div>

          {/* Footer branding + QR */}
          <div style={{
            marginTop: 40,
            paddingTop: 32,
            borderTop: '2px solid rgba(255,255,255,0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 32,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textTransform: 'lowercase' }}>
                zarketplace.com
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.6 }}>
                Shop preloved fashion
              </span>
              <span style={{
                marginTop: 8, fontSize: 16, fontWeight: 900, letterSpacing: 2,
                padding: '10px 16px', border: '2px solid #fff', alignSelf: 'flex-start',
              }}>
                @zarketplace
              </span>
            </div>
            {/* QR code: white tile so the dark QR contrasts cleanly on black panel. */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <div style={{ background: '#fff', padding: 14, lineHeight: 0 }}>
                <QRCode
                  value={productUrl(listing)}
                  size={isStory ? 220 : 180}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <span style={{
                fontSize: 12, fontWeight: 900, letterSpacing: 3,
                textTransform: 'uppercase', opacity: 0.7,
              }}>
                Scan to shop
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

const chipStyle: React.CSSProperties = {
  border: '2px solid rgba(255,255,255,0.25)',
  padding: '10px 18px',
};

function truncate(s: string | null | undefined, n: number) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '...';
}
