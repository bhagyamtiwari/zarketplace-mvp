// Auth context + hook backed by Supabase Auth (email magic link).
//
// Usage:
//   - Wrap <App /> with <AuthProvider>.
//   - In components: `const { user, profile, signIn, signOut, loading } = useAuth();`
//   - To gate a page: redirect to "/" or open the AuthModal when `!user`.
//
// Magic-link flow:
//   1. signIn(email) -> Supabase mails a one-time link.
//   2. User clicks link -> lands on /auth/callback -> Supabase sets the session.
//   3. AuthProvider's onAuthStateChange picks it up; profile row is auto-created
//      by the on_auth_user_created trigger in Postgres.

import * as React from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { log } from './log';

const alog = log('auth');

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  default_address: Record<string, string> | null;
  seller_upi_vpa: string | null;
  seller_bank_account: string | null;
  seller_bank_ifsc: string | null;
  seller_bank_holder: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadProfile = React.useCallback(async (userId: string) => {
    const t = alog.time(`loadProfile ${userId}`);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      t.end({ found: !!data, error });
      setProfile((data as Profile | null) ?? null);
    } catch (err) {
      alog.error('loadProfile THREW', err);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    alog('AuthProvider mounted, calling getSession()');

    supabase.auth.getSession().then(async ({ data, error }) => {
      alog('getSession returned', { hasSession: !!data.session, userId: data.session?.user?.id, error });
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
      alog('initial load complete, loading=false');
    }).catch((err) => {
      alog.error('getSession THREW', err);
      if (mounted) setLoading(false);
    });

    // Track the user id we last loaded a profile for. supabase-js fires
    // onAuthStateChange for every silent token refresh (~hourly) and for
    // window focus events; reloading the profile every time hammers the DB
    // for no benefit. We only refetch when the user identity actually
    // changes (sign-in, sign-out, user-updated).
    let lastLoadedUserId: string | null = null;

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      alog('onAuthStateChange', event, { userId: newSession?.user?.id });
      setSession(newSession);

      const newUserId = newSession?.user?.id ?? null;
      if (!newUserId) {
        setProfile(null);
        lastLoadedUserId = null;
        return;
      }

      const identityChanged = newUserId !== lastLoadedUserId;
      const userMutated = event === 'USER_UPDATED';
      if (identityChanged || userMutated) {
        await loadProfile(newUserId);
        lastLoadedUserId = newUserId;
      } else {
        alog('skipping loadProfile (no identity change)', { event });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = React.useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { error: 'Please enter your email.' };
    alog('signIn called', { email: trimmed, redirectTo: `${window.location.origin}/auth/callback` });
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) alog.warn('signIn error', error.message);
    else alog('signIn OTP sent');
    return { error: error?.message ?? null };
  }, []);

  const signOut = React.useCallback(async () => {
    alog('signOut called');
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
