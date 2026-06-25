// My Profile - lets a signed-in user edit their name, phone, and saved UPI ID.
// Email is shown but never editable here (it's tied to the auth identity).

import * as React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { VPA_REGEX } from '../components/UpiVpaInput';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const acclog = log('account');

export function Account() {
  useDocumentTitle('My Profile');

  return (
    <RequireAuth message="Sign in to view your profile.">
      <AccountInner />
    </RequireAuth>
  );
}

function AccountInner() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [upiVpa, setUpiVpa] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setUpiVpa(profile?.default_upi_vpa ?? '');
  }, [profile]);

  const upiValid = !upiVpa || VPA_REGEX.test(upiVpa);

  const handleSave = async () => {
    if (!user) return;
    setErrorMsg(null);
    setSaved(false);
    if (upiVpa && !upiValid) {
      setErrorMsg('Enter a valid UPI ID like name@upi, or leave it blank.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          default_upi_vpa: upiVpa.trim() || null,
        })
        .eq('id', user.id);
      if (error) throw error;
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
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-14 sm:pb-20">
      <div className="flex flex-col gap-4 mb-12">
        <h1 className="text-5xl font-black tracking-tighter uppercase">My Profile</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-black">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jashok Dumar"
            className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-black/40">Email (Read-Only)</label>
          <div className="border-b border-black/10 py-3 text-sm font-bold text-black/50">
            {user?.email}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-black">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-black">UPI ID</label>
          <input
            type="text"
            value={upiVpa}
            onChange={(e) => setUpiVpa(e.target.value.trim())}
            placeholder="yourname@upi"
            autoComplete="off"
            spellCheck={false}
            className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all tracking-wider"
          />
          {upiVpa && !upiValid && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">Enter a valid VPA like name@upi.</p>
          )}
        </div>

        {errorMsg && <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{errorMsg}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-black py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3 mt-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>Save Changes</span>
        </button>

        {saved && (
          <p className="self-center flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Profile updated
          </p>
        )}
      </div>
    </div>
  );
}
