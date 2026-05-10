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