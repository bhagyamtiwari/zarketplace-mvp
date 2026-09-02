import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';
import { cn } from '../lib/utils';
import { CONDITIONS } from '../lib/condition';

export function Condition() {
  usePageMeta(META.conditions);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black/40 hover:text-black mb-8 lg:mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to zarketplace
      </Link>

      <div className="flex flex-col">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-12 flex-1 min-w-0"
        >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Conditions Guide</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">How every piece is graded</p>
          <p className="body-longform max-w-[64ch]">
            Every item is graded on the same five-tier scale, so the word on one listing means what it means on all of them.
          </p>
        </div>

        <section className="p-6 sm:p-10 bg-black text-white flex flex-col gap-4">
          <h3 className="text-sm font-black uppercase tracking-widest">Please note</h3>
          <p className="body-longform max-w-[64ch]">
            Condition is a judgement, and an honest one can still be a close call between two tiers. We check every item against its listing before it ships, and anything that does not match does not go out.
          </p>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONDITIONS.map((c, idx) => (
            <div
              key={c.name}
              className={cn(
                'flex flex-col gap-2 p-6 bg-zinc-50 border border-black/5',
                idx === CONDITIONS.length - 1 && CONDITIONS.length % 2 === 1 && 'sm:col-span-2'
              )}
            >
              <h2 className="flex items-baseline gap-2.5 text-lg font-black uppercase tracking-tight text-black">
                {c.name}
                <span className="text-xs tracking-[0.2em] text-black/40">{c.grade}</span>
              </h2>
              <p className="text-xs font-medium uppercase tracking-widest leading-relaxed text-black/60">{c.desc}</p>
            </div>
          ))}
        </div>

        <section className="p-6 sm:p-10 bg-black text-white flex flex-col gap-4">
          <h3 className="text-sm font-black uppercase tracking-widest">A note on pre-owned items</h3>
          <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">
            As pre-owned pieces, items may carry light odors or signs of storage. We recommend following care labels and washing, or dry cleaning, garments before first wear.
          </p>
        </section>
        </motion.div>
      </div>
    </div>
  );
}
