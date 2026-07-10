import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck, Lock, Truck } from 'lucide-react';
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
        .limit(4)
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
   <section className="relative min-h-[62vh] sm:min-h-[68vh] flex flex-col justify-center items-center overflow-hidden bg-black text-white px-4 pt-28 pb-12 md:pt-16">

        <motion.div
          style={{ y: backgroundY }}
          className="absolute inset-0 overflow-hidden pointer-events-none"
        >
          <img
            src="images/banner.png"
            className="w-full h-full object-cover opacity-30 scale-110"
            alt="Hero Banner"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-80" />
        </motion.div>

        <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="flex flex-col items-center"
          >
            <div className="overflow-hidden mb-6">
              <motion.h1
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                className="text-[11vw] md:text-[6vw] font-black leading-[0.9] tracking-tighter uppercase max-w-4xl"
              >
                <span className="text-white">Buy & sell pre-owned fashion.</span>
              </motion.h1>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-sm md:text-base font-bold uppercase tracking-[0.2em] text-white/70 mb-8 max-w-xl"
            >
              No selling fees. Buyer Protection on every order. Pickup and delivery handled for you.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md mb-10"
            >
              <Link to="/browse" className="w-full sm:w-56 bg-white py-5 text-[11px] font-black uppercase tracking-[0.3em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] text-center">
                Browse
              </Link>
              <Link to="/sell" className="text-[11px] font-black uppercase tracking-[0.3em] text-white/70 hover:text-white underline underline-offset-4 transition-colors">
                Start Selling
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
            >
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                <ShieldCheck className="h-3.5 w-3.5" /> Buyer Protection
              </span>
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                <Lock className="h-3.5 w-3.5" /> Secure payments
              </span>
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                <Truck className="h-3.5 w-3.5" /> Pickup handled for you
              </span>
            </motion.div>
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
    <h2 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase leading-none">
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 md:gap-y-12">
      {previewListings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  ) : (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="aspect-[3/4] bg-zinc-50 animate-pulse border border-black/5" />
      ))}
    </div>
  )}
</section>

{/* RESALE WITHOUT THE FRICTION */}
<section className="py-16 sm:py-24 bg-zinc-50 border-y border-black/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-24 lg:items-center">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">
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
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black text-white text-[10px] font-black">✓</span>
                    <span className="text-xs sm:text-sm font-bold uppercase tracking-widest">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

{/* SUSTAINABILITY SECTION */}
<section className="relative py-16 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden bg-black text-white">
        <div className="absolute inset-0 opacity-40">
          <img
            src="/images/dump.png"
            className="w-full h-full object-cover opacity-90"
            alt="Sustainability background"
          />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-center sm:items-start gap-8 text-center sm:text-left">
          <div className="flex flex-col gap-0">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
              Reduce waste,
            </h2>
            <p className="-mt-2 md:-mt-3 text-4xl md:text-6xl font-serif italic tracking-tight lowercase leading-tight">
              buy pre-loved.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm font-medium uppercase tracking-widest text-white leading-relaxed max-w-2xl">
            <p>
              <span className="block sm:inline">Keep clothes in circulation</span>
              <span className="block sm:inline"> and out of landfills.</span>
            </p>
          </div>
          <a
            href="https://www.youtube.com/@zarketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden bg-white px-12 py-5 text-[11px] font-black uppercase tracking-[0.4em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)]"
          >
            Why This Matters
          </a>
        </div>
      </section>

{/* SELLER / F*CK FAST FASHION SECTION */}
<section className="relative py-16 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden bg-black text-white border-t border-white/10">
        <div className="absolute inset-0 opacity-40">
          <img
            src="/images/red.png"
            className="w-full h-full object-cover opacity-90"
            alt="Seller background"
          />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-center sm:items-end gap-10 sm:gap-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 items-center sm:items-end">
            <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase leading-[0.85] text-center sm:text-right">
              F*ck Fast Fashion!
            </h2>
            <p className="text-2xl md:text-5xl font-serif italic tracking-tight text-center sm:text-right lowercase leading-tight">
              sell ur thrifted finds here.
            </p>
          </div>
          <Link to="/sell" className="group relative overflow-hidden bg-white px-12 py-5 text-[11px] font-black uppercase tracking-[0.4em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)]">
            Start Selling Now
          </Link>
        </div>
      </section>

{/* CULTURE / MISSION SECTION */}
<section className="relative py-16 sm:py-24 bg-black text-white overflow-hidden border-t border-white/5">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/denim.jpg"
            className="w-full h-full object-cover opacity-40"
            alt="Culture"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
              <Link to="/about" className="group relative overflow-hidden bg-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)] mt-4">
                Learn About Our Mission
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}