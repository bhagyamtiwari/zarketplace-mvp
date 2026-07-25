// Product analytics (PostHog), used to answer "where do buyers drop off".
//
// Three rules this module exists to enforce:
//  1. Nothing is collected before the user accepts cookies. init() is only ever
//     called from the consent gate in App.tsx, and every capture() is a no-op
//     until then, so there is no tracking-before-consent.
//  2. No key, no analytics. Without VITE_POSTHOG_KEY (local dev, previews) every
//     call is a silent no-op rather than a crash or a console full of errors.
//  3. posthog-js is imported dynamically so it lands in its own chunk and never
//     weighs down the initial bundle on a first page load.
//
// Event names are past-tense and stable - renaming one silently breaks any
// funnel already built on it in PostHog.
import { log } from './log';

const alog = log('analytics');

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

type PostHog = typeof import('posthog-js').default;

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

// Events fired before the SDK finished loading are queued rather than dropped,
// so a purchase captured immediately after consent still lands.
const queue: Array<{ event: string; props?: Record<string, unknown> }> = [];

export function initAnalytics(): void {
  if (!KEY || client || loading) return;
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        capture_pageview: false, // we send these ourselves on route change
        persistence: 'localStorage',
        autocapture: false, // explicit events only - keeps the data readable
      });
      client = posthog;
      for (const q of queue.splice(0)) posthog.capture(q.event, q.props);
      return posthog;
    })
    .catch((err) => {
      alog.warn('posthog failed to load', err);
      return null;
    });
}

export function trackEvent(event: string, props?: Record<string, unknown>): void {
  if (!KEY) return;
  if (client) {
    client.capture(event, props);
    return;
  }
  // Only worth queueing if a load is actually in flight (i.e. consent given).
  if (loading) queue.push({ event, props });
}

export function trackPageview(path: string): void {
  trackEvent('$pageview', { $current_url: window.location.origin + path, path });
}

// Ties events to a user once they sign in, so a funnel can follow one person
// across sessions. Email only; never payment or address data.
export function identifyUser(userId: string, email?: string | null): void {
  if (!KEY || !client) return;
  client.identify(userId, email ? { email } : undefined);
}

export function resetAnalytics(): void {
  client?.reset();
}
