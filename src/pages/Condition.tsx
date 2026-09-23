import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';
import { CONDITIONS } from '../lib/condition';

export function Condition() {
  usePageMeta(META.conditions);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-8 sm:mb-12">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      <div className="flex flex-col">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6 sm:gap-8 flex-1 min-w-0"
        >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Conditions Guide</h1>
          {/* Full width of the section, like the panels below it. The measure
              cap made this one line stop two thirds of the way across while
              everything under it ran to the edge. */}
          <p className="text-sm leading-relaxed sm:leading-[1.75]">
            Every item is graded on the same four-tier scale, so the word on one listing means what it means on all of them.
          </p>
        </div>

        {/* The four tiers are the page, so they come first and stack in rank
            order, name on the left and definition on the right, so a scan
            down the names is a scan down the scale. On a phone they are set
            tight enough that all four fit on the first screen. The two notes
            that used to bracket them are one panel underneath: they qualify
            the scale, they do not introduce it. */}
        <ol className="flex flex-col gap-2 sm:gap-4">
          {CONDITIONS.map((c) => (
            <li
              key={c.name}
              className="relative grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-0.5 sm:gap-6 px-4 py-3 pl-5 sm:p-6 sm:pl-7 bg-zinc-50 border border-black/5 overflow-hidden"
            >
              <span
                aria-hidden
                className="absolute left-0 top-0 h-full w-1.5"
                style={{ backgroundColor: c.rank }}
              />
              <h2 className="flex items-baseline gap-2.5 text-base sm:text-lg font-bold text-black">
                {c.name}
                <span className="text-sm font-medium">{c.grade}</span>
              </h2>
              <p className="text-sm leading-snug sm:leading-[1.75] sm:pt-1">{c.desc}</p>
            </li>
          ))}
        </ol>

        <section className="w-full p-6 sm:p-10 bg-black text-white flex flex-col gap-4">
          <h3 className="text-sm font-black uppercase tracking-widest">Please note</h3>
          <p className="body-longform">
            Condition is a judgement, and an honest one can still be a close call between two tiers. We check every item against its listing before it ships, and anything that does not match does not go out.
          </p>
          <p className="body-longform">
            As pre-owned pieces, items may carry light odors or signs of storage. We recommend following care labels and washing, or dry cleaning, garments before first wear.
          </p>
        </section>
        </motion.div>
      </div>
    </div>
  );
}
