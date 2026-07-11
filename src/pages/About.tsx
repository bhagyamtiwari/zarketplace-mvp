import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { InfoPageNav } from '../components/InfoPageNav';

export function About() {
  useDocumentTitle('About');

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black hover:text-black/80 mb-8 lg:mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
        <InfoPageNav />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-8 sm:gap-10 flex-1 min-w-0"
        >
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase">What Is zarketplace</h1>
            <p className="text-sm font-black uppercase tracking-widest text-black">Infrastructure for Indian resale</p>
          </div>

          <p className="text-sm font-medium uppercase tracking-widest leading-relaxed text-black/80 max-w-2xl">
            India's resale market already exists. It lives in Instagram DMs and WhatsApp groups, with no upfront price and no protection for either side. zarketplace is the infrastructure underneath it: verified listings, upfront prices, secure payments, and payouts that just work.
          </p>

          <section className="flex flex-col gap-4 bg-zinc-50 p-6 sm:p-10 border border-black/5">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">The Market</h2>
            <p className="text-sm font-medium uppercase tracking-widest leading-relaxed">
              India's secondhand apparel market is worth roughly $3.5 billion and growing over 13% a year. (UniVDatos, 2025) The demand is already here. What's missing is infrastructure, not appetite.
            </p>
          </section>

          <section className="flex flex-col gap-4 bg-black text-white p-6 sm:p-10">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Why It Matters</h2>
            <p className="text-sm font-medium uppercase tracking-widest leading-relaxed">
              Every sale on zarketplace keeps a garment in circulation instead of a landfill. At scale, that's not a footnote - it's the point. The future of fashion isn't only what gets made. It's what gets kept in use.
            </p>
          </section>

          <p className="text-xs font-medium uppercase tracking-widest text-black/40">
            zarketplace is an ADNIZ Private Limited project.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
