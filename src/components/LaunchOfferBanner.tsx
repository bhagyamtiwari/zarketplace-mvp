// Shared launch-offer banner used across the site. Three variants keep copy
// and styling consistent: top-of-page ribbon, in-page card, and tooltip.

import * as React from 'react';
import { Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';

const COPY =
  "Launch offer: list and get paid with no platform fees. zarketplace's standard fees of 10-15% will be reintroduced for listings made after the launch period.";

const SHORT_COPY = '0% platform fees during launch.';

const RIBBON_DISMISS_KEY = 'zk_launch_ribbon_dismissed_v1';

interface Props {
  variant: 'ribbon' | 'card' | 'tooltip' | 'badge' | 'inline';
  className?: string;
}

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

  // inline
  return (
    <p className={cn('text-[10px] font-bold uppercase tracking-widest text-black/60', className)}>
      <Sparkles className="inline h-3 w-3 mr-1 -mt-0.5" />
      {SHORT_COPY}
    </p>
  );
}
