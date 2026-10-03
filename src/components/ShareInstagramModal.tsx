// The Instagram image for an item: a 1080 x 1080 post or a 1080 x 1920 story.
// This file only previews and downloads. What the image looks like, and why,
// is docs/SHARE_IMAGE_SYSTEM.md, implemented in src/lib/shareImage/.

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2 } from 'lucide-react';
import { Listing } from '../types';
import { cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { shareDataFor } from '../lib/shareImage/data';
import { ensureFonts, loadPhoto, renderShare, type ShareFormat } from '../lib/shareImage/render';

interface Props {
  open: boolean;
  onClose: () => void;
  listing: Listing;
}

const FORMATS: Array<[ShareFormat, string]> = [['square', 'Post 1:1'], ['story', 'Story 9:16']];

async function renderFor(listing: Listing, src: string, format: ShareFormat, qr: boolean) {
  await ensureFonts();
  const photo = await loadPhoto(variantUrl(src, 'full'));
  return renderShare({ format, data: shareDataFor(listing), photo, qr });
}

function download(canvas: HTMLCanvasElement, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Could not export the image')); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      resolve();
    }, 'image/png');
  });
}

export function ShareInstagramModal({ open, onClose, listing }: Props) {
  const [format, setFormat] = React.useState<ShareFormat>('square');
  const [qr, setQr] = React.useState(true);
  const [imageIdx, setImageIdx] = React.useState(0);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState<'one' | 'all' | null>(null);
  const current = React.useRef<HTMLCanvasElement | null>(null);

  const images = React.useMemo(() => {
    const arr = listing.image_urls && listing.image_urls.length > 0 ? listing.image_urls : [listing.image_url];
    return arr.filter(Boolean) as string[];
  }, [listing]);

  React.useEffect(() => { if (open) { setImageIdx(0); setError(null); } }, [open]);

  React.useEffect(() => {
    if (!open || !images[imageIdx]) return;
    let live = true;
    setRendering(true);
    setError(null);
    renderFor(listing, images[imageIdx], format, qr)
      .then((canvas) => {
        if (!live) return;
        current.current = canvas;
        setPreview(canvas.toDataURL('image/jpeg', 0.9));
      })
      .catch(() => { if (live) setError('This photo could not be loaded. Try another one, or reload.'); })
      .finally(() => { if (live) setRendering(false); });
    return () => { live = false; };
  }, [open, listing, images, imageIdx, format, qr]);

  const slug = (listing.title || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  const downloadOne = async () => {
    if (!current.current) return;
    setDownloading('one');
    try { await download(current.current, `zarketplace-${slug}-${format}-${imageIdx + 1}.png`); }
    catch { setError('Could not save the image. Try again.'); }
    finally { setDownloading(null); }
  };

  const downloadAll = async () => {
    setDownloading('all');
    try {
      for (let i = 0; i < images.length; i++) {
        const canvas = await renderFor(listing, images[i], format, qr);
        await download(canvas, `zarketplace-${slug}-${format}-${i + 1}.png`);
        // A gap, so the browser does not fold quick downloads into one.
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch {
      setError('Some images could not be saved. Download them one at a time.');
    } finally {
      setDownloading(null);
    }
  };

  if (!open) return null;

  const segment = (active: boolean) => cn(
    'px-3.5 py-2 text-[11px] font-bold transition-colors',
    active ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100',
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
          className="relative w-full max-w-4xl bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>

          <div className="grid grid-cols-1 gap-8 p-6 sm:p-8 md:grid-cols-[1fr_300px]">
            {/* The image itself, as large as the screen allows. */}
            <div className="relative flex min-h-[320px] items-center justify-center bg-zinc-100 p-4 sm:p-6">
              {preview && (
                <img
                  src={preview}
                  alt="Preview of the Instagram image"
                  className={cn('max-h-[70vh] w-auto shadow-lg transition-opacity', rendering && 'opacity-60', format === 'square' ? 'aspect-square' : 'aspect-[9/16]')}
                />
              )}
              {rendering && !preview && <Loader2 className="h-6 w-6 animate-spin" />}
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1 pr-8">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Instagram image</h2>
                <p className="text-sm">A post or a story of this item, ready to share.</p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold">Format</span>
                <div className="flex self-start border border-black/15">
                  {FORMATS.map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setFormat(k)} className={segment(format === k)} aria-pressed={format === k}>{label}</button>
                  ))}
                </div>
              </div>

              {images.length > 1 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-bold">Photo</span>
                  <div className="flex flex-wrap gap-2">
                    {images.map((src, i) => (
                      <button
                        key={src + i} type="button" onClick={() => setImageIdx(i)} aria-label={`Photo ${i + 1}`}
                        className={cn('h-16 w-12 overflow-hidden border-2 transition-opacity', imageIdx === i ? 'border-black' : 'border-transparent opacity-60 hover:opacity-100')}
                      >
                        <img src={variantUrl(src, 'thumb')} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={qr} onChange={(e) => setQr(e.target.checked)} className="h-4 w-4 accent-black" />
                QR code
              </label>

              {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}

              <div className="mt-auto flex flex-col gap-3">
                <button
                  type="button" onClick={downloadOne} disabled={downloading !== null || rendering || !preview}
                  className="inline-flex items-center justify-center gap-2 bg-black py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {downloading === 'one' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                </button>
                {images.length > 1 && (
                  <button
                    type="button" onClick={downloadAll} disabled={downloading !== null}
                    className="inline-flex items-center justify-center gap-2 border border-black py-4 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    {downloading === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download all {images.length}
                  </button>
                )}
                <p className="text-xs leading-relaxed">Caption idea: just listed on @zarketplace. Link in bio.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
