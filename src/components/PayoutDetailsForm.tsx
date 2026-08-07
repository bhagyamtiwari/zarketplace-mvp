// Payout details, collected at first sale rather than at listing time.
//
// This used to be step 5 of the Create Listing flow: ten fields standing
// between a new seller and their first live listing, for money that did not
// exist yet. It now appears once, as a blocking step in front of the seller's
// first real order - a seller with money waiting fills it in without
// hesitating.
//
// Everything is written through submit_seller_payout_details(), one
// SECURITY DEFINER function that saves the details to the profile, backfills
// any listings and orders that were published without them, and locks UPI +
// Instagram from that point on. Partial data is saved to the profile as it
// goes, so a seller who abandons halfway does not retype anything.

import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { UpiVpaInput, VPA_REGEX } from './UpiVpaInput';
import { log } from '../lib/log';

const plog = log('payout');

const IG_HANDLE_REGEX = /^[A-Za-z0-9._]{1,30}$/;

function stripIgUrl(v: string | null | undefined): string {
  if (!v) return '';
  return v.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-black uppercase tracking-widest">{children}</label>;
}

const inputCls =
  'border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20';

export function PayoutDetailsForm({ onSaved, onCancel }: { onSaved: () => void; onCancel?: () => void }) {
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [igHandle, setIgHandle] = React.useState('');
  const [vpa, setVpa] = React.useState('');
  const [vpaValid, setVpaValid] = React.useState(false);
  const [address, setAddress] = React.useState('');
  const [landmark, setLandmark] = React.useState('');
  const [city, setCity] = React.useState('');
  const [stateName, setStateName] = React.useState('');
  const [pincode, setPincode] = React.useState('');

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Anything already on the profile is a field the seller never sees again.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    setFullName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    setIgHandle(stripIgUrl(profile.instagram));
    if (profile.default_upi_vpa) {
      setVpa(profile.default_upi_vpa);
      setVpaValid(VPA_REGEX.test(profile.default_upi_vpa));
    }
    const addr = profile.pickup_address ?? {};
    setAddress(addr.address ?? '');
    setLandmark(addr.landmark ?? '');
    setCity(addr.city ?? '');
    setStateName(addr.state ?? '');
    setPincode(addr.pincode ?? '');
  }, [profile]);

  const igValid = IG_HANDLE_REGEX.test(igHandle);
  const locked = !!profile?.payout_locked_at;

  // Saved on every blur so an abandoned form still leaves the seller better
  // off than they started. Never touches UPI or Instagram - those are the two
  // that lock, so they are only ever written by the submit below.
  const savePartial = () => {
    if (!user) return;
    void supabase.from('profiles').update({
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      pickup_address: {
        fullName: fullName.trim(), phone: phone.trim(),
        address: address.trim(), landmark: landmark.trim(),
        city: city.trim(), state: stateName.trim(), pincode: pincode.trim(),
      },
    }).eq('id', user.id);
  };

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Enter your full name.';
    if (!phone.trim()) return 'Enter your phone number.';
    if (!igValid) return 'Enter a valid Instagram handle (letters, numbers, _ or ., max 30).';
    if (!vpaValid) return 'Enter a valid UPI ID, typed twice.';
    if (!address.trim()) return 'Enter the address we should pick up from.';
    if (!city.trim()) return 'Enter your city.';
    if (!stateName.trim()) return 'Enter your state.';
    if (!/^\d{6}$/.test(pincode.trim())) return 'Enter a valid 6-digit pincode.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('submit_seller_payout_details', {
        p_full_name: fullName.trim(),
        p_phone: phone.trim(),
        p_instagram: `https://www.instagram.com/${igHandle}`,
        p_upi_vpa: vpa,
        p_pickup_address: {
          fullName: fullName.trim(), phone: phone.trim(),
          address: address.trim(), landmark: landmark.trim(),
          city: city.trim(), state: stateName.trim(), pincode: pincode.trim(),
        },
      });
      if (rpcError) throw rpcError;
      await refreshProfile();
      onSaved();
    } catch (e: any) {
      plog.error('submit_seller_payout_details failed', e);
      setError(e?.message || 'Could not save your payout details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Your details</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-black/50 leading-relaxed">
            Asked once. Every sale after this one skips straight to shipping.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3">
            <FieldLabel>Full Name *</FieldLabel>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} onBlur={savePartial}
              type="text" placeholder="Full name as on your UPI account" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Phone Number *</FieldLabel>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={savePartial}
              type="tel" placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Seller Email</FieldLabel>
            <div className="border-b border-black/10 py-4 text-sm font-bold text-black/60">{user?.email}</div>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Instagram *</FieldLabel>
            <div className="flex items-center border-b border-black/10 focus-within:border-black transition-all">
              <span className="text-sm font-bold text-black/40 select-none">https://www.instagram.com/</span>
              <input type="text" value={igHandle} disabled={locked}
                onChange={(e) => setIgHandle(e.target.value.replace(/^@/, '').trim())}
                placeholder="username" autoComplete="off"
                className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20 disabled:text-black/50" />
            </div>
            {igHandle && !igValid && (
              <p className="text-[11px] font-bold uppercase tracking-widest text-red-600">Letters, numbers, _ or . only - max 30 characters.</p>
            )}
          </div>
        </div>

        {/* The one irreversible thing here, above both fields it applies to. */}
        <div className="flex items-start gap-3 border border-amber-400 bg-amber-50 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-900 leading-[1.7]">
            {locked
              ? 'Instagram and UPI are locked on your account. Contact support to change them.'
              : 'Instagram and UPI lock once you submit this. Check both now.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Pickup address</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-black/50 leading-relaxed">Where the courier collects this order.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FieldLabel>Address *</FieldLabel>
            <input value={address} onChange={(e) => setAddress(e.target.value)} onBlur={savePartial}
              type="text" placeholder="Flat / House no., Street" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Landmark</FieldLabel>
            <input value={landmark} onChange={(e) => setLandmark(e.target.value)} onBlur={savePartial}
              type="text" placeholder="Optional" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>City *</FieldLabel>
            <input value={city} onChange={(e) => setCity(e.target.value)} onBlur={savePartial}
              type="text" placeholder="Mumbai" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>State *</FieldLabel>
            <input value={stateName} onChange={(e) => setStateName(e.target.value)} onBlur={savePartial}
              type="text" placeholder="Maharashtra" className={inputCls} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Pincode *</FieldLabel>
            <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} onBlur={savePartial}
              type="text" inputMode="numeric" placeholder="400001" className={inputCls} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Payout</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-black/50 leading-relaxed">
            Paid here once the buyer&apos;s 48-hour review window closes. Same ID as GPay, PhonePe or Paytm.
          </p>
        </div>
        <UpiVpaInput value={vpa} onChange={(v, valid) => { setVpa(v); setVpaValid(valid); }} />
      </div>

      {error && <p className="text-xs font-bold uppercase tracking-widest text-red-600">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3">
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="inline-flex items-center justify-center gap-3 bg-black px-10 py-4 text-xs font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save and continue
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-6 py-4 text-xs font-black uppercase tracking-[0.3em] text-black/40 hover:text-black">
            Later
          </button>
        )}
      </div>
    </div>
  );
}
