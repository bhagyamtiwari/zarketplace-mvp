// A process as a row of numbered boxes joined by lines, for the pages that
// explain how an order moves: How It Works, Buyer Protection, Returns.
//
// Black means one thing: the step you are looking at. Three ways to move it,
// all of them immediate:
//
//   - Scroll. Every STEP_PX of scrolling moves it one box on, and scrolling
//     back moves it back. Counted from where the flow sat when the page
//     loaded, so a flow already on screen responds to the first flick of the
//     wheel. Scrolling is only read, never captured.
//   - Hover, on a mouse.
//   - Click, tap or keyboard.
//
// Hover lasts only while the pointer is on the flow: move off it and black
// goes back to wherever scrolling had it, so it never sticks at a random box.
// A click or tap (no hover on a phone) holds until the next whole scroll step.
//
// A row on desktop, a column on a phone. The line into the current box draws
// itself as you arrive, with a small parcel running along it.

import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export interface FlowStep {
  label: string;
  detail?: string;
}

// Scroll distance per step. Small on purpose: a nudge of the wheel is a step.
const STEP_PX = 70;
// A flow below the fold starts counting once its top reaches this far down.
const START_AT = 0.8;

export function ProcessFlow({ steps }: { steps: FlowStep[] }) {
  const [scrolled, setScrolled] = useState(0);
  const [override, setOverride] = useState<number | null>(null);
  const active = override ?? scrolled;
  const listRef = useRef<HTMLOListElement>(null);
  const last = steps.length - 1;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const origin = Math.min(el.getBoundingClientRect().top, window.innerHeight * START_AT);
    let computed = -1;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const travelled = origin - el.getBoundingClientRect().top;
      const next = Math.max(0, Math.min(last, Math.floor(travelled / STEP_PX)));
      if (next !== computed) {
        computed = next;
        setScrolled(next);
        setOverride(null);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [last]);

  return (
    <ol
      ref={listRef}
      onMouseLeave={() => setOverride(null)}
      className="flex flex-col lg:flex-row lg:items-stretch"
    >
      {steps.map((step, i) => {
        const current = i === active;
        const reached = i <= active;
        return (
          <Fragment key={step.label}>
            <li className="flex lg:flex-1 lg:min-w-0">
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => setOverride(i)}
                onMouseEnter={() => setOverride(i)}
                className={cn(
                  'flex w-full flex-col gap-2 border px-5 py-4 text-left transition-colors duration-200 motion-reduce:transition-none',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
                  current
                    ? 'border-black bg-black text-white'
                    : reached
                      ? 'border-black bg-white text-black'
                      : 'border-black/15 bg-white text-black',
                )}
              >
                {/* Numbered circle and a plain bold title: the Sell page's step
                    list, so a step reads the same wherever it appears. */}
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black leading-none transition-colors duration-200',
                      current ? 'bg-white text-black' : 'bg-black text-white',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[15px] font-bold leading-snug">{step.label}</span>
                </span>
                {step.detail && (
                  <span className="text-sm leading-relaxed">{step.detail}</span>
                )}
              </button>
            </li>
            {i < last && <Connector done={i < active} travelling={i === active - 1} />}
          </Fragment>
        );
      })}
    </ol>
  );
}

function Connector({ done, travelling }: { done: boolean; travelling: boolean }) {
  return (
    <li aria-hidden className="relative h-8 w-full shrink-0 overflow-hidden lg:h-auto lg:w-8">
      {/* Track, then the fill that draws over it. Down on a phone, across on
          desktop, from the same markup. */}
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/15 lg:left-0 lg:top-1/2 lg:h-px lg:w-full lg:translate-x-0 lg:-translate-y-1/2" />
      <span
        className={cn(
          'absolute left-1/2 top-0 h-full w-px -translate-x-1/2 origin-top bg-black',
          'lg:left-0 lg:top-1/2 lg:h-px lg:w-full lg:translate-x-0 lg:-translate-y-1/2 lg:origin-left',
          'transition-[scale] duration-300 ease-[cubic-bezier(.6,0,.2,1)] motion-reduce:transition-none',
          done ? 'scale-100' : 'scale-y-0 lg:scale-y-100 lg:scale-x-0',
        )}
      />
      {travelling && (
        <span className="hiw-parcel absolute inset-0">
          <span className="absolute bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 bg-black lg:bottom-auto lg:left-auto lg:right-1 lg:top-1/2 lg:translate-x-0 lg:-translate-y-1/2" />
        </span>
      )}
      <ChevronDown
        className={cn(
          'absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 bg-white transition-opacity duration-200 lg:hidden',
          done ? 'opacity-100' : 'opacity-30',
        )}
      />
      <ChevronRight
        className={cn(
          'absolute right-0 top-1/2 hidden h-4 w-4 -translate-y-1/2 bg-white transition-opacity duration-200 lg:block',
          done ? 'opacity-100' : 'opacity-30',
        )}
      />
    </li>
  );
}
