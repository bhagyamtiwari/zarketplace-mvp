import { createClient } from '@supabase/supabase-js';
import { log } from './log';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const sbLog = log('supabase');

sbLog('init', {
  hasUrl: !!supabaseUrl,
  hasAnon: !!supabaseAnonKey,
  url: supabaseUrl,
  fetchIsNative: (() => {
    try { return Function.prototype.toString.call(fetch).includes('[native code]'); } catch { return 'unknown'; }
  })(),
  WebSocket: typeof WebSocket,
  origin: typeof window !== 'undefined' ? window.location.origin : 'ssr',
});

// Connectivity probe - only in dev, fires once per page load.
if (import.meta.env.DEV && typeof window !== 'undefined' && supabaseUrl && supabaseAnonKey) {
  const probe = sbLog.time('probe /rest/v1/listings');
  fetch(`${supabaseUrl}/rest/v1/listings?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
  })
    .then(async (r) => probe.end({ status: r.status, ok: r.ok, body: (await r.text()).slice(0, 120) }))
    .catch((err) => sbLog.error('probe FAILED', err));
}

// Workaround: some browser extensions (crypto wallets like MetaMask/Phantom
// that inject SES "lockdown") freeze parts of the global object and break
// `navigator.locks.request`, which supabase-js v2 uses to coordinate session
// refresh. When that lock can't be acquired, every `getSession()` and every
// subsequent `from().select()` hangs forever. Replacing the lock with a no-op
// keeps the client working in those environments. The downside (transient 401s
// when 2+ tabs refresh simultaneously) is far less harmful than a hard hang.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: async (_name, _acquireTimeout, fn) => fn(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// A second client that never has a session, for public catalogue reads.
//
// Every query on the client above first awaits getSession() to decide which
// token to send. When that stalls - an expired refresh token, a slow auth
// endpoint, an extension interfering - the query never fires and the feed
// spins forever, which is exactly the "listings are loading, I have to
// refresh" symptom. The AuthProvider's 4s timeout only unblocks the UI flag;
// it cannot unblock a query already waiting inside supabase-js.
//
// With persistSession off and no session ever established, there is nothing to
// read or refresh, so this client sends the anon key immediately. Safe because
// public_listings is a definer view carrying only buyer-safe columns: a user
// token would grant it nothing extra.
//
// Its reads are also sent as "simple" requests. supabase-js puts the key in
// apikey and Authorization headers (plus x-client-info and Accept-Profile),
// and any custom header makes the browser send a CORS preflight first: two
// round trips for every catalogue read, and the preflight is cached per URL,
// so every new filter paid it again. A GET with the anon key in the query
// string and no custom headers goes in one trip. Only for anon GETs without a
// Prefer header; anything else is sent unchanged.
const DEFAULT_PROFILE = 'public';
async function simpleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init?.headers);
  const anonAuth = !headers.get('authorization') || headers.get('authorization') === `Bearer ${supabaseAnonKey}`;
  const profile = headers.get('accept-profile');
  if ((method !== 'GET' && method !== 'HEAD') || !url.includes('/rest/v1/') || !anonAuth
      || headers.has('prefer') || (profile && profile !== DEFAULT_PROFILE)) {
    return fetch(input, init);
  }
  const u = new URL(url);
  u.searchParams.set('apikey', supabaseAnonKey);
  const accept = headers.get('accept');
  return fetch(u.toString(), { method, signal: init?.signal, headers: accept ? { Accept: accept } : undefined });
}

export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: simpleFetch },
  auth: {
    lock: async (_name, _acquireTimeout, fn) => fn(),
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});