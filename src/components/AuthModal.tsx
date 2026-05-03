// Sign-in modal: email -> magic link.
// Used everywhere we need the user to log in (Sell, Checkout, SellerPortal, etc.)

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { log } from '../lib/log';

const mlog = log('authmodal');

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  message?: string; // optional context like "Sign in to list an item"
}

export function AuthModal({ open, onClose, message }: AuthModalProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setSent(false);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    mlog('submit', { email });
    setError(null);
    setLoading(true);
    const t = mlog.time('signIn');
    const { error: err } = await signIn(email);
    t.end({ error: err });
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  };

  // Render via portal to document.body so the modal escapes any ancestor with
  // `backdrop-filter` / `transform` / `filter` (e.g. the navbar's backdrop-blur),
  // which would otherwise become the containing block for `position: fixed`.
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
            >
              <X className="h-5 w-5" />
            </button>

            {sent ? (
              <div className="flex flex-col gap-6 items-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">Check your inbox</h2>
                <p className="text-xs font-bold uppercase tracking-widest text-black/60 leading-relaxed">
                  We sent a sign-in link to<br />
                  <span className="text-black">{email}</span>
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">
                  The link will sign you in. You can close this window.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Sign In</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/50">
                    {message ?? 'No password. We email you a one-time link.'}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest">Email Address</label>
                  <div className="flex items-center border-b border-black/10 focus-within:border-black transition-colors">
                    <Mail className="h-4 w-4 text-black/30 mr-3" />
                    <input
                      type="email"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-black py-4 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Magic Link'}
                </button>

                <p className="text-[9px] font-bold uppercase tracking-widest text-black/30 text-center leading-relaxed">
                  By signing in you agree to Zarketplace's terms.<br />
                  Same account works for buying and selling.
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
