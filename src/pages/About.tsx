import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

export function About() {
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-16"
      >
        <div className="flex flex-col gap-4 text-center items-center">
          <div className="flex items-center gap-3 mb-4">
            <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-8 w-auto" referrerPolicy="no-referrer" />
            <span className="lowercase font-black tracking-tighter text-3xl">zarketplace</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Our Mission</span>
          <h1 className="text-6xl font-black tracking-tighter uppercase">The Story</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">Bridging the gap in Indian resale culture</p>
        </div>

        <div className="flex flex-col gap-4 text-black leading-relaxed">
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 text-sm font-medium uppercase tracking-widest">
              <p>India’s resale market already exists. But it lives in fragments.</p>
              <p>Instagram pages, WhatsApp groups, and “DM to buy” transactions dominate, creating friction for both buyers and sellers.</p>
              <p>At the same time, consumer behavior is shifting. Recommerce is growing globally, driven by sustainability, price sensitivity, and changing culture.</p>
              <p>zarketplace is building the infrastructure to organize and scale this market.</p>
              <p>By bringing individual sellers, Instagram thrift stores, and independent resellers into one platform, zarketplace simplifies how pre-owned fashion is bought and sold across India.</p>
            </div>
          </section>

          <section className="flex flex-col gap-8 bg-zinc-50 p-12 border border-black/5">
            <h2 className="text-2xl font-black uppercase tracking-tight">Transparent Pricing</h2>
            <div className="flex flex-col gap-6 text-sm font-medium uppercase tracking-widest">
              <p>Resale in India lacks price clarity.</p>
              <p>Most transactions rely on private messages, negotiations, and inconsistent pricing. This slows everything down.</p>
              <p>zarketplace replaces that with structure.</p>
              <p>Every listing has a clear, upfront price. Buyers make faster decisions. Sellers reach more people.</p>
              <p>Less friction. More liquidity.</p>
            </div>
          </section>

          <section className="flex flex-col gap-8 bg-zinc-50 p-12 border border-black/5">
            <h2 className="text-2xl font-black uppercase tracking-tight">Sustainability & Circular Fashion</h2>
            <div className="flex flex-col gap-6 text-sm font-medium uppercase tracking-widest">
              <p>India produces and consumes massive volumes of clothing, while also receiving global textile waste.</p>
              <p>Resale is part of the solution.</p>
              <p>By extending the life of garments, zarketplace keeps clothing in circulation longer and reduces waste.</p>
              <p>Each transaction is small. At scale, it matters.</p>
            </div>
          </section>

          <section className="flex flex-col gap-8 bg-zinc-50 p-12 border border-black/5">
            <h2 className="text-2xl font-black uppercase tracking-tight">Empowering Entrepreneurship</h2>
            <div className="flex flex-col gap-6 text-sm font-medium uppercase tracking-widest">
              <p>India’s resale economy is powered by individuals. Thrift stores, resellers, and people selling from their own closets.</p>
              <p>What they lack is infrastructure.</p>
              <p>zarketplace provides that.</p>
              <p>A structured platform for discovery, pricing, and transactions. Access to a national audience.</p>
              <p>Lower barriers. More participation.</p>
            </div>
          </section>

          <section className="flex flex-col gap-8 bg-black text-white p-12">
            <h2 className="text-2xl font-black uppercase tracking-tight">Our Vision</h2>
            <div className="flex flex-col gap-6 text-sm font-medium uppercase tracking-widest leading-relaxed">
              <p>The Platform for Fashion Recommerce in India.</p>
              <p>We believe resale will become a fundamental part of how fashion is consumed in India.</p>
              <p>Our vision is to build the infrastructure that enables this shift.</p>
              <p>zarketplace is creating a centralized platform that brings structure, transparency, and scale to an otherwise fragmented ecosystem. By connecting buyers, independent sellers, and curated inventory within a single platform, we are laying the foundation for India’s circular fashion economy.</p>
              <p>The future of fashion is not only about producing new garments. It is about unlocking the value already present in existing ones.</p>
              <p>zarketplace is building the platform where that value is realized.</p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-12 border-t border-black/5">
          <Link to="/sell" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1">
            Start Selling with us <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
