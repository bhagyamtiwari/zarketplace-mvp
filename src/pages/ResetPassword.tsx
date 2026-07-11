// Landing page for the "reset password" email link. Supabase's recovery
// link carries tokens in the URL hash; supabase-js (detectSessionInUrl:
// true) auto-exchanges them into a session before this component mounts,
// the same mechanism AuthCallback relies on for magic links. Once that
// session exists we let the user set a new password via updatePassword().

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { log } from '../lib/log';

const rlog = log('resetpw');

// 10+ chars, at least one letter AND one digit - matches AuthModal's rule.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export function ResetPassword() {
  useDocumentTitle('Reset Password');
  const { user, loading: authLoading, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const passwordValid = PASSWORD_RE.test(password);
  const confirmValid = password === confirmPassword;
  const canSubmit = passwordValid && confirmValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!passwordValid) { setError('Password must be 10+ characters and include a letter and a digit.'); return; }
    if (!confirmValid) { setError('Passwords do not match.'); return; }

    setSubmitting(true);
    const t = rlog.time('updatePassword');
    const { error: err } = await updatePassword(password);
    t.end({ error: err });
    setSubmitting(false);
    if (err) { setError(err); return; }
    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 2000);
  };

  if (authLoading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 flex flex-col items-center gap-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-black/40" />
        <p className="text-[10px] font-black uppercase tracking-widest text-black/60">Verifying your link…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Link expired</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/50 leading-relaxed">
          This password reset link is invalid or has expired. Request a new one from the sign in screen.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Password updated</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/50 leading-relaxed">
          Taking you home now.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Set a new password</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/50">
          Choose a password to finish resetting your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest">New Password</label>
          <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
            <Lock className="h-4 w-4 text-black/30 mr-3" />
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters, a letter and a digit"
              autoComplete="new-password"
              className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20"
            />
          </div>
          {password && !passwordValid && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">
              10+ chars with a letter and a digit.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest">Confirm Password</label>
          <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
            <Lock className="h-4 w-4 text-black/30 mr-3" />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Retype password"
              autoComplete="new-password"
              className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20"
            />
          </div>
          {confirmPassword && !confirmValid && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">Passwords do not match.</p>
          )}
        </div>

        {error && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="w-full bg-black py-4 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
