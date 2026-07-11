// Tiny dev-only logger. All calls become no-ops in production builds because
// `import.meta.env.DEV` is statically replaced by Vite (`true` in `vite dev`,
// `false` in `vite build`), so the dead-code branches get tree-shaken away.
//
// Usage:
//   import { log } from '../lib/log';
//   const browseLog = log('browse');
//   browseLog('fetching listings', { filters });
//   browseLog.error('query failed', err);
//   const t = browseLog.time('query');  ... t.end({ count: rows.length });

const ENABLED = import.meta.env.DEV;

type Tag =
  | 'supabase'
  | 'auth'
  | 'authmodal'
  | 'authcb'
  | 'resetpw'
  | 'navbar'
  | 'browse'
  | 'home'
  | 'product'
  | 'sell'
  | 'checkout'
  | 'track'
  | 'seller'
  | 'admin'
  | 'cart'
  | 'account'
  | 'pricing'
  | 'error-boundary';

interface Logger {
  (...args: unknown[]): void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  time: (label: string) => { end: (extra?: Record<string, unknown>) => void };
}

export function log(tag: Tag): Logger {
  const prefix = `[${tag}]`;
  const fn = ((...args: unknown[]) => {
    if (ENABLED) console.log(prefix, ...args);
  }) as Logger;
  fn.warn = (...args: unknown[]) => {
    if (ENABLED) console.warn(prefix, ...args);
  };
  fn.error = (...args: unknown[]) => {
    // Errors stay even in prod - they're useful in Sentry/etc.
    console.error(prefix, ...args);
  };
  fn.time = (label: string) => {
    const t0 = ENABLED ? performance.now() : 0;
    if (ENABLED) console.log(prefix, label, 'START');
    return {
      end: (extra?: Record<string, unknown>) => {
        if (!ENABLED) return;
        const ms = Math.round(performance.now() - t0);
        console.log(prefix, label, 'DONE', { ms, ...(extra ?? {}) });
      },
    };
  };
  return fn;
}
