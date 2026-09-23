// My Profile - a signed-in user's details and how we pay them.
//
// Editable: name, UPI ID (until the first sale locks it), and PAN.
// Shown but not editable: email and phone. Both are how we reach someone
// about an order in flight, and the phone is the number a courier already
// holds, so changing either mid-delivery loses parcels. They are also the two
// fields an account takeover would want to move first. Email is tied to the
// sign-in itself.
//
// PAN is asked for only of someone who has sold to us, because it exists for
// paying them: it lives on their vendor record (public.vendors.pan, which a
// vendor may update on their own row), and that record is created by their
// first submission. A buyer who has never sold to us never sees the field.

import * as React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { VPA_REGEX } from '../components/UpiVpaInput';
import { log } from '../lib/log';
import { usePageMeta, META } from '../lib/pageMeta';
import { ui } from '../lib/ui';
import { cn } from '../lib/utils';

const acclog = log('account');

// Five letters, four digits, one letter: the format every PAN takes.
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function Account() {
  usePageMeta(META.account);

  return (
    <RequireAuth message="Sign in to view your profile.">
      <AccountInner />
    </RequireAuth>
  );
}

function AccountInner() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = React.useState('');
  const [upiVpa, setUpiVpa] = React.useState('');
  const [pan, setPan] = React.useState('');
  const [savedPan, setSavedPan] = React.useState('');
  const [isVendor, setIsVendor] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setUpiVpa(profile?.default_upi_vpa ?? '');
  }, [profile]);

  // The vendor record, if there is one. Its existence is what decides whether
  // PAN is asked for at all.
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase.from('vendors').select('pan').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { acclog.warn('vendor read failed', error); return; }
      setIsVendor(!!data);
      setPan(data?.pan ?? '');
      setSavedPan(data?.pan ?? '');
    });
    return () => { cancelled = true; };
  }, [user]);

  const upiValid = !upiVpa || VPA_REGEX.test(upiVpa);
  const panValid = !pan || PAN_REGEX.test(pan);
  // Once payout details are submitted at first sale, the UPI ID is frozen -
  // the database rejects a change either way, so don't offer the field.
  const upiLocked = !!profile?.payout_locked_at;

  const handleSave = async () => {
    if (!user) return;
    setErrorMsg(null);
    setSaved(false);
    if (upiVpa && !upiValid) {
      setErrorMsg('Enter a valid UPI ID like name@upi, or leave it blank.');
      return;
    }
    if (pan && !panValid) {
      setErrorMsg('Enter your PAN as it is printed on the card: five letters, four numbers, one letter.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          ...(upiLocked ? {} : { default_upi_vpa: upiVpa.trim() || null }),
        })
        .eq('id', user.id);
      if (error) throw error;
      // Only an update, never an insert: the vendor record is created by a
      // first submission, not by saving a profile.
      if (isVendor && pan !== savedPan) {
        const { error: panError } = await supabase.from('vendors').update({ pan: pan || null }).eq('id', user.id);
        if (panError) throw panError;
        setSavedPan(pan);
      }
      await refreshProfile();
      setSaved(true);
    } catch (err: any) {
      acclog.error('save profile failed', err);
      setErrorMsg(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountForm
      email={user?.email ?? ''}
      phone={profile?.phone ?? null}
      fullName={fullName} onFullName={setFullName}
      upiVpa={upiVpa} onUpiVpa={setUpiVpa} upiValid={upiValid} upiLocked={upiLocked}
      showPan={isVendor} pan={pan} onPan={setPan} panValid={panValid}
      saving={saving} saved={saved} errorMsg={errorMsg} onSave={handleSave}
    />
  );
}

/** The page, from values. Kept apart from loading and saving so it can be looked at. */
export function AccountForm({
  email, phone, fullName, onFullName, upiVpa, onUpiVpa, upiValid, upiLocked,
  showPan, pan, onPan, panValid, saving, saved, errorMsg, onSave,
}: {
  email: string; phone: string | null;
  fullName: string; onFullName: (v: string) => void;
  upiVpa: string; onUpiVpa: (v: string) => void; upiValid: boolean; upiLocked: boolean;
  showPan: boolean; pan: string; onPan: (v: string) => void; panValid: boolean;
  saving: boolean; saved: boolean; errorMsg: string | null; onSave: () => void;
}) {
  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 [&>*]:max-w-xl">
      <div className="flex flex-col gap-12">
        <h1 className={ui.pageTitle}>My Profile</h1>

        <section className="flex flex-col gap-6">
          <h2 className={ui.sectionTitle}>Your details</h2>
          <div className="flex flex-col gap-2">
            <label htmlFor="acc-name" className={ui.label}>Full name</label>
            <input
              id="acc-name"
              type="text"
              value={fullName}
              onChange={(e) => onFullName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className={ui.input}
            />
          </div>
          <ReadOnly label="Email" value={email} />
          <ReadOnly label="Phone" value={phone || 'Not on file'} />
          <p className={ui.help}>
            To change your email or phone, <Link to="/contact" className={cn(ui.link, 'font-bold')}>write to us</Link>.
          </p>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className={ui.sectionTitle}>Payouts</h2>
          <div className="flex flex-col gap-2">
            <label htmlFor="acc-upi" className={ui.label}>UPI ID</label>
            <input
              id="acc-upi"
              type="text"
              value={upiVpa}
              onChange={(e) => onUpiVpa(e.target.value.trim())}
              placeholder="yourname@upi"
              autoComplete="off"
              spellCheck={false}
              disabled={upiLocked}
              className={ui.input}
            />
            {upiLocked && (
              <p className={ui.help}>
                Locked since your first sale, so money is never sent somewhere new by mistake.{' '}
                <Link to="/contact" className={cn(ui.link, 'font-bold')}>Write to us</Link> to change it.
              </p>
            )}
            {upiVpa && !upiValid && <p className={ui.error}>Enter a valid UPI ID, like name@upi.</p>}
          </div>
          {showPan && (
            <div className="flex flex-col gap-2">
              <label htmlFor="acc-pan" className={ui.label}>PAN</label>
              <input
                id="acc-pan"
                type="text"
                value={pan}
                onChange={(e) => onPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="ABCDE1234F"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                className={cn(ui.input, 'tracking-wider')}
              />
              <p className={ui.help}>We may ask for your PAN before a payout, which is a standard requirement on payments of this kind.</p>
              {pan && !panValid && <p className={ui.error}>A PAN is five letters, four numbers and one letter.</p>}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {errorMsg && <p className={ui.error}>{errorMsg}</p>}
          <button type="button" onClick={onSave} disabled={saving} className={cn(ui.btnPrimary, 'w-full sm:w-auto sm:self-start')}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
          {saved && <p role="status" className="text-sm font-bold">Saved.</p>}
        </div>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={ui.label}>{label}</span>
      {/* No underline: only what you can change looks like a field. */}
      <span className="text-sm">{value}</span>
    </div>
  );
}
