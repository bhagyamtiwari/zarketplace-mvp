// Sitewide banner carrying what zarketplace is: we buy the item, we check it,
// we ship it. The vendor-facing variant states the one number a vendor cares
// about - their own payout - and never anything about what we resell it for.

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface Props {
  variant: 'ticker' | 'pricing';
  className?: string;
}

// Headline phrases used by the news-ticker variant. Mix punchy + informative.
const TICKER_PHRASES = [
  'WE BUY IT. WE CHECK IT. WE SHIP IT.',
  'SOLD & SHIPPED BY ZARKETPLACE',
  'ONE SOURCE. EVERY PIECE CHECKED.',
  'PRE-LOVED, PROPERLY HANDLED.',
];

export function PromiseBanner({ variant, className }: Props) {
  if (variant === 'pricing') {
    // Sell-page callout. States the proposition plainly: a vendor names their
    // asking price, we come back with what we will pay, and that number is
    // locked before the item goes live. Nothing here references what the item
    // is later sold for - a vendor never sees that number.
    return (
      <div className={cn('border border-black bg-white', className)}>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] divide-y sm:divide-y-0 sm:divide-x divide-black">
          {/* Left: the headline value */}
          <div className="px-8 py-6 flex flex-col gap-3 sm:min-w-[260px]">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/50">
              Your payout
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl sm:text-6xl font-black tracking-tighter uppercase leading-none">
                Locked
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-black/50">
              Agreed before your item goes live
            </span>
          </div>

          {/* Right: explanation */}
          <div className="px-8 py-6 flex flex-col justify-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black">
              Tell us what you want for it
            </span>
            <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 leading-relaxed">
              We'll tell you what we'll pay. You decide before anything goes
              live, and that number never moves.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ticker
  // Two identical strips placed side-by-side; we translate the wrapper from
  // 0% to -50% so when the first strip fully scrolls off, the second is in
  // its exact starting position. The loop is therefore seamless.
  const strip = (
    <div className="flex items-center shrink-0">
      {TICKER_PHRASES.map((phrase, i) => (
        <React.Fragment key={i}>
          <span className="flex items-center px-8 py-3 text-[11px] sm:text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap">
            {phrase}
          </span>
          <span aria-hidden className="text-white/30 select-none">|</span>
        </React.Fragment>
      ))}
    </div>
  );
  const stripeBand = (
    <div
      aria-hidden
      className="h-2 w-full"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, #000 0, #000 10px, #fff 10px, #fff 20px)',
      }}
    />
  );
  return (
    <div className={cn('w-full', className)} role="marquee" aria-label="zarketplace promise">
      {stripeBand}
      <div className="w-full overflow-hidden bg-black text-white">
        <motion.div
          className="flex w-max"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ ease: 'linear', duration: 28, repeat: Infinity }}
        >
          {strip}
          {strip}
        </motion.div>
      </div>
      {stripeBand}
    </div>
  );
}
