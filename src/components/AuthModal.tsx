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
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
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

type Mode = 'signin' | 'signup';

export function AuthModal({ open, onClose, message, redirectTo, onSuccess }: AuthModalProps) {
  const { signInWithPassword, signUpWithPassword } = useAuth();
  const navigate = useNavigate();
  const succeed = React.useCallback(() => {
    onClose();
    if (onSuccess) onSuccess();
    if (redirectTo) navigate(redirectTo);
  }, [onClose, onSuccess, redirectTo, navigate]);

  const [mode, setMode] = React.useState<Mode>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
      setNotice(null);
      setLoading(false);
      setMode('signin');
    }
  }, [open]);

  const emailValid = EMAIL_RE.test(email);
  const passwordValid = PASSWORD_RE.test(password);
  const confirmValid = mode === 'signin' ? true : password === confirmPassword;
  const canSubmit =
    emailValid && passwordValid && confirmValid && (mode === 'signin' || confirmPassword.length > 0);

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
    if (!passwordValid) { setError('Password must be 10+ characters and include a letter and a digit.'); return; }
    if (mode === 'signup' && !confirmValid) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const t = mlog.time('signInWithPassword');
        const { error: err } = await signInWithPassword(email, password);
        t.end({ error: err });
        if (err) setError(err);
        else succeed();
      } else {
        const t = mlog.time('signUpWithPassword');
        const { error: err, needsConfirmation } = await signUpWithPassword(email, password);
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
            className="bg-white w-full max-w-md p-10 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-black/40 hover:text-black transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-black uppercase tracking-tighter">
                  {mode === 'signup' ? 'Create Account' : 'Sign In'}
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/50">
                  {message ?? (mode === 'signup'
                    ? 'Email and password. No socials, no phone.'
                    : 'Sign in with your email and password.')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-0 border border-black/10">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    mode === 'signin' ? 'bg-black text-white' : 'bg-white text-black/50 hover:text-black'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    mode === 'signup' ? 'bg-black text-white' : 'bg-white text-black/50 hover:text-black'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest">Email</label>
                <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                  <Mail className="h-4 w-4 text-black/30 mr-3" />
                  <input
                    type="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20"
                  />
                </div>
                {email && !emailValid && (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">Enter a valid email.</p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest">Password</label>
                <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                  <Lock className="h-4 w-4 text-black/30 mr-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 10 characters, a letter and a digit' : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20"
                  />
                </div>
                {mode === 'signup' && password && !passwordValid && (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">
                    10+ chars with a letter and a digit.
                  </p>
                )}
              </div>

              {mode === 'signup' && (
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
              )}

              {error && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{error}</p>
              )}
              {notice && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 leading-relaxed">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full bg-black py-4 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>

              <p className="text-[9px] font-bold uppercase tracking-widest text-black/30 text-center leading-relaxed">
                By continuing you agree to zarketplace's terms.<br />
                Same account works for buying and selling.
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
