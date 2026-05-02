import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Loader2, Truck, RotateCcw, Mail, Info, ArrowLeft, ChevronLeft, ChevronRight, Grid, Layout } from 'lucide-react';

const CONDITION_TIERS = [
  { name: 'As Is', desc: 'Heavily worn or naturally damaged. Visible flaws such as stains, holes, or broken hardware. Best for upcycling or collectors who appreciate the wear story.' },
  { name: 'Fair', desc: 'Noticeable wear from regular use. May include fading, loose threads, or minor marks. Still wearable with character.' },
  { name: 'Good', desc: 'Gently used with some signs of wear. Slight fading or small imperfections, but overall in solid shape.' },
  { name: 'Great', desc: 'Lightly worn and well cared for. Minimal signs of wear. No major flaws or damage. Clean and ready to wear.' },
  { name: 'Pristine', desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear. Tags may or may not be attached.' }
];

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [currentImageIdx, setCurrentImageIdx] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<'carousel' | 'grid'>('carousel');
  const [zoomPos, setZoomPos] = React.useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPos({ x, y });
  };

  React.useEffect(() => {
    async function fetchListing() {
      if (!id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setListing(data);
      } catch (err) {
        console.error('Error fetching listing:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [id]);

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
            <Link 
              to={`/checkout/${listing.id}`}
              className="w-full bg-black py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
            >
              Buy it now
            </Link>
            <button 
              disabled
              className="w-full border border-black/5 py-6 text-center text-[10px] font-black uppercase tracking-[0.3em] text-black/20 cursor-not-allowed"
            >
              send offers coming soon
            </button>
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
                <span>India-wide shipping</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest">
                <RotateCcw className="h-4 w-4 text-black" />
                <Link to="/returns" className="underline">Returns & Cancellations Policy</Link>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-black/5">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
                Product Code: ZV-{listing.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
