// Bottom consent bar. Reject actually disables PostHog, Vercel Analytics and
// Speed Insights (see src/lib/cookieConsent.ts + App.tsx) - it isn't
// decorative. Copy here has to stay true to what the site really stores; the
// matching detail lives in the Privacy page's browser-storage section.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useConsent } from '../lib/cookieConsent';

export function CookieConsent() {
  const [consent, setConsent] = useConsent();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [analyticsOn, setAnalyticsOn] = React.useState(true);

  if (consent !== null) return null;

  return (
    // A small floating card on a phone, see-through, so the first screen of
    // the site is still visible behind it rather than half-covered by a black
    // slab on arrival. A full-width bar where there is room.
    // --ink is set by hand: the ink classes flip to white only on .bg-black,
    // and this bar is a translucent black, so without it the grey text in the
    // settings panel rendered black on black. Solid from sm up, where the
    // settings panel lives, so the detail is always readable.
    <div className="fixed z-[60] bottom-3 inset-x-3 rounded-xl sm:rounded-none sm:bottom-0 sm:inset-x-0 bg-black/70 sm:bg-black [--ink:255_255_255] backdrop-blur-md text-white border border-white/10 sm:border-x-0 sm:border-b-0 shadow-[0_8px_30px_rgba(0,0,0,0.25)] sm:shadow-none">
      {/* Only ever shown from sm up: the Settings button that opens it is
          hidden on a phone. It was capped at max-w-3xl and pinned left, so on
          a wide screen it sat as a narrow column under a full-width bar and
          read as a panel that had failed to load. It now runs the same width
          as the bar, with the two categories side by side so the measure
          stays short rather than stretching one paragraph across 1600px. */}
      {settingsOpen && (
        <div className="border-b border-white/10 px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-12 lg:gap-x-20">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-bold">Essential</span>
                <span className="text-sm">Always on</span>
              </div>
              <p className="max-w-[60ch] text-sm leading-relaxed">
                Your sign-in session, cart, favorites and checkout progress. Stored on this device, needed for the site to work at all.
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:border-t-0 sm:pt-0">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-bold">Analytics</span>
                <button
                  type="button"
                  onClick={() => setAnalyticsOn((v) => !v)}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  style={{ backgroundColor: analyticsOn ? '#fff' : 'rgba(255,255,255,0.2)' }}
                  aria-pressed={analyticsOn}
                  aria-label="Toggle analytics cookies"
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full bg-black transition-transform"
                    style={{ transform: analyticsOn ? 'translateX(18px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
              <p className="max-w-[60ch] text-sm leading-relaxed">
                Which pages get used and where people drop off, under a random ID. Reject and the script is never loaded.
              </p>
            </div>
          </div>

          {/* The qualifier and the action on one row, on the same two edges as
              the bar below, so the panel closes where the bar does. */}
          <div className="flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <p className="max-w-[70ch] text-sm leading-relaxed">
              We do not use advertising or cross-site tracking cookies. Details are in our{' '}
              <Link to="/privacy" className="underline text-white hover:text-white/80">Privacy Policy</Link>.
            </p>
            <button
              type="button"
              onClick={() => setConsent(analyticsOn ? 'accepted' : 'rejected')}
              className="self-start shrink-0 bg-white px-5 min-h-[44px] py-3 text-[10px] font-black uppercase tracking-widest text-black hover:bg-white/90 transition-colors sm:self-auto"
            >
              Save Preferences
            </button>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-4 flex items-center gap-3 text-left sm:gap-8">
        {/* Short form on a phone: five lines of consent copy over the fold is
            its own dark pattern. The full wording stays where there is room,
            and both link to the policy that spells it out. */}
        <p className="flex-1 text-[13px] leading-snug sm:text-xs sm:leading-relaxed">
          {/* Sentence case on a phone: the uppercase body voice needs six lines
              for the same sentence and pushes the buttons off the bar. */}
          <span className="sm:hidden text-[13px] leading-snug">
            We use cookies.{' '}
            <Link to="/privacy" className="inline-block py-3.5 -my-3.5 underline text-white">Privacy</Link>
          </span>
          {/* One line where there is room. What is stored and why is one
              click away, under Settings. */}
          <span className="hidden sm:inline text-xs font-medium">
            We use essential cookies to run this site and, with your consent, analytics to improve it.{' '}
            <Link to="/privacy" className="inline-block py-3.5 -my-3.5 underline text-white hover:text-white/80">Privacy Policy</Link>
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setConsent('accepted')}
            className="rounded-md sm:rounded-none bg-white px-4 sm:px-8 min-h-[40px] sm:min-h-[44px] py-2 sm:py-3 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white/90 transition-colors"
          >
            Accept<span className="hidden sm:inline"> all cookies</span>
          </button>
          <button
            type="button"
            onClick={() => setConsent('rejected')}
            className="px-1 min-h-[40px] sm:min-h-[44px] py-2 sm:py-3 text-[11px] font-black uppercase tracking-widest text-white/75 underline underline-offset-4 hover:text-white transition-colors"
          >
            <span className="sm:hidden">Decline</span><span className="hidden sm:inline">Essential only</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className="hidden sm:inline-flex shrink-0 items-center gap-2 px-1 min-h-[44px] text-[11px] font-black uppercase tracking-widest text-white/75 hover:text-white transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Settings
          </button>
        </div>
      </div>
    </div>
  );
}
