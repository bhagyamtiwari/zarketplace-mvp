import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Loader2, RotateCcw, ArrowLeft, ChevronLeft, ChevronRight, Grid, Layout, ShoppingBag, Check, Share2, X, ZoomIn, Link as LinkIcon, ShieldCheck } from 'lucide-react';
import { log } from '../lib/log';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { formatCurrency as fmt } from '../lib/utils';

const plog = log('product');

// Best-effort deterrence against casual image saving: blocks right-click save,
// native drag-to-download, and iOS Safari's long-press "Save Image" callout.
// Not a real DRM measure (images are still in the page source) — just removes
// the easy one-tap/one-click paths without breaking image loading or zoom.
const imageProtectStyle: React.CSSProperties = {
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
};

const CONDITION_TIERS = [
  { name: 'As Is', desc: 'Heavily worn or naturally damaged. Visible flaws such as stains, holes, or broken hardware. Best for upcycling or collectors who appreciate the wear story.' },
  { name: 'Fair', desc: 'Noticeable wear from regular use. May include fading, loose threads, or minor marks. Still wearable with character.' },
  { name: 'Good', desc: 'Gently used with some signs of wear. Slight fading or small imperfections, but overall in solid shape.' },
  { name: 'Great', desc: 'Lightly worn and well cared for. Minimal signs of wear. No major flaws or damage. Clean and ready to wear.' },
  { name: 'Pristine', desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear. Tags may or may not be attached.' }
];

// UUIDv4-ish detector. We accept either /product/:id (UUID) or /item/:sku.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ProductPage() {
  const params = useParams();
  const slug = (params.sku || params.id || '').trim();
  const navigate = useNavigate();
  const { add, has, forceAdd } = useCart();
  const { user } = useAuth();
  const [authModal, setAuthModal] = React.useState<null | { redirectTo: string; onSuccess?: () => void; message?: string }>(null);
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [currentImageIdx, setCurrentImageIdx] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<'carousel' | 'grid'>('carousel');
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [cartMsg, setCartMsg] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [showConditionMeter, setShowConditionMeter] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [stickyBarVisible, setStickyBarVisible] = React.useState(true);
  const stickyStopRef = React.useRef<HTMLDivElement>(null);

  // The sticky mobile buy bar should only follow the user down to the end of
  // the seller's description, not all the way to the footer.
  React.useEffect(() => {
    const el = stickyStopRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyBarVisible(entry.boundingClientRect.top > 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [listing?.id]);

  // Swipe state for the mobile carousel. Declared here (not below the
  // loading/not-found early returns) so the hook order stays identical
  // across renders — hooks after a conditional return crash React (#310).
  const swipeRef = React.useRef<{ startX: number } | null>(null);
  const justSwipedRef = React.useRef(false);

  const dragRef = React.useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const zoomImgRef = React.useRef<HTMLImageElement>(null);
  const [panLimit, setPanLimit] = React.useState({ x: 0, y: 0 });

  const openZoom = () => { setPan({ x: 0, y: 0 }); setZoomOpen(true); };
  const closeZoom = () => setZoomOpen(false);

  const ZOOM_SCALE = 2.2;

  // Pan limits must match how far the scaled image actually overflows the
  // viewport on each axis - a fixed pixel limit left corners unreachable on
  // large viewports and over-restricted small ones.
  const recomputePanLimit = React.useCallback(() => {
    const img = zoomImgRef.current;
    if (!img || !img.offsetWidth || !img.offsetHeight) return;
    setPanLimit({
      x: Math.max(0, (img.offsetWidth * ZOOM_SCALE - window.innerWidth) / 2),
      y: Math.max(0, (img.offsetHeight * ZOOM_SCALE - window.innerHeight) / 2),
    });
  }, []);

  React.useEffect(() => {
    if (!zoomOpen) return;
    recomputePanLimit();
    window.addEventListener('resize', recomputePanLimit);
    return () => window.removeEventListener('resize', recomputePanLimit);
  }, [zoomOpen, recomputePanLimit]);

  const onZoomPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onZoomPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
    const nextX = Math.max(-panLimit.x, Math.min(panLimit.x, dragRef.current.panX + dx));
    const nextY = Math.max(-panLimit.y, Math.min(panLimit.y, dragRef.current.panY + dy));
    setPan({ x: nextX, y: nextY });
  };
  const onZoomPointerUp = () => {
    const wasDrag = dragRef.current?.moved;
    dragRef.current = null;
    if (!wasDrag) closeZoom();
  };

  React.useEffect(() => {
    async function fetchListing() {
      if (!slug) return;
      const t = plog.time(`fetch ${slug}`);
      setLoading(true);
      try {
        // SKU lookup is case-insensitive; UUID lookup uses .eq on id.
        const isUuid = UUID_RE.test(slug);
        const query = supabase.from('listings').select('*');
        const { data, error } = isUuid
          ? await query.eq('id', slug).maybeSingle()
          : await query.ilike('sku', slug).maybeSingle();
        t.end({ found: !!data, error });
        if (error) throw error;
        setListing(data);
      } catch (err) {
        plog.error('fetch THREW', err);
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black/20" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-24 sm:pt-28 pb-14 sm:pb-20 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Listing not found</h1>
        <button onClick={() => navigate('/browse')} className="mt-8 text-xs font-bold uppercase tracking-widest underline">
          Back to marketplace
        </button>
      </div>
    );
  }

  const images = listing.image_urls && listing.image_urls.length > 0 
    ? listing.image_urls 
    : [listing.image_url];

  const currentConditionIdx = CONDITION_TIERS.findIndex(t => t.name === listing.condition);

  const nextImage = () => setCurrentImageIdx((prev) => (prev + 1) % images.length);
  const prevImage = () => setCurrentImageIdx((prev) => (prev - 1 + images.length) % images.length);

  // Swipe left/right on the mobile carousel to switch photos. A swipe past
  // the threshold suppresses the click-to-zoom that follows touchend.
  const SWIPE_THRESHOLD = 40;

  const onCarouselTouchStart = (e: React.TouchEvent) => {
    swipeRef.current = { startX: e.touches[0].clientX };
  };
  const onCarouselTouchEnd = (e: React.TouchEvent) => {
    if (!swipeRef.current || images.length <= 1) { swipeRef.current = null; return; }
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      justSwipedRef.current = true;
      if (dx < 0) nextImage(); else prevImage();
    }
    swipeRef.current = null;
  };
  const handleCarouselClick = () => {
    if (justSwipedRef.current) { justSwipedRef.current = false; return; }
    openZoom();
  };

  const purchasable = listing.status === 'approved' && !listing.is_sold;

  const handleBuyNow = () => {
    if (!user) {
      setAuthModal({ redirectTo: `/checkout/${listing.id}`, message: 'Sign in to buy.' });
      return;
    }
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-28 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-6 sm:mb-10">
        <ArrowLeft className="h-3 w-3" /> Back to Browse
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        {/* Image Gallery */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <button 
                onClick={() => setViewMode('carousel')}
                className={cn(
                  "p-2 transition-colors",
                  viewMode === 'carousel' ? "text-black" : "text-black/40"
                )}
              >
                <Layout className="h-4 w-4" />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-2 transition-colors",
                  viewMode === 'grid' ? "text-black" : "text-black/40"
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>
            {viewMode === 'carousel' && images.length > 1 && (
              <span className="text-[10px] font-black uppercase tracking-widest text-black">
                {currentImageIdx + 1} / {images.length}
              </span>
            )}
          </div>

          {viewMode === 'carousel' ? (
            <div
              className="relative aspect-[3/4] overflow-hidden bg-zinc-50 group cursor-zoom-in touch-pan-y"
              onContextMenu={(e) => e.preventDefault()}
              onClick={handleCarouselClick}
              onTouchStart={onCarouselTouchStart}
              onTouchEnd={onCarouselTouchEnd}
            >
              <div className="h-full w-full overflow-hidden">
                <motion.img
                  key={currentImageIdx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  src={images[currentImageIdx]}
                  alt={listing.title}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  style={imageProtectStyle}
                />
              </div>

              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 p-3 text-black opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 p-3 text-black opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              <div className="absolute bottom-4 right-4 bg-white/80 p-2 text-black pointer-events-none">
                <ZoomIn className="h-3.5 w-3.5" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6" onContextMenu={(e) => e.preventDefault()}>
              {images.map((img, idx) => (
                <div key={idx} className="aspect-[3/4] overflow-hidden bg-zinc-50">
                  <img
                    src={img}
                    alt={`${listing.title} - ${idx + 1}`}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={imageProtectStyle}
                  />
                </div>
              ))}
            </div>
          )}

          {viewMode === 'carousel' && images.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide" onContextMenu={(e) => e.preventDefault()}>
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIdx(idx)}
                  className={cn(
                    "relative aspect-[3/4] w-24 flex-shrink-0 overflow-hidden border-2 transition-all",
                    currentImageIdx === idx ? "border-black" : "border-transparent opacity-50"
                  )}
                >
                  <img
                    src={img}
                    className="h-full w-full object-cover"
                    alt={`Thumb ${idx}`}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={imageProtectStyle}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="lg:col-span-7 flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase leading-snug">{listing.title}</h1>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">{listing.brand}</span>
            <div className="mt-4 flex items-center gap-6">
              {listing.sale_price ? (
                <>
                  <span className="text-3xl font-black text-red-600">{formatCurrency(listing.sale_price)}</span>
                  <span className="text-xl text-black/30 line-through font-bold">{formatCurrency(listing.price)}</span>
                </>
              ) : (
                <span className="text-3xl font-black">{formatCurrency(listing.price)}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-6 gap-x-4 border-y border-black/5 py-8">
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black block mb-1">Size</span>
              <p className="font-black text-base uppercase tracking-tight">{listing.size_type || 'One Size'}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black">Condition</span>
                <button
                  type="button"
                  onClick={() => setShowConditionMeter((v) => !v)}
                  className="text-[9px] font-black uppercase tracking-widest underline decoration-black/20 hover:decoration-black transition-all"
                >
                  (Learn More)
                </button>
              </div>
              <p className="font-black text-base uppercase tracking-tight">{listing.condition}</p>

              {showConditionMeter && (
                <div className="mt-4 bg-zinc-50 border border-black/5 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-1">
                    {CONDITION_TIERS.map((tier, idx) => (
                      <div
                        key={tier.name}
                        className={cn('h-1.5 flex-1 rounded-full', idx <= currentConditionIdx ? 'bg-black' : 'bg-black/10')}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[7px] font-black uppercase tracking-widest text-black/40">
                    {CONDITION_TIERS.map((tier) => <span key={tier.name}>{tier.name}</span>)}
                  </div>
                  <p className="text-[10px] font-medium leading-relaxed text-black/70">
                    {CONDITION_TIERS[currentConditionIdx]?.desc}
                  </p>
                </div>
              )}
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black block mb-1">Shipping</span>
              <p className="font-black text-base uppercase tracking-tight">
                {listing.shipping_mode === 'paid' && (listing.shipping_cost || 0) > 0
                  ? fmt(listing.shipping_cost)
                  : 'Free'}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black block mb-1">Product Code</span>
              <p className="font-black text-base uppercase tracking-tight">{listing.sku || `ZV-${listing.id.slice(0, 8).toUpperCase()}`}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {listing.status !== 'approved' ? (
              <div className="w-full border border-amber-200 bg-amber-50 px-6 py-6 flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-700">
                  {listing.status === 'pending' ? 'Pending admin approval' : 'Listing not available'}
                </span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700/80 leading-relaxed">
                  {user?.id === listing.seller_id
                    ? 'Your listing is awaiting admin approval. It will be visible on browse and purchasable once approved. Until then, no one (including you) can buy or add it to cart.'
                    : 'This listing is not yet available to purchase.'}
                </p>
              </div>
            ) : listing.is_sold ? (
              <div className="w-full bg-zinc-100 py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-black/40 cursor-not-allowed border border-black/5">
                Sold Out
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="w-full bg-black py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
                >
                  Buy it now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (has(listing.id)) { navigate('/cart'); return; }
                    setCartMsg(null);
                    if (!user) {
                      const target = listing;
                      setAuthModal({
                        redirectTo: `/product/${listing.id}`,
                        message: 'Sign in to add to cart.',
                        onSuccess: async () => {
                          const res = await add(target);
                          if (res.ok) setCartMsg('Added to cart');
                          else if ('reason' in res && res.reason === 'different_seller') setConflict(true);
                        },
                      });
                      return;
                    }
                    const res = await add(listing);
                    if (res.ok) setCartMsg('Added to cart');
                    else if ('reason' in res && res.reason === 'different_seller') setConflict(true);
                  }}
                  className="w-full border border-black py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-black transition-all hover:bg-black hover:text-white flex items-center justify-center gap-3"
                >
                  {has(listing.id) ? (
                    <><Check className="h-4 w-4" /> In cart - view cart</>
                  ) : (
                    <><ShoppingBag className="h-4 w-4" /> Add to cart</>
                  )}
                </button>
                {cartMsg && <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{cartMsg}</p>}
                {conflict && (
                  <div className="border border-black/10 bg-zinc-50 p-4 flex flex-col gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest">
                      Your cart already has items from another seller. Clear cart and add this?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => { await forceAdd(listing); setConflict(false); setCartMsg('Cart replaced'); }}
                        className="flex-1 bg-black py-3 text-[10px] font-black uppercase tracking-widest text-white"
                      >
                        Clear & Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setConflict(false)}
                        className="flex-1 border border-black/10 py-3 text-[10px] font-black uppercase tracking-widest"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest">Seller's Description</h3>
              <div className="flex flex-col gap-4">
                <p className="text-black/70 text-[9px] font-medium uppercase tracking-widest leading-relaxed whitespace-pre-line">{listing.description}</p>
              </div>
            </div>

            <div ref={stickyStopRef} />

            <div className="flex flex-col gap-4 pt-6 border-t border-black/5">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setCartMsg(null);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="self-start flex items-center gap-3 text-[11px] font-black uppercase tracking-widest hover:text-black/60 transition-colors"
              >
                <LinkIcon className="h-4 w-4 text-black" />
                {copied ? 'Link Copied' : 'Copy Link'}
              </button>
              <div className="flex items-start gap-4 text-[11px] font-black uppercase tracking-widest">
                <ShieldCheck className="h-4 w-4 text-black shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <Link to="/buyer-protection" className="underline">Buyer Protection</Link>
                  <span className="text-[9px] font-bold tracking-widest text-black/40 leading-relaxed normal-case">
                    Your payment is held until you confirm delivery. Refund if the item is significantly not as described.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest">
                <RotateCcw className="h-4 w-4 text-black" />
                <Link to="/returns" className="underline">Returns & Cancellations Policy</Link>
              </div>
            </div>

            {user?.id === listing.seller_id && (
              <div className="mt-4 pt-6 border-t border-black/5 flex flex-col gap-3">
                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">Seller tools</span>
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="self-start inline-flex items-center gap-3 border border-black px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" /> Generate Instagram image
                </button>
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed max-w-md">
                  Download a branded post or story image of your listing in one click.
                  <br />
                  Only you can see this.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {purchasable && stickyBarVisible && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-black/10 px-4 py-3 flex items-center gap-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-black uppercase tracking-widest text-black/40 truncate">{listing.title}</p>
            <p className="text-lg font-black tracking-tight">
              {formatCurrency(listing.sale_price ?? listing.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuyNow}
            className="shrink-0 bg-black text-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] active:scale-[0.98] transition-transform"
          >
            Buy Now
          </button>
        </div>
      )}

      {zoomOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center touch-none select-none"
          onPointerDown={onZoomPointerDown}
          onPointerMove={onZoomPointerMove}
          onPointerUp={onZoomPointerUp}
          onPointerCancel={onZoomPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={closeZoom}
            className="absolute top-6 right-6 z-10 bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="absolute top-7 left-6 z-10 text-[10px] font-black uppercase tracking-[0.2em] text-white">
            Drag to look around
          </span>
          <img
            ref={zoomImgRef}
            src={images[currentImageIdx]}
            alt={listing.title}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onLoad={recomputePanLimit}
            className="max-w-none w-full h-full object-contain cursor-grab"
            style={{
              transform: `scale(${ZOOM_SCALE}) translate(${pan.x / ZOOM_SCALE}px, ${pan.y / ZOOM_SCALE}px)`,
              ...imageProtectStyle,
            }}
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <AuthModal
        open={!!authModal}
        onClose={() => setAuthModal(null)}
        redirectTo={authModal?.redirectTo}
        onSuccess={authModal?.onSuccess}
        message={authModal?.message}
      />
      {user?.id === listing.seller_id && (
        <ShareInstagramModal open={shareOpen} onClose={() => setShareOpen(false)} listing={listing} />
      )}
    </div>
  );
}
