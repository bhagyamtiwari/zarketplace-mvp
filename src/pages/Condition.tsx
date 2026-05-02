import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const CONDITION_TIERS = [
  { 
    name: 'Pristine', 
    desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear. Tags may or may not be attached.' 
  },
  { 
    name: 'Great', 
    desc: 'Lightly worn and well cared for. Minimal signs of wear. No major flaws or damage. Clean and ready to wear.' 
  },
  { 
    name: 'Good', 
    desc: 'Gently used with some signs of wear. Slight fading or small imperfections, but overall in solid shape. Still has many lives left.' 
  },
  { 
    name: 'Fair', 
    desc: 'Noticeable wear from regular use. May include fading, loose threads, or minor marks. Still wearable with character.' 
  },
  { 
    name: 'As Is', 
    desc: 'Heavily worn or naturally damaged. Visible flaws such as stains, holes, or broken hardware. Best for upcycling or collectors who appreciate the wear story. Priced accordingly.' 
  }
];

export function Condition() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-12"
      >
        <div className="flex flex-col gap-4">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/40">Standards</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Item Condition</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">How every piece is graded</p>
        </div>

        <div className="prose prose-zinc max-w-none flex flex-col gap-10 text-black leading-relaxed">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-black uppercase tracking-widest">every item is listed under one of five condition tiers. this allows for complete transparency so you know exactly what you're getting.</p>
            <p className="text-xs font-bold uppercase tracking-widest text-black">
              * Please note: Conditions are filled in by the sellers. While we require sellers follow our criteria strictly, condition can be subjective.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {CONDITION_TIERS.map(tier => (
              <div key={tier.name} className="flex flex-col gap-2 p-6 bg-zinc-50 border border-black/5">
                <h2 className="text-lg font-black uppercase tracking-tight text-black">{tier.name}</h2>
                <p className="text-[10px] font-medium uppercase tracking-widest leading-relaxed text-black/60">{tier.desc}</p>
              </div>
            ))}
          </div>

          <section className="p-8 bg-black text-white flex flex-col gap-4">
            <h3 className="text-sm font-black uppercase tracking-widest">A note on pre-owned items</h3>
            <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">
              As pre-owned pieces, items may carry light odors or signs of storage. We recommend following care labels and washing, or dry cleaning, garments before first wear.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
