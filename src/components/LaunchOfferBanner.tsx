// Shared launch-offer banner used across the site. Three variants keep copy
// and styling consistent: top-of-page ribbon, in-page card, and tooltip.

import * as React from 'react';
import { motion } from 'motion/react';
import { Sparkles, X, BadgePercent } from 'lucide-react';
import { cn } from '../lib/utils';

const COPY =
  "Launch offer: list and get paid with no platform fees. zarketplace's standard fees of 10-15% will be reintroduced for listings made after the launch period.";

const SHORT_COPY = '0% platform fees during launch.';

const RIBBON_DISMISS_KEY = 'zk_launch_ribbon_dismissed_v1';

interface Props {
  variant: 'ribbon' | 'card' | 'tooltip' | 'badge' | 'inline' | 'ticker' | 'pricing' | 'product-row';
  className?: string;
}

// Headline phrases used by the news-ticker variant. Mix punchy + informative.
const TICKER_PHRASES = [
  '0% PLATFORM FEES',
  'LIST FREE  -  GET PAID DIRECT',
  'LIMITED LAUNCH OFFER',
  'KEEP 100% OF EVERY SALE',
  'STANDARD 10-15% FEES RETURN AFTER LAUNCH',
  'NO MIDDLEMAN  -  NO HIDDEN CUTS',
];

export function LaunchOfferBanner({ variant, className }: Props) {
  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || variant !== 'ribbon') return false;
    return sessionStorage.getItem(RIBBON_DISMISS_KEY) === '1';
  });

  if (variant === 'ribbon') {
    if (dismissed) return null;
    return (
      <div className={cn('w-full bg-black text-white text-center text-[10px] font-black uppercase tracking-widest py-2 px-6 flex items-center justify-center gap-3 relative', className)}>
        <Sparkles className="h-3 w-3" />
        <span>{COPY}</span>
        <button
          aria-label="Dismiss launch offer"
          onClick={() => {
            setDismissed(true);
            try { sessionStorage.setItem(RIBBON_DISMISS_KEY, '1'); } catch {}
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={cn('flex items-start gap-3 border border-black bg-yellow-50 p-5', className)}>
        <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Launch Offer</span>
          <p className="text-[11px] font-bold leading-relaxed text-black/70">{COPY}</p>
        </div>
      </div>
    );
  }

  if (variant === 'tooltip') {
    return (
      <span className={cn('group relative inline-flex items-center gap-1', className)}>
        <span className="text-[10px] font-black uppercase tracking-widest underline decoration-dotted cursor-help">
          0% fees
        </span>
        <span className="pointer-events-none absolute left-0 top-full mt-2 z-50 hidden group-hover:block w-72 bg-black text-white p-3 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
          {COPY}
        </span>
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <span className={cn('inline-flex items-center gap-2 bg-yellow-50 border border-black px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em]', className)}>
        <Sparkles className="h-3 w-3" />
        {SHORT_COPY}
      </span>
    );
  }

  if (variant === 'product-row') {
    // Designed to slot inside a product page's existing icon-row group
    // (Truck / Free shipping, RotateCcw / Returns, etc.). Pure b/w, same
    // typographic scale as the rows it sits next to.
    return (
      <div className={cn('flex items-center gap-4 text-[11px] font-black uppercase tracking-widest', className)}>
        <BadgePercent className="h-4 w-4 text-black" />
        <span>
          0% platform fee
          <span className="text-black/40 font-bold ml-2">- launch offer</span>
        </span>
      </div>
    );
  }

  if (variant === 'pricing') {
    // Sell-page callout. Treats the launch offer as a fee receipt — the
    // language a seller actually cares about (what they pay, what they keep).
    // Pure b/w + typographic hierarchy, matches the page's brutalist system.
    return (
      <div className={cn('border border-black bg-white', className)}>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] divide-y sm:divide-y-0 sm:divide-x divide-black">
          {/* Left: the headline value */}
          <div className="px-8 py-6 flex flex-col gap-3 sm:min-w-[260px]">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/50">
              Platform fee
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl sm:text-6xl font-black tracking-tighter uppercase leading-none">
                Free
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-black/40 line-through">
                10 - 15%
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-black/50">
              You keep 100% of every sale
            </span>
          </div>

          {/* Right: explanation */}
          <div className="px-8 py-6 flex flex-col justify-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black">
              Limited launch offer
            </span>
            <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 leading-relaxed">
              List today and pay zero platform fees on this item, forever.
              Standard fees of 10 - 15% return for listings created after the
              launch period ends.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'ticker') {
    // Two identical strips placed side-by-side; we translate the wrapper from
    // 0% to -50% so when the first strip fully scrolls off, the second is in
    // its exact starting position. The loop is therefore seamless.
    const strip = (
      <div className="flex items-center shrink-0">
        {TICKER_PHRASES.map((phrase, i) => (
          <React.Fragment key={i}>
            <span className="flex items-center gap-3 px-8 py-3 text-[12px] sm:text-sm font-black uppercase tracking-[0.3em] whitespace-nowrap">
              <Sparkles className="h-3.5 w-3.5" />
              {phrase}
            </span>
            <span aria-hidden className="text-black/40 select-none">/</span>
          </React.Fragment>
        ))}
      </div>
    );
    return (
      <div
        className={cn(
          'w-full overflow-hidden bg-yellow-300 text-black border-y-2 border-black',
          className,
        )}
        role="marquee"
        aria-label="Launch offer"
      >
        <motion.div
          className="flex w-max"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ ease: 'linear', duration: 28, repeat: Infinity }}
        >
          {strip}
          {strip}
        </motion.div>
      </div>
    );
  }

  // inline
  return (
    <p className={cn('text-[10px] font-bold uppercase tracking-widest text-black/60', className)}>
      <Sparkles className="inline h-3 w-3 mr-1 -mt-0.5" />
      {SHORT_COPY}
    </p>
  );
}
