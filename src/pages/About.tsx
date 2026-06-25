import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function About() {
  useDocumentTitle('About');

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-8 sm:gap-12"
      >
        <div className="flex flex-col gap-3 text-center items-center">
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase">The Story</h1>
          <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-black">Bridging the gap in Indian resale culture</p>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4 text-black leading-relaxed">
          <section className="flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col gap-4 sm:gap-6 text-xs sm:text-sm font-medium uppercase tracking-widest">
              <p>India’s resale market already exists. It just lives in fragments: Instagram pages, WhatsApp groups, and “DM to buy” transactions that create friction for everyone involved.</p>
            </div>
          </section>

          <section className="flex flex-col gap-4 sm:gap-6 bg-zinc-50 p-6 sm:p-10 border border-black/5">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">The Opportunity</h2>
            <div className="flex flex-col gap-4 sm:gap-6 text-xs sm:text-sm font-medium uppercase tracking-widest">
              <p>India’s secondhand apparel market is valued at ~$3.5 billion and growing at over 13% a year, one of the fastest-growing segments in Asian fashion. (UniVDatos, 2025)</p>
              <p>The buyers and sellers are already here. What’s missing is infrastructure.</p>
            </div>
          </section>

          <section className="flex flex-col gap-4 sm:gap-6 bg-zinc-50 p-6 sm:p-10 border border-black/5">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">What We’re Building</h2>
            <div className="flex flex-col gap-4 sm:gap-6 text-xs sm:text-sm font-medium uppercase tracking-widest">
              <p>zarketplace brings individual sellers, Instagram thrift stores, and independent resellers onto one platform.</p>
              <p>Every listing has a clear, upfront price. No DMs, no negotiation, no friction. Just a national audience and a faster path to sale.</p>
            </div>
          </section>

          <section className="flex flex-col gap-4 sm:gap-6 bg-zinc-50 p-6 sm:p-10 border border-black/5">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Why It Matters</h2>
            <div className="flex flex-col gap-4 sm:gap-6 text-xs sm:text-sm font-medium uppercase tracking-widest">
              <p>India produces and consumes massive volumes of clothing. Every transaction on zarketplace extends the life of a garment. At scale, that adds up.</p>
              <p>This isn’t just a marketplace. It’s infrastructure for circular fashion.</p>
            </div>
          </section>

          <section className="flex flex-col gap-4 sm:gap-6 bg-black text-white p-6 sm:p-10">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Our Vision</h2>
            <div className="flex flex-col gap-4 sm:gap-6 text-xs sm:text-sm font-medium uppercase tracking-widest leading-relaxed">
              <p>The future of fashion isn’t only about producing new garments. It’s about unlocking the value already in the ones that exist. zarketplace is building the platform where that value is realized.</p>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3 text-black leading-relaxed">
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 text-xs sm:text-sm font-medium uppercase tracking-widest">
              <p>zarketplace is an ADNIZ Private Limited project.</p>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
