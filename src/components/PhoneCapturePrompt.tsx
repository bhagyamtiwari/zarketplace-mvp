// One-time "add your number" prompt for accounts that arrived without one.
//
// Email/password signup has required a phone since 20260808000002. Google
// OAuth never asks: Supabase creates the account straight from the Google
// profile, so those users land with an email and nothing else. That gap
// matters more than it looks, because login is moving to phone OTP - an
// account with no number on file has nothing to log in with, and chasing each
// one individually afterwards costs more the longer it is left.
//
// Deliberately not a hard gate. The seller can dismiss it and keep browsing or
// listing; it reappears next session while the number is still missing. A wall
// in front of an account that already works would cost more sellers than the
// missing number does.

import React from 'react';
import { Phone, X, Loader2 } from 'lucide-react';
import { useAuth, E164_RE } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';

const plog = log('phone-capture');

// Dismissal is per-session, not permanent: the number is genuinely needed, so
// closing it should mean "not now" rather than "never ask again".
const DISMISS_KEY = 'zk_phone_prompt_dismissed';

export function PhoneCapturePrompt() {
  const { user, profile, refreshProfile } = useAuth();

  const [dismissed, setDismissed] = React.useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  );
  const [dialCode, setDialCode] = React.useState('+91');
  const [digits, setDigits] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const e164 = `${dialCode}${digits}`;
  const valid = E164_RE.test(e164);

  // profile === null means "not loaded yet", not "no phone": showing the
  // prompt during that window would flash it at every user on every load.
  const missing = !!user && !!profile && !profile.phone;
  if (!missing || dismissed) return null;

  const close = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const save = async () => {
    if (!valid || !user) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ phone: e164 })
        .eq('id', user.id);
      if (err) throw err;
      await refreshProfile();
      // No explicit close: refreshProfile makes `missing` false, and the
      // component unmounts itself.
    } catch (e: any) {
      plog.error('phone save failed', e);
      setError(e?.message || 'Could not save your number.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6 flex justify-center">
      <div className="relative w-full max-w-md border border-black bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.18)] flex flex-col gap-4">
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-black/40 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-1.5 pr-8">
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Add your number</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest leading-[1.9] text-black/60">
            Your account has no phone number on file. We need one for delivery
            updates and order problems, and it will be how you sign in once we
            move to one-time passcodes. We do not send marketing texts.
          </p>
        </div>

        <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
          <Phone className="mr-3 h-4 w-4 text-black/30" />
          <input
            type="tel"
            value={dialCode}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d+]/g, '');
              setDialCode(v.startsWith('+') ? v.slice(0, 4) : `+${v}`.slice(0, 4));
            }}
            aria-label="Country code"
            className="w-14 py-4 text-sm font-bold tracking-wider focus:outline-none"
          />
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 14))}
            placeholder="98765 43210"
            autoComplete="tel-national"
            className="flex-1 py-4 text-sm font-bold tracking-wider focus:outline-none placeholder:text-xs placeholder:font-medium placeholder:uppercase placeholder:tracking-widest placeholder:text-black/25"
          />
        </div>

        {digits && !valid && (
          <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">
            Enter a valid phone number with its country code.
          </p>
        )}
        {error && (
          <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!valid || saving}
            className="flex flex-1 items-center justify-center gap-2 bg-black py-4 text-[10px] font-black uppercase tracking-[0.25em] text-white disabled:opacity-30"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save number
          </button>
          <button
            type="button"
            onClick={close}
            className="border border-black/15 px-5 py-4 text-[10px] font-black uppercase tracking-[0.25em] text-black/50 hover:border-black hover:text-black"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
