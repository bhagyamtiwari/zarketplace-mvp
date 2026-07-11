// Bottom consent bar. Reject actually disables Vercel Analytics/Speed
// Insights (see src/lib/cookieConsent.ts + App.tsx) - it isn't decorative.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useConsent } from '../lib/cookieConsent';

export function CookieConsent() {
  const [consent, setConsent] = useConsent();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [analyticsOn, setAnalyticsOn] = React.useState(true);

  if (consent !== null) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] bg-black text-white border-t border-white/10">
      {settingsOpen && (
        <div className="border-b border-white/10 px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-4 max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest">Essential</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Always on</span>
          </div>
          <p className="text-xs font-medium text-white/60 leading-relaxed -mt-2">
            Required for sign-in, cart, and checkout to work. Cannot be disabled.
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
          <p className="text-xs font-medium text-white/60 leading-relaxed -mt-2">
            Anonymous, aggregated page views. Helps us see what's working.
          </p>
          <button
            type="button"
            onClick={() => setConsent(analyticsOn ? 'accepted' : 'rejected')}
            className="self-start bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white/90 transition-colors"
          >
            Save Preferences
          </button>
        </div>
      )}

      <div className="px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
        <p className="text-xs font-medium text-white/70 leading-relaxed flex-1">
          We use cookies for essential site function (sign-in, checkout) and, if you allow it, anonymous analytics.
          See our <Link to="/privacy" className="underline text-white hover:text-white/80">Privacy Policy</Link>.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="text-[11px] font-black uppercase tracking-widest text-white/60 hover:text-white underline underline-offset-4"
          >
            Cookie Settings
          </button>
          <button
            type="button"
            onClick={() => setConsent('rejected')}
            className="border border-white/30 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white hover:border-white transition-colors"
          >
            Reject All
          </button>
          <button
            type="button"
            onClick={() => setConsent('accepted')}
            className="bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white/90 transition-colors"
          >
            Accept All Cookies
          </button>
          <button
            type="button"
            onClick={() => setConsent('rejected')}
            aria-label="Dismiss"
            className="text-white/40 hover:text-white sm:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
