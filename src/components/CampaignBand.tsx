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
  /**
   * Which of the two lines carries the weight.
   *
   * 'heading' is the house default and follows BrandKit: the serif is a single
   * italic breath at roughly two thirds the size of the shout above it.
   * 'script' inverts that and lets the serif be the payoff, which only works
   * when the phrase is short and the heading reads as its setup.
   */
  emphasis?: 'heading' | 'script';
  className?: string;
}

export function CampaignBand({
  image, heading, script, body, cta, align = 'left', emphasis = 'heading', className,
}: Props) {
  const scriptLed = emphasis === 'script';
  return (
    <section className={cn('relative isolate overflow-hidden bg-black text-white', className)}>
      <img
        src={image}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* One fixed scrim rather than a per-image guess: dark enough for white
          type over any photograph, light enough that the photograph is still
          the thing you see. It was a faded image under a second dark layer,
          which left a dark block with a rumour of a picture in it. */}
      <div aria-hidden className="absolute inset-0 bg-black/60" />

      {/* Copy on one side, button on the other and vertically centred. The
          breathing room is padding inside the band, over the photograph - the
          bands themselves stay flush, so the images read as one continuous
          block rather than three cards separated by white gutters. */}
      <div
        className={cn(
          'relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24',
          // Alignment applies at every width now, not just md and up. Both
          // bands used to be left-aligned on a phone, so the pair lost the
          // alternation that makes them read as two separate statements rather
          // than one block repeated twice down the page.
          'flex flex-col gap-6',
          align === 'right' ? 'items-end text-right' : 'items-start text-left',
          'md:flex-row md:items-center md:justify-between md:gap-12',
          align === 'right' && 'md:flex-row-reverse',
        )}
      >
        <div className={cn('flex flex-col gap-3', align === 'right' ? 'items-end text-right' : 'items-start text-left')}>
          <div className="flex flex-col gap-1">
            <h2 className={cn(
              'font-black uppercase tracking-tighter leading-[0.88]',
              scriptLed ? 'text-2xl sm:text-4xl lg:text-5xl' : 'text-3xl sm:text-5xl',
            )}>
              {heading}
            </h2>
            {script && (
              <p className={cn(
                'font-serif italic tracking-tight lowercase',
                scriptLed
                  // Steps up hard at each breakpoint: on a wide screen the
                  // phrase is the thing you see from across the room, and on a
                  // phone it still has to sit on one line at 375px.
                  ? 'text-[2.75rem] leading-[0.95] sm:text-7xl lg:text-8xl sm:leading-[0.9] -mt-1'
                  : 'text-2xl sm:text-4xl leading-tight',
              )}>
                {script}
              </p>
            )}
          </div>

          {body && (
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.15em] leading-[1.8] max-w-[46ch]">
              {body}
            </p>
          )}
        </div>

        {/* On a phone the button sits on the far side from the copy, so the
            band still reads as copy on one side and action on the other, the
            way it does side by side on a wide screen. */}
        {cta && (
          <Link
            to={cta.to}
            className={cn(
              'shrink-0 border border-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-white hover:text-black transition-colors',
              align === 'right' ? 'self-start md:self-auto' : 'self-end md:self-auto',
            )}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </section>
  );
}
