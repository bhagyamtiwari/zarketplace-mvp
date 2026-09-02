// The product gallery: the carousel, the thumbnails and the zoom view.
//
// It was three behaviours that had grown separately and did not agree with
// each other. Arrows were hidden until hover, so on a laptop you could not see
// that there was more than one photo and on a phone they never appeared at
// all. A swipe did nothing until you let go, then cut abruptly to the next
// image. Zoom opened on any click and closed on any click, so tapping to look
// closer dismissed it, and the magnification was fixed with no way in or out.
//
// Rebuilt as one component so the three share a state and behave like one
// thing: the image follows your finger, arrows are always visible where a
// pointer exists, and zoom is a deliberate mode you enter and leave.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ZoomIn, Minus, Plus } from 'lucide-react';
import { variantUrl, variantSrcSet } from '../lib/images';
import { cn } from '../lib/utils';

// Photos are the vendor's and the listing's; the usual soft deterrents against
// casual saving, which is all any of this can be.
const PROTECT: React.CSSProperties = {
  WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
};

interface Props { images: string[]; alt: string }

export function ProductGallery({ images, alt }: Props) {
  const [index, setIndex] = React.useState(0);
  const [zoomOpen, setZoomOpen] = React.useState(false);

  // Live horizontal offset while a finger or pointer is down, so the image
  // tracks the gesture instead of sitting still until it ends.
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const gesture = React.useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null);

  const count = images.length;
  const clamp = React.useCallback((i: number) => (i + count) % count, [count]);
  const go = React.useCallback((delta: number) => setIndex((i) => clamp(i + delta)), [clamp]);

  // A drag has to travel a quarter of the frame to advance. Below that it
  // springs back, which is what makes a half-hearted swipe feel deliberate
  // rather than random.
  const commitDrag = (dx: number) => {
    const width = frameRef.current?.offsetWidth ?? 320;
    if (Math.abs(dx) > width * 0.25) go(dx < 0 ? 1 : -1);
    setDragX(0);
    setDragging(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (count < 2) return;
    gesture.current = { x: e.clientX, y: e.clientY, locked: null };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!gesture.current) return;
    const dx = e.clientX - gesture.current.x;
    const dy = e.clientY - gesture.current.y;

    // Decide once whether this is a horizontal swipe or a vertical scroll, and
    // then stay out of the way of whichever it is. Without this the carousel
    // fights the page scroll on a phone.
    if (!gesture.current.locked && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      gesture.current.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (gesture.current.locked !== 'x') return;
    e.preventDefault();
    setDragX(dx);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.x;
    if (g.locked === 'x') { commitDrag(dx); return; }
    setDragging(false);
    setDragX(0);
    // A tap that never became a drag opens the zoom view.
    if (Math.abs(dx) < 6 && Math.abs(e.clientY - g.y) < 6) setZoomOpen(true);
  };

  // Arrow keys move through the gallery when it has focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomOpen(true); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-label={`${alt}, image ${index + 1} of ${count}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { gesture.current = null; setDragX(0); setDragging(false); }}
        onContextMenu={(e) => e.preventDefault()}
        className="relative aspect-[3/4] overflow-hidden bg-zinc-50 touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-black cursor-zoom-in"
        style={PROTECT}
      >
        {/* One rail carrying every image, moved as a unit. The old version
            swapped the src and cross-faded, which is why a swipe read as a cut
            rather than as movement. */}
        <div
          className="flex h-full w-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
            transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {images.map((img, i) => (
            <img
              key={img + i}
              src={variantUrl(img, 'full')}
              srcSet={variantSrcSet(img, ['grid', 'full'])}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt={i === index ? alt : ''}
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
              referrerPolicy="no-referrer"
              className="h-full w-full shrink-0 object-cover"
              style={PROTECT}
            />
          ))}
        </div>

        {count > 1 && (
          <>
            {/* Visible whenever a pointer exists, not only on hover: an arrow
                that appears when you are already on top of it cannot tell you
                there is more than one photo. */}
            <GalleryArrow side="left" onClick={() => go(-1)} />
            <GalleryArrow side="right" onClick={() => go(1)} />
          </>
        )}

        <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 bg-white/90 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-black">
          <ZoomIn className="h-3 w-3" /> Tap to zoom
        </span>

        {count > 1 && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={cn('h-1.5 w-1.5 rounded-full transition-colors',
                i === index ? 'bg-black' : 'bg-black/25')} />
            ))}
          </div>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={img + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'h-16 w-12 shrink-0 overflow-hidden bg-zinc-50 border transition-colors',
                i === index ? 'border-black' : 'border-transparent opacity-55 hover:opacity-100',
              )}
            >
              <img src={variantUrl(img, 'thumb')} alt="" draggable={false}
                className="h-full w-full object-cover" referrerPolicy="no-referrer" style={PROTECT} />
            </button>
          ))}
        </div>
      )}

      {zoomOpen && (
        <ZoomView
          images={images} alt={alt} index={index}
          onIndex={setIndex} onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}

function GalleryArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center',
        'bg-white/85 text-black transition-colors hover:bg-white',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/**
 * Zoom is a mode, not a hover state.
 *
 * The old version opened on any click and closed on any click, so tapping to
 * look closer dismissed it. Here it closes on the X, on Escape, or on the
 * backdrop - and a tap on the image itself toggles magnification, which is
 * what a tap on a zoomed photo is for.
 */
function ZoomView({ images, alt, index, onIndex, onClose }: {
  images: string[]; alt: string; index: number;
  onIndex: (i: number) => void; onClose: () => void;
}) {
  const [scale, setScale] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinch = React.useRef<{ dist: number; scale: number } | null>(null);

  const MIN = 1, MAX = 4;
  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') { onIndex((index - 1 + images.length) % images.length); reset(); }
      if (e.key === 'ArrowRight') { onIndex((index + 1) % images.length); reset(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [index, images.length, onIndex, onClose]);

  const setZoom = (next: number) => {
    const s = Math.min(MAX, Math.max(MIN, next));
    setScale(s);
    if (s === 1) setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || scale === 1) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    setPan({ x: drag.current.panX + dx, y: drag.current.panY + dy });
  };
  const onPointerUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    // A clean tap toggles magnification rather than closing, which is what
    // people reach for when a photo is already open.
    if (!moved) setZoom(scale > 1 ? 1 : 2.5);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    if (!pinch.current) { pinch.current = { dist, scale }; return; }
    setZoom(pinch.current.scale * (dist / pinch.current.dist));
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center justify-between px-4 py-4 text-white">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">
          {index + 1} / {images.length}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom(scale - 0.75)}
            className="p-3 text-white/70 hover:text-white disabled:opacity-30" disabled={scale <= MIN}>
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom(scale + 0.75)}
            className="p-3 text-white/70 hover:text-white disabled:opacity-30" disabled={scale >= MAX}>
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Close" onClick={onClose} className="p-3 text-white hover:text-white/70">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <img
          src={variantUrl(images[index], 'full')}
          alt={alt}
          draggable={false}
          referrerPolicy="no-referrer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onTouchMove={onTouchMove}
          onTouchEnd={() => { pinch.current = null; }}
          className={cn('absolute inset-0 m-auto max-h-full max-w-full object-contain',
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
          style={{
            ...PROTECT,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 200ms ease-out',
          }}
        />
      </div>

      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 pb-6">
          {images.map((_, i) => (
            <button key={i} type="button" aria-label={`Image ${i + 1}`}
              onClick={() => { onIndex(i); reset(); }}
              className={cn('h-1.5 rounded-full transition-all',
                i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60')} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
