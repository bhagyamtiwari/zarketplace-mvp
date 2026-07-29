// Full-bleed campaign band: photograph, a hard uppercase line, a serif italic
// counter-line, and one button that goes somewhere real. This is the house
// voice, kept in a single component so every band on the site scrims, sizes and
// wraps identically instead of each page inventing its own.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

interface Props {
  image: string;
  heading: string;
  /** Serif italic counter-line under the heading. */
  script?: string;
  body?: string;
  cta?: { label: string; to: string };
  /** 'right' flips the copy to the right and the button to the left. */
  align?: 'left' | 'right';
  className?: string;
}

export function CampaignBand({ image, heading, script, body, cta, align = 'left', className }: Props) {
  return (
    <section className={cn('relative isolate overflow-hidden bg-black text-white', className)}>
      <img
        src={image}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover opacity-45"
      />
      {/* Fixed scrim rather than a per-image guess: the copy has to stay legible
          whatever the photograph does behind it. */}
      <div aria-hidden className="absolute inset-0 bg-black/45" />

      {/* Copy on one side, button on the other and vertically centred, so the
          band is only as tall as its text instead of stacking into dead space. */}
      <div
        className={cn(
          'relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14',
          'flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12',
          align === 'right' && 'md:flex-row-reverse',
        )}
      >
        <div className={cn('flex flex-col gap-3', align === 'right' && 'md:text-right md:items-end')}>
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter leading-[0.88]">
              {heading}
            </h2>
            {script && (
              <p className="text-2xl sm:text-4xl font-serif italic tracking-tight lowercase leading-tight">
                {script}
              </p>
            )}
          </div>

          {body && (
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.15em] leading-[1.8] text-white/70 max-w-[46ch]">
              {body}
            </p>
          )}
        </div>

        {cta && (
          <Link
            to={cta.to}
            className="shrink-0 self-start md:self-auto border border-white bg-white px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-black hover:bg-transparent hover:text-white transition-colors"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </section>
  );
}
