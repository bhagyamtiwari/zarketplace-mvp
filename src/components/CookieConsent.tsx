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
    <div className="fixed bottom-0 inset-x-0 z-[60] bg-black text-white border-t border-white/10">
      {settingsOpen && (
        <div className="border-b border-white/10 px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-4 max-w-3xl mx-auto sm:mx-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest">Essential</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Always on</span>
          </div>
          <p className="body-copy text-white/60 -mt-2">
            Your sign-in session, cart, saved items and checkout progress. Stored on this device, needed for the site to work at all.
          </p>
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-xs font-black uppercase tracking-widest">Analytics</span>
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
          <p className="body-copy text-white/60 -mt-2">
            Which pages get used and where people drop off, under a random ID. Reject and the script is never loaded.
          </p>
          <button
            type="button"
            onClick={() => setConsent(analyticsOn ? 'accepted' : 'rejected')}
            className="self-start bg-white px-5 min-h-[44px] py-3 text-[10px] font-black uppercase tracking-widest text-black hover:bg-white/90 transition-colors"
          >
            Save Preferences
          </button>
        </div>
      )}

      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex items-center gap-4 text-left sm:gap-8">
        {/* Short form on a phone: five lines of consent copy over the fold is
            its own dark pattern. The full wording stays where there is room,
            and both link to the policy that spells it out. */}
        <p className="text-white/70 flex-1 text-[13px] leading-snug sm:text-xs sm:leading-relaxed">
          {/* Sentence case on a phone: the uppercase body voice needs six lines
              for the same sentence and pushes the buttons off the bar. */}
          <span className="sm:hidden text-[13px] font-bold leading-snug">
            We use cookies to improve your experience.{' '}
            <Link to="/privacy" className="underline text-white">Privacy Policy</Link>.
          </span>
          <span className="hidden sm:inline body-copy">
            We store a few things in your browser to keep you signed in and your cart intact, and,
            only if you allow it, anonymous analytics. No advertising or cross-site tracking, ever.
            See our <Link to="/privacy" className="underline text-white hover:text-white/80">Privacy Policy</Link>.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setConsent('accepted')}
            className="bg-white px-4 sm:px-5 min-h-[44px] py-3 text-[10px] font-black uppercase tracking-widest text-black hover:bg-white/90 transition-colors"
          >
            Accept<span className="hidden sm:inline"> all cookies</span>
          </button>
          <button
            type="button"
            onClick={() => setConsent('rejected')}
            className="border border-white/30 px-4 sm:px-5 min-h-[44px] py-3 text-[10px] font-black uppercase tracking-widest text-white hover:border-white transition-colors"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Cookie settings"
            className="hidden sm:block shrink-0 p-2 text-white/50 hover:text-white transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
