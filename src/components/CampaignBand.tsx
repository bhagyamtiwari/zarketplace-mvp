// Full-bleed campaign band: photograph, a hard uppercase line, a serif italic
// counter-line, and one button that goes somewhere real. This is the house
// voice, kept in a single component so every band on the site scrims, sizes and
// wraps identically instead of each page inventing its own.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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

      {/* Copy on one side, button on the other and vertically centred. The
          breathing room is padding inside the band, over the photograph - the
          bands themselves stay flush, so the images read as one continuous
          block rather than three cards separated by white gutters. */}
      <div
        className={cn(
          'relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24',
          // Left-aligned at every width: the copy hangs off the same edge as
          // the rest of the page, and on a phone the button lands directly
          // under the line that earned it rather than centred below it.
          'flex flex-col items-start text-left gap-6',
          'md:flex-row md:items-center md:justify-between md:gap-12',
          align === 'right' && 'md:flex-row-reverse',
        )}
      >
        <div className={cn('flex flex-col items-start gap-3', align === 'right' && 'md:text-right md:items-end')}>
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
            className="group shrink-0 flex items-center gap-4 border border-white bg-white px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-black hover:bg-transparent hover:text-white transition-colors"
          >
            {cta.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
