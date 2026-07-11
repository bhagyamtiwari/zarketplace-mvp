// Cookie consent state. Deliberately simple: the site currently sets no
// marketing/ad cookies at all - Vercel Analytics and Speed Insights are the
// only optional collection, everything else (Supabase auth, Razorpay
// checkout) is functionally required to use the site and isn't gated here,
// matching the standard "essential cookies need disclosure, not opt-in"
// rule. Reject actually disables Analytics/Speed Insights - it isn't
// decorative.
import * as React from 'react';

export type ConsentValue = 'accepted' | 'rejected';
const STORAGE_KEY = 'zk_cookie_consent_v1';

export function getStoredConsent(): ConsentValue | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

export function setStoredConsent(value: ConsentValue) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {}
}

// Small pub/sub so any component (the banner, App's analytics gate) stays in
// sync without a full context provider for something this small.
type Listener = (value: ConsentValue | null) => void;
const listeners = new Set<Listener>();

export function useConsent(): [ConsentValue | null, (v: ConsentValue) => void] {
  const [value, setValue] = React.useState<ConsentValue | null>(() => getStoredConsent());
  React.useEffect(() => {
    const listener: Listener = setValue;
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const update = React.useCallback((v: ConsentValue) => {
    setStoredConsent(v);
    listeners.forEach((l) => l(v));
  }, []);
  return [value, update];
}
