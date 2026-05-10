import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, Instagram, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { cn } from '../lib/utils';
import { log } from '../lib/log';
import { LaunchOfferBanner } from '../components/LaunchOfferBanner';

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
   {/* HERO SECTION */}
   <section className="relative min-h-screen flex flex-col justify-center items-center overflow-hidden bg-black text-white px-4 pt-20">
        
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
            <div className="overflow-hidden mb-8">
              <motion.h1 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                className="text-[13vw] md:text-[8vw] font-black leading-[0.9] tracking-tighter uppercase max-w-5xl"
              >
                <span className="text-white">RIP dm2buy</span> <br />
                <span className="text-white">& dm4price.</span>
              </motion.h1>
            </div>
            

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex flex-col items-center gap-4 mb-16"
            >
              {/* Mobile 16px, Desktop text-s */}
              <p className="text-[16px] md:text-s font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-white">
                gen-z's marketplace
              </p>
              
              {/* Mobile 14px, Desktop text-s */}
              <p className="text-[14px] md:text-s font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-white">
                <span className="block md:inline">buy & sell</span> 
                <span className="hidden md:inline"> </span> 
                <span className="block md:inline">pre-owned fashion</span>
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full max-w-xl"
            >
              <Link to="/browse" className="w-full sm:w-64 bg-white py-6 text-[11px] font-black uppercase tracking-[0.3em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] text-center">
                Browse
              </Link>
              <Link to="/sell" className="w-full sm:w-64 border border-white py-6 text-[11px] font-black uppercase tracking-[0.3em] text-white transition-all hover:border-white hover:bg-white shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:text-black text-center">
                Start Selling
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

  {/* LAUNCH NEWS TICKER - infinite right-to-left scroll, headline-style */}
  <LaunchOfferBanner variant="ticker" />

  {/* MARKETPLACE PREVIEW SECTION */}
<section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 mb-20">
    <div className="flex flex-col gap-4">
      <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none">
        Available<br />now.
      </h2>
    </div>

    <Link 
      to="/browse" 
      className="group flex items-center gap-3 text-xs font-black uppercase tracking-[0.3em] border-b-2 border-black pb-2"
    >
      View All 
      <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
    </Link>
  </div>

  {previewListings.length > 0 ? (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-16">
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

{/* PROBLEM / SOLUTION SECTION - 20% (Shared with others) */}
<section className="py-24 bg-zinc-50 border-y border-black/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Reduced gap from 24 to 8 on mobile to bring list closer to the intro text */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-24">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">
                Resale, <br />
                without the friction.
              </h2>
              <div className="flex flex-col gap-4 text-black leading-relaxed text-sm font-black uppercase tracking-widest">
                <p>WE are building the infrastructure for the next generation of re-commerce in India.</p>
              </div>
            </div>
            
            <div className="lg:col-span-7 flex flex-col gap-12">
              {/* Reduced gap from 12 to 8 on mobile to bring individual items closer together */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-black uppercase tracking-tight">Discover new pieces</h4>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40">listings from sellers across India.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-black uppercase tracking-tight">List your items</h4>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40">Upload a piece in minutes.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-black uppercase tracking-tight">Sell faster</h4>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40">Reach buyers looking for exactly what you have.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-black uppercase tracking-tight">Secure Payments</h4>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40">Safe and reliable transactions for every order.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-black uppercase tracking-tight">Verified Sellers</h4>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40">Shop with confidence from trusted community members.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-black uppercase tracking-tight">Expanding everyday</h4>
                  <p className="text-xs font-bold uppercase tracking-widest text-black/40">More categories and collectibles coming soon.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SUSTAINABILITY SECTION */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden bg-black text-white">
        <div className="absolute inset-0 opacity-40">
          <img 
            src="/images/dump.png" 
            className="w-full h-full object-cover opacity-90" 
            alt="Sustainability background" 
          />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col gap-8">
          <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
            Save the world. <br />
            Save your pocket.
          </h2>
          <div className="flex flex-col gap-4 text-sm font-medium uppercase tracking-widest text-white leading-relaxed max-w-2xl">
            <p>we connect resellers, IG thrift stores, and everyday sellers in one place, making it easy to buy and sell pre-owned clothing across India.</p>
          </div>
        </div>
      </section>

      {/* SELLER SECTION */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden bg-black text-white">
        <div className="absolute inset-0 opacity-40">
          <img 
            src="/images/red.png" 
            className="w-full h-full object-cover opacity-90" 
            alt="Seller background" 
          />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-end gap-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 items-end">
            <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase leading-[0.85] text-right">
              F*ck Fast Fashion!
            </h2>
            <p className="text-2xl md:text-5xl font-serif italic tracking-tight text-right lowercase leading-tight">
              sell ur thrifted finds here.
            </p>
          </div>
          <Link to="/sell" className="group relative overflow-hidden bg-white px-12 py-5 text-[11px] font-black uppercase tracking-[0.4em] text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)]">
            Start Selling Now
          </Link>
        </div>
      </section>
{/* CULTURE / RESALE MESSAGE */}
<section className="relative py-24 bg-black text-white overflow-hidden border-t border-white/5">
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
          <div className="flex flex-col lg:flex-row items-start justify-between gap-12 lg:gap-20">
            {/* Left Side: Heading */}
            <div className="w-full lg:max-w-xl">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85]">
                Good clothes deserve <br />
                <span className="font-serif italic font-light tracking-normal lowercase">another life.</span>
              </h2>
            </div>

            {/* Right Side: Description Text */}
            <div className="flex flex-col gap-6 text-white/80 text-sm font-medium uppercase tracking-widest leading-relaxed max-w-md lg:mt-4">
              <p>We are building a centralized platform to bring structure and scale to India's fragmented resale economy, making sustainable fashion accessible to everyone.</p>
              <p>The future of fashion is circular-unlocking the value in existing garments rather than just producing new ones.</p>
              <Link to="/about" className="text-[10px] font-black underline tracking-[0.2em] text-white hover:text-white/80 transition-colors mt-4 block">
                Learn more about our mission
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}