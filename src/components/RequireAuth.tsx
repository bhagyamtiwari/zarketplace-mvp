// Auth gate. Shows a centered "please sign in" panel and auto-opens the
// AuthModal when the user is signed out. After successful sign-in, it
// re-renders children in place. Optional `requireAdmin` flag enforces the
// admin role on the profile.

import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { AuthModal } from './AuthModal';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
  message?: string;
}

export function RequireAuth({ children, requireAdmin = false, message }: Props) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [modalOpen, setModalOpen] = React.useState(false);

  // Auto-open the modal whenever the gate is shown so the user has one less
  // click to make.
  React.useEffect(() => {
    if (!loading && !user) setModalOpen(true);
    else setModalOpen(false);
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black/20" />
      </div>
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return (
      <>
        <div className="mx-auto max-w-xl px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 text-center flex flex-col items-center gap-6">
          <div className="h-16 w-16 bg-zinc-100 rounded-full flex items-center justify-center">
            <Lock className="h-6 w-6 text-black/40" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase">Please sign in</h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 max-w-md leading-relaxed">
            {message ?? 'You need an account to continue. It only takes a moment.'}
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800"
          >
            Sign in
          </button>
        </div>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} redirectTo={redirect} />
      </>
    );
  }

  if (requireAdmin && !profile?.is_admin) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 text-center flex flex-col items-center gap-6">
        <div className="h-16 w-16 bg-zinc-100 rounded-full flex items-center justify-center">
          <Lock className="h-6 w-6 text-black/40" />
        </div>
        <h1 className="text-4xl font-black tracking-tighter uppercase">Admins only</h1>
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 max-w-md leading-relaxed">
          You don't have access to this area.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
