import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck, Lock, Truck, BadgePercent } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { cn } from '../lib/utils';
import { log } from '../lib/log';
import { PromiseBanner } from '../components/PromiseBanner';

const hlog = log('home');

export function Home() {
  const [previewListings, setPreviewListings] = React.useState<Listing[]>([]);
  const { scrollYProgress } = useScroll();
  
  const backgroundY = useTransform(scrollYProgress, [0, 0.5], ['0%', '20%']);

  React.useEffect(() => {
    const t = hlog.time('fetchPreview');
    async function fetchPreview() {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .or('is_sold.is.null,is_sold.eq.false')
        .limit(5)
        .order('created_at', { ascending: false });
      t.end({ count: data?.length, error });
      if (data) setPreviewListings(data);
    }
    fetchPreview();
  }, []);

  return (
    <div className="flex flex-col bg-white">
   {/* PROMISE TICKER - desktop only, sits at the very top of the page below the fixed nav */}
   <div className="hidden md:block pt-20">
     <PromiseBanner variant="ticker" />
   </div>

   {/* HERO SECTION */}
   <section className="relative min-h-[72vh] sm:min-h-[85vh] flex items-center overflow-hidden bg-black text-white px-4 sm:px-6 lg:px-8 pt-28 pb-16 md:pt-20">

        <motion.div
          style={{ y: backgroundY }}
          className="absolute inset-0 overflow-hidden pointer-events-none"
        >
          <img
            src="/images/new-banner.png"
            className="w-full h-full object-cover object-left sm:object-center scale-100 sm:scale-105"
            alt="Hero Banner"
          />
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/60" />
        </motion.div>

        <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col gap-8 sm:gap-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 lg:gap-10">
            <div className="overflow-hidden max-w-3xl">
              <motion.h1
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                className="text-[13vw] sm:text-[8vw] lg:text-[4.4vw] font-black leading-[0.9] tracking-tighter uppercase drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]"
              >
                <span className="text-white">Buy & sell<br />pre-owned fashion</span>
              </motion.h1>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex flex-row items-stretch gap-4 w-full sm:w-auto shrink-0"
            >
              <Link to="/browse" className="flex-1 sm:flex-none sm:w-56 bg-white py-6 sm:py-7 text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] text-center">
                Browse
              </Link>
              <Link to="/sell" className="flex-1 sm:flex-none sm:w-56 border border-white py-6 sm:py-7 text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-white transition-all hover:scale-105 active:scale-95 hover:bg-white hover:text-black text-center">
                Start Selling
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4 w-fit mx-auto place-items-center text-center"
          >
            <span className="flex items-center gap-2.5 text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-white">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" /> Buyer Protection
            </span>
            <span className="flex items-center gap-2.5 text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-white">
              <Lock className="h-5 w-5 sm:h-6 sm:w-6" /> Secure payments
            </span>
            <span className="flex items-center gap-2.5 text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-white">
              <Truck className="h-5 w-5 sm:h-6 sm:w-6" /> Pickup handled for you
            </span>
            <span className="flex items-center gap-2.5 text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-white">
              <BadgePercent className="h-5 w-5 sm:h-6 sm:w-6" /> No selling fees
            </span>
          </motion.div>
        </div>
      </section>

  {/* PROMISE TICKER - mobile only, desktop version sits above the hero */}
  <div className="md:hidden">
    <PromiseBanner variant="ticker" />
  </div>

  {/* MARKETPLACE PREVIEW SECTION */}
<section className="pt-6 sm:pt-10 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 mb-8 sm:mb-10">
    <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter uppercase leading-none">
      Available now.
    </h2>

    <Link
      to="/browse"
      className="group flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1 self-start sm:self-auto"
    >
      View All
      <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
    </Link>
  </div>

  {previewListings.length > 0 ? (
    <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {previewListings.map((listing) => (
        <div key={listing.id} className="snap-start shrink-0 w-[45vw] sm:w-[220px] lg:w-[230px]">
          <ListingCard listing={listing} />
        </div>
      ))}
    </div>
  ) : (
    <div className="flex gap-6 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="shrink-0 w-[45vw] sm:w-[220px] lg:w-[230px] aspect-[3/4] bg-zinc-50 animate-pulse border border-black/5" />
      ))}
    </div>
  )}
</section>

{/* RESALE WITHOUT THE FRICTION */}
<section className="relative min-h-[380px] sm:min-h-[460px] flex items-center py-16 sm:py-0 overflow-hidden bg-black text-white border-y border-white/10">
        <div className="absolute inset-0 opacity-25">
          <img
            src="/images/clothes-chair.png"
            className="w-full h-full object-cover"
            alt="Resale background"
          />
        </div>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-24 lg:items-center">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9] text-white">
                Resale, <br />
                without the friction.
              </h2>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-12 justify-center">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-8">
                {[
                  'Buyer Protection',
                  'Secure payments',
                  'Tracked shipping',
                  'Verified listings',
                  'No "DM for price"',
                  'No selling fees',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-black text-[10px] font-black">✓</span>
                    <span className="text-xs sm:text-sm font-bold uppercase tracking-widest text-white">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

{/* SUSTAINABILITY SECTION */}
<section className="relative min-h-[380px] sm:min-h-[460px] flex items-center py-16 sm:py-0 px-4 sm:px-6 lg:px-8 overflow-hidden bg-black text-white">
        <div className="absolute inset-0 opacity-40">
          <img
            src="/images/dump.png"
            className="w-full h-full object-cover opacity-90"
            alt="Sustainability background"
          />
        </div>
        <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
          <div className="flex flex-col gap-4 text-center sm:text-left">
            <div className="flex flex-col gap-0">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
                Reduce waste,
              </h2>
              <p className="-mt-2 md:-mt-3 text-4xl md:text-6xl font-serif italic tracking-tight lowercase leading-tight">
                buy pre-loved.
              </p>
            </div>
            <p className="text-sm font-medium uppercase tracking-widest text-white leading-relaxed max-w-2xl">
              <span className="block sm:inline">Keep clothes in circulation</span>
              <span className="block sm:inline"> and out of landfills.</span>
            </p>
          </div>
          <a
            href="https://www.youtube.com/@zarketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 self-center border border-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-white transition-all hover:scale-105 active:scale-95 hover:bg-white hover:text-black text-center"
          >
            Why This Matters
          </a>
        </div>
      </section>

{/* SELLER / F*CK FAST FASHION SECTION */}
<section className="relative min-h-[380px] sm:min-h-[460px] flex items-center py-16 sm:py-0 px-4 sm:px-6 lg:px-8 overflow-hidden bg-black text-white border-t border-white/10">
        <div className="absolute inset-0 opacity-40">
          <img
            src="/images/red.png"
            className="w-full h-full object-cover opacity-90"
            alt="Seller background"
          />
        </div>
        <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-10 sm:gap-8 px-4 sm:px-6 lg:px-8">
          <Link to="/sell" className="order-2 sm:order-1 shrink-0 self-center bg-white px-12 py-5 text-[11px] font-black uppercase tracking-[0.4em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)] text-center">
            Start Selling Now
          </Link>
          <div className="order-1 sm:order-2 flex flex-col gap-2 items-center sm:items-end text-center sm:text-right">
            <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase leading-[0.85]">
              F*ck Fast Fashion!
            </h2>
            <p className="text-2xl md:text-5xl font-serif italic tracking-tight lowercase leading-tight">
              sell ur thrifted finds here.
            </p>
          </div>
        </div>
      </section>

{/* CULTURE / MISSION SECTION */}
<section className="relative min-h-[380px] sm:min-h-[460px] flex items-center py-16 sm:py-0 bg-black text-white overflow-hidden border-t border-white/5">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/denim.jpg"
            className="w-full h-full object-cover opacity-40"
            alt="Culture"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:text-left justify-between gap-12 lg:gap-20">
            {/* Left Side: Heading */}
            <div className="w-full lg:max-w-xl">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
                Good clothes deserve <br />
                <span className="font-serif italic font-light tracking-normal lowercase">another life.</span>
              </h2>
            </div>

            {/* Right Side: Description Text */}
            <div className="flex flex-col items-center lg:items-start gap-6 text-white/80 text-sm font-medium uppercase tracking-widest leading-relaxed max-w-md lg:mt-4">
              <p>resellers, IG thrift stores and everyday sellers all in one place.</p>
              <Link to="/about" className="border border-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-white transition-all hover:scale-105 active:scale-95 hover:bg-white hover:text-black mt-4">
                Learn About Our Mission
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}