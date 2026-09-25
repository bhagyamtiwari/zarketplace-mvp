// Email + password only. No Google, no magic link.
//  - Sign-in tab: email + password.
//  - Sign-up tab: email + password + confirm password.
// Passwords must be 10+ chars with a letter AND a digit.
//
// Signup behavior is driven by Supabase's "Confirm email" project setting:
//   - When ON  : signup creates the account but does not return a session.
//                The user MUST click the verification link in their email
//                before they can sign in. We show that instruction here.
//   - When OFF : signup returns a session and we log the user in immediately;
//                a verification link is still emailed for the badge.
// We detect which mode is active via the `needsConfirmation` flag returned
// from `signUpWithPassword` and branch the UX accordingly.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, Loader2, Lock, Phone } from 'lucide-react';
import { useAuth, E164_RE } from '../lib/auth';
import { log } from '../lib/log';

const mlog = log('authmodal');

// Standard, pragmatic email regex.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// 10+ chars, at least one letter AND one digit.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
  redirectTo?: string;
  onSuccess?: () => void;
}

type Mode = 'signin' | 'signup' | 'forgot';

export function AuthModal({ open, onClose, message, redirectTo, onSuccess }: AuthModalProps) {
  const { signInWithPassword, signUpWithPassword, sendPasswordReset } = useAuth();
  const navigate = useNavigate();
  const succeed = React.useCallback(() => {
    onClose();
    if (onSuccess) onSuccess();
    if (redirectTo) navigate(redirectTo);
  }, [onClose, onSuccess, redirectTo, navigate]);

  const [mode, setMode] = React.useState<Mode>('signup');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  // Phone is required to create an account. There is no OTP and no SMS yet -
  // DLT approval is still pending - but linking a number to an account after
  // the fact means chasing that user individually, so we capture it now and
  // switch the login method later.
  const [dialCode, setDialCode] = React.useState('+91');
  const [phoneDigits, setPhoneDigits] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setDialCode('+91');
      setPhoneDigits('');
      setError(null);
      setNotice(null);
      setLoading(false);
      // Reopens on the free-account tab, which is what most people arriving here
      // actually need. Switching to Sign in after a successful signup is
      // handled separately and deliberately.
      setMode('signup');
    }
  }, [open]);

  const emailValid = EMAIL_RE.test(email);
  const passwordValid = mode === 'forgot' ? true : PASSWORD_RE.test(password);
  const confirmValid = mode === 'signup' ? password === confirmPassword : true;
  const e164 = `${dialCode}${phoneDigits}`;
  const phoneValid = mode === 'signup' ? E164_RE.test(e164) : true;
  const canSubmit =
    mode === 'forgot'
      ? emailValid
      : emailValid && passwordValid && confirmValid && phoneValid
        && (mode === 'signin' || confirmPassword.length > 0);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!emailValid) { setError('Enter a valid email address.'); return; }
    if (mode !== 'forgot' && !passwordValid) { setError('Password must be 10+ characters and include a letter and a digit.'); return; }
    if (mode === 'signup' && !confirmValid) { setError('Passwords do not match.'); return; }
    if (mode === 'signup' && !phoneValid) { setError('Enter a valid phone number with its country code.'); return; }

    setLoading(true);
    try {
      if (mode === 'forgot') {
        const t = mlog.time('sendPasswordReset');
        const { error: err } = await sendPasswordReset(email);
        t.end({ error: err });
        if (err) setError(err);
        else setNotice(`If an account exists for ${email}, a password reset link is on its way. Check your inbox.`);
      } else if (mode === 'signin') {
        const t = mlog.time('signInWithPassword');
        const { error: err } = await signInWithPassword(email, password);
        t.end({ error: err });
        if (err) setError(err);
        else succeed();
      } else {
        const t = mlog.time('signUpWithPassword');
        const { error: err, needsConfirmation } = await signUpWithPassword(email, password, e164);
        t.end({ error: err, needsConfirmation });
        if (err) { setError(err); return; }
        if (needsConfirmation) {
          setMode('signin');
          setNotice(`Account created. We sent a verification link to ${email}. Click the link in your inbox, then sign in here.`);
        } else {
          succeed();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white w-full max-w-md relative flex flex-col max-h-[calc(100dvh-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sits on the panel, not inside the scroll area, so it is reachable
                at any window height. */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 text-black hover:text-black/60 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5 overflow-y-auto px-8 pt-10 pb-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter">
                  {mode === 'signup' ? 'Create free account' : mode === 'forgot' ? 'Reset Password' : 'Sign In'}
                </h2>
                <p className="text-[11px] font-bold uppercase tracking-widest">
                  {message ?? (mode === 'signup'
                    ? 'Free, and it takes a minute'
                    : mode === 'forgot'
                    ? "Enter your email and we'll send you a reset link."
                    : 'Sign in with your email and password')}
                </p>
              </div>

              {mode !== 'forgot' && (
                <div className="grid grid-cols-2 gap-0 border border-black/10">
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className={`px-2 py-3 text-[11px] font-black uppercase tracking-wider leading-tight transition-colors ${
                      mode === 'signup' ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/5'
                    }`}
                  >
                    Create free account
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className={`px-2 py-3 text-[11px] font-black uppercase tracking-wider leading-tight transition-colors ${
                      mode === 'signin' ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/5'
                    }`}
                  >
                    Sign In
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <label className="text-[11px] font-black uppercase tracking-widest">
                  {mode === 'signin' ? 'Email or phone' : 'Email'}
                </label>
                <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                  <Mail className="h-4 w-4 text-black mr-3" />
                  <input
                    type={mode === 'signin' ? 'text' : 'email'}
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={mode === 'signin' ? 'you@example.com or 98765 43210' : 'you@example.com'}
                    autoComplete={mode === 'signin' ? 'username' : 'email'}
                    className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:font-normal placeholder:text-black/40"
                  />
                </div>
                {email && !emailValid && (
                  <p className="text-xs font-semibold text-red-600">
                    {mode === 'signin' && /^[+\d][\d\s-]{6,}$/.test(email.trim())
                      ? 'We cannot sign you in by phone yet. Use the email you signed up with.'
                      : 'Enter a valid email.'}
                  </p>
                )}
              </div>

              {mode === 'signup' && (
                <div className="flex flex-col gap-3">
                  <label className="text-[11px] font-black uppercase tracking-widest">Phone</label>
                  <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                    <Phone className="h-4 w-4 text-black mr-3" />
                    {/* Country code is its own field so a non-Indian number is
                        still possible, but +91 is the answer for this market
                        and nobody should have to pick it. */}
                    <input
                      type="tel"
                      required
                      value={dialCode}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d+]/g, '');
                        setDialCode(v.startsWith('+') ? v.slice(0, 4) : `+${v}`.slice(0, 4));
                      }}
                      aria-label="Country code"
                      className="w-14 py-4 text-sm font-bold focus:outline-none tracking-wider"
                    />
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      value={phoneDigits}
                      onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 14))}
                      placeholder="98765 43210"
                      autoComplete="tel-national"
                      className="flex-1 py-4 text-sm font-bold focus:outline-none tracking-wider placeholder:font-normal placeholder:text-black/40"
                    />
                  </div>
                  {phoneDigits && !phoneValid && (
                    <p className="text-xs font-semibold text-red-600">Enter a valid phone number.</p>
                  )}
                </div>
              )}

              {mode !== 'forgot' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-widest">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-[11px] font-bold uppercase tracking-widest text-black hover:text-black/70 underline transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                    <Lock className="h-4 w-4 text-black mr-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'At least 10 characters, a letter and a digit' : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:font-normal placeholder:text-black/40"
                    />
                  </div>
                  {mode === 'signup' && password && !passwordValid && (
                    <p className="text-xs font-semibold text-red-600">
                      10+ chars with a letter and a digit.
                    </p>
                  )}
                </div>
              )}

              {mode === 'signup' && (
                <div className="flex flex-col gap-3">
                  <label className="text-[11px] font-black uppercase tracking-widest">Confirm Password</label>
                  <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                    <Lock className="h-4 w-4 text-black mr-3" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retype password"
                      autoComplete="new-password"
                      className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:font-normal placeholder:text-black/40"
                    />
                  </div>
                  {confirmPassword && !confirmValid && (
                    <p className="text-xs font-semibold text-red-600">Passwords do not match.</p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-sm font-semibold text-red-600">{error}</p>
              )}
              {notice && (
                <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 leading-relaxed">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full bg-black py-4 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signup' ? 'Create free account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
              </button>

              {mode === 'forgot' ? (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-[11px] font-bold uppercase tracking-widest text-black hover:text-black/70 text-center underline transition-colors"
                >
                  Back to Sign In
                </button>
              ) : (
                <p className="text-center text-[11px] font-normal leading-relaxed text-black">
                  By continuing you agree to the{' '}
                  <Link to="/terms" className="underline underline-offset-4 text-black">zarketplace terms</Link>.
                </p>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
