// Auth context + hook backed by Supabase Auth (email + password only; no
// Google, no magic link). See docs/AUTH.md for the full flow.
//
// Usage:
//   - Wrap <App /> with <AuthProvider>.
//   - In components: `const { user, profile, signInWithPassword, signOut, loading } = useAuth();`
//   - To gate a page: redirect to "/" or open the AuthModal when `!user`.
//
// Flows:
//   - Sign in:  signInWithPassword(email, password).
//   - Sign up:  signUpWithPassword(email, password). If Supabase's "Confirm
//               email" setting is ON, the user must click the emailed link
//               (-> /auth/callback) before a session exists; otherwise they're
//               logged in immediately. Either way a profile row is auto-created
//               by the on_auth_user_created trigger in Postgres.
//   - Reset:    sendPasswordReset(email) mails a link to /reset-password, where
//               updatePassword(newPassword) sets the new password.

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
  default_upi_vpa: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  emailVerified: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resendVerification: () => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
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

    // Race getSession against a 4s timeout so the UI never blocks indefinitely
    // when supabase-js can't reach the auth endpoint or a browser extension
    // (SES lockdown, etc.) stalls the underlying lock.
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), 4000),
    );
    Promise.race([sessionPromise, timeoutPromise]).then(async (result) => {
      if (!mounted) return;
      if ('timedOut' in result) {
        alog.warn('getSession timeout - proceeding as anon');
        setLoading(false);
        return;
      }
      const { data, error } = result;
      alog('getSession returned', { hasSession: !!data.session, userId: data.session?.user?.id, error });
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
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

  const signInWithPassword = React.useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { error: 'Please enter your email.' };
    if (!password) return { error: 'Please enter your password.' };
    alog('signInWithPassword called', { email: trimmed });
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) alog.warn('signInWithPassword error', error.message);
    else alog('signInWithPassword success');
    return { error: error?.message ?? null };
  }, []);

  const signUpWithPassword = React.useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { error: 'Please enter your email.', needsConfirmation: false };
    if (!password || password.length < 10)
      return { error: 'Password must be at least 10 characters.', needsConfirmation: false };
    alog('signUpWithPassword called', { email: trimmed });
    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      alog.warn('signUpWithPassword error', error.message);
      return { error: error.message, needsConfirmation: false };
    }
    // If email confirmations are ON, session is null until the user clicks the link.
    const needsConfirmation = !data.session;
    alog('signUpWithPassword success', { needsConfirmation });
    return { error: null, needsConfirmation };
  }, []);

  const resendVerification = React.useCallback(async () => {
    const email = session?.user?.email;
    if (!email) return { error: 'Not signed in.' };
    alog('resendVerification called', { email });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) alog.warn('resendVerification error', error.message);
    return { error: error?.message ?? null };
  }, [session]);

  const sendPasswordReset = React.useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { error: 'Please enter your email.' };
    alog('sendPasswordReset called', { email: trimmed });
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) alog.warn('sendPasswordReset error', error.message);
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = React.useCallback(async (password: string) => {
    if (!password || password.length < 10)
      return { error: 'Password must be at least 10 characters.' };
    alog('updatePassword called');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) alog.warn('updatePassword error', error.message);
    return { error: error?.message ?? null };
  }, []);

  const signOut = React.useCallback(async () => {
    alog('signOut called');
    // Clear local state first so the UI updates immediately even if the
    // network call to Supabase is slow.
    setSession(null);
    setProfile(null);
    try { await supabase.auth.signOut(); } catch (err) { alog.warn('signOut error', err); }
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const user = session?.user ?? null;
  const emailVerified = !!user?.email_confirmed_at;

  const value: AuthContextValue = {
    user,
    session,
    profile,
    loading,
    emailVerified,
    signInWithPassword,
    signUpWithPassword,
    resendVerification,
    sendPasswordReset,
    updatePassword,
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
