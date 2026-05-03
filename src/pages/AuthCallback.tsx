// Magic-link landing page. Supabase auto-exchanges the URL hash for a session
// via detectSessionInUrl=true (default in supabase-js v2). We just wait for
// the auth state to settle, then send the user home (or back to where they
// were trying to go via ?redirect=).

import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { log } from '../lib/log';

const cblog = log('authcb');

export function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  React.useEffect(() => {
    cblog('callback effect', { authLoading: loading, hasUser: !!user, hash: window.location.hash.slice(0, 80) });
    if (loading) return;
    const redirect = params.get('redirect') ?? '/';
    if (user) {
      cblog('session established, navigating', { redirect });
      navigate(redirect, { replace: true });
    } else {
      cblog.warn('no user after auth callback; falling back to home in 1.5s');
      const t = setTimeout(() => navigate('/', { replace: true }), 1500);
      return () => clearTimeout(t);
    }
  }, [user, loading, navigate, params]);

  return (
    <div className="mx-auto max-w-md px-4 py-32 flex flex-col items-center gap-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-black/40" />
      <p className="text-[10px] font-black uppercase tracking-widest text-black/60">Signing you in…</p>
    </div>
  );
}
