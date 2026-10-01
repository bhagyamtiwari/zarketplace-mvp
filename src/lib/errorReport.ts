// Errors visitors hit, reported to our own database so an operator can see
// them under System > Site errors. log.ts is dev-only, so without this a
// checkout that broke for a customer was invisible unless they wrote in.
//
// Production only, fire and forget, and bounded: the same message is sent
// once per page load, at most 15 a page, and the server folds repeats into a
// count and caps a flood (log_client_error). Noise from browser extensions
// and cross-origin scripts we cannot see into is dropped here.
import { supabase } from './supabase';

export type ErrorKind = 'error' | 'promise' | 'react' | 'load' | 'slow';

const ENABLED = import.meta.env.PROD;
const MAX_PER_PAGE = 15;
const sent = new Set<string>();

// The build's own file name doubles as a release id: errors from before and
// after a deploy can be told apart.
const RELEASE = (() => {
  try {
    const src = (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)?.src ?? '';
    return src.split('/').pop() ?? '';
  } catch { return ''; }
})();

const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /AbortError/i,
  /Non-Error promise rejection captured/i,
];

export function reportError(kind: ErrorKind, error: unknown, extra?: string): void {
  if (!ENABLED) return;
  try {
    const err = error instanceof Error ? error : null;
    const message = (err?.message || (typeof error === 'string' ? error : '') || String(error ?? '')).slice(0, 500);
    const stack = [err?.stack, extra].filter(Boolean).join('\n').slice(0, 4000);
    if (!message || NOISE.some((re) => re.test(message) || re.test(stack))) return;
    const key = `${kind}|${message}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    void supabase.rpc('log_client_error', {
      p_kind: kind,
      p_message: message,
      p_path: window.location.pathname,
      p_stack: stack || null,
      p_user_agent: navigator.userAgent.slice(0, 300),
      p_release: RELEASE,
    }).then(() => {}, () => {});
  } catch { /* reporting must never cause an error of its own */ }
}

/** Uncaught errors and unhandled promise rejections, anywhere on the page. */
export function installErrorReporting(): void {
  if (!ENABLED || typeof window === 'undefined') return;
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));
}
