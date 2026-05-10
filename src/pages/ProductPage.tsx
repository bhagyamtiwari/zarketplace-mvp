import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Loader2, Truck, RotateCcw, ArrowLeft, ChevronLeft, ChevronRight, Grid, Layout, ShoppingBag, Check, Share2 } from 'lucide-react';
import { log } from '../lib/log';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { LaunchOfferBanner } from '../components/LaunchOfferBanner';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { formatCurrency as fmt } from '../lib/utils';

const plog = log('product');

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
  const [zoomPos, setZoomPos] = React.useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = React.useState(false);
  const [cartMsg, setCartMsg] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPos({ x, y });
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
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-10">
        <ArrowLeft className="h-3 w-3" /> Back to Browse
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
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
              className="relative aspect-[3/4] overflow-hidden bg-zinc-50 group cursor-crosshair" 
              onContextMenu={(e) => e.preventDefault()}
              onMouseEnter={() => setIsZoomed(true)}
              onMouseLeave={() => setIsZoomed(false)}
              onMouseMove={handleMouseMove}
            >
              <div className="h-full w-full overflow-hidden">
                <motion.img
                  key={currentImageIdx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  src={images[currentImageIdx]}
                  alt={listing.title}
                  className={cn(
                    "h-full w-full object-cover transition-transform duration-200 ease-out",
                    isZoomed ? "scale-[2.5]" : "scale-100"
                  )}
                  style={isZoomed ? {
                    transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`
                  } : undefined}
                  referrerPolicy="no-referrer"
                />
              </div>

              {images.length > 1 && (
                <>
                  <button 
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 p-3 text-black opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 p-3 text-black opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
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
                  />
                </div>
              ))}
            </div>
          )}

          {viewMode === 'carousel' && images.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {images.map((img, idx) => (
                <button 
                  key={idx}
                  onClick={() => setCurrentImageIdx(idx)}
                  className={cn(
                    "relative aspect-[3/4] w-24 flex-shrink-0 overflow-hidden border-2 transition-all",
                    currentImageIdx === idx ? "border-black" : "border-transparent opacity-50"
                  )}
                >
                  <img src={img} className="h-full w-full object-cover" alt={`Thumb ${idx}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="lg:col-span-7 flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">{listing.brand}</span>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">{listing.title}</h1>
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

          <div className="grid grid-cols-2 gap-y-8 gap-x-4 border-y border-black/5 py-10">
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black block mb-1">Size</span>
              <p className="font-black text-lg uppercase tracking-tight">{listing.size}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black">Condition</span>
                <div className="group relative">
                  <button className="text-[9px] font-black uppercase tracking-widest underline decoration-black/20 hover:decoration-black transition-all">
                    (Learn More)
                  </button>
                  <div className="absolute left-0 bottom-full mb-2 w-64 bg-black text-white p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="flex flex-col gap-3">
                      {CONDITION_TIERS.map(tier => (
                        <div key={tier.name} className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest">{tier.name}</span>
                          <p className="text-[9px] font-medium leading-relaxed opacity-60">{tier.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <p className="font-black text-lg uppercase tracking-tight">{listing.condition}</p>
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
                  onClick={() => {
                    if (!user) {
                      setAuthModal({ redirectTo: `/checkout/${listing.id}`, message: 'Sign in to buy.' });
                      return;
                    }
                    navigate(`/checkout/${listing.id}`);
                  }}
                  className="w-full bg-black py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
                >
                  Buy it now
                </button>
                <button
                  type="button"
                  onClick={async () => {
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
                {has(listing.id) && (
                  <Link to="/cart" className="text-center text-[10px] font-black uppercase tracking-widest text-black/60 underline">
                    Go to cart
                  </Link>
                )}
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
              <h3 className="text-[10px] font-black uppercase tracking-widest">Description</h3>
              <div className="flex flex-col gap-4">
                <p className="text-black text-sm font-medium uppercase tracking-widest leading-relaxed whitespace-pre-line">{listing.description}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-6 border-t border-black/5">
              <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest">
                <Truck className="h-4 w-4 text-black" />
                <span>
                  {listing.shipping_mode === 'paid' && (listing.shipping_cost || 0) > 0
                    ? `Shipping: ${fmt(listing.shipping_cost)}`
                    : 'Free shipping'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest">
                <RotateCcw className="h-4 w-4 text-black" />
                <Link to="/returns" className="underline">Returns & Cancellations Policy</Link>
              </div>
              <LaunchOfferBanner variant="product-row" />
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
                  Only you can see this. Download a branded post or story image of your listing in one click.
                </p>
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-black/5">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
                Product Code: {listing.sku || `ZV-${listing.id.slice(0, 8).toUpperCase()}`}
              </p>
            </div>
          </div>
        </div>
      </div>
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
