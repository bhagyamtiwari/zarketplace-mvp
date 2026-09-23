// Auth gate. Shows a centered "please sign in" panel and auto-opens the
// AuthModal when the user is signed out. After successful sign-in, it
// re-renders children in place. Optional `requireAdmin` flag enforces the
// admin role on the profile.

import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { AuthModal } from './AuthModal';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
  message?: string;
  /**
   * What a signed-out visitor sees instead of the bare "please sign in"
   * panel. Given this, the sign-in form waits to be asked for rather than
   * opening on arrival: a page that explains itself first converts better
   * than a form over a blank screen.
   */
  signedOut?: (openSignIn: () => void) => React.ReactNode;
}

export function RequireAuth({ children, requireAdmin = false, message, signedOut }: Props) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [modalOpen, setModalOpen] = React.useState(false);

  // Auto-open the modal whenever the gate is shown so the user has one less
  // click to make.
  React.useEffect(() => {
    if (!loading && !user) setModalOpen(!signedOut);
    else setModalOpen(false);
  }, [loading, user]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin ink-low" />
      </div>
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    if (signedOut) {
      return (
        <>
          {signedOut(() => setModalOpen(true))}
          <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} redirectTo={redirect} />
        </>
      );
    }
    return (
      <>
        <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8 [&>*]:max-w-xl">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Please sign in</h1>
          <p className="text-sm leading-relaxed">
            {message ?? 'You need an account to continue. It only takes a moment.'}
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="self-start bg-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800"
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
      <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8 [&>*]:max-w-xl">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Admins only</h1>
        <p className="text-sm leading-relaxed">
          You don't have access to this area.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
