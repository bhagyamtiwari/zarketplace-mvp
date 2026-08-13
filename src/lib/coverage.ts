// Which states currently have sellers on zarketplace.
//
// The intra-state rule is only tolerable if a buyer is told the truth early.
// Someone in Bombay selecting Maharashtra and landing on an empty grid reads
// that as a broken site; told plainly that no seller in their state has joined
// yet, they read it as a young marketplace - which is what it is, and is
// something people forgive.
//
// Derived from live inventory rather than a hardcoded list, so it is never
// stale: the day a Bombay seller lists, Maharashtra becomes covered with no
// deploy. Fetched once per page load and shared.

import * as React from 'react';
import { supabasePublic } from './supabase';
import { log } from './log';

const clog = log('coverage');

let cached: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;

async function fetchCovered(): Promise<Set<string>> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabasePublic
        .from('public_listings')
        .select('pickup_state');
      if (error) throw error;
      cached = new Set((data ?? []).map((r) => r.pickup_state).filter(Boolean) as string[]);
    } catch (err) {
      // Unknown coverage must not become "we do not ship there". Falling back
      // to an empty set would libel every state, so callers treat null as
      // "do not claim anything" instead.
      clog.warn('coverage lookup failed', err);
      cached = null;
    } finally {
      inflight = null;
    }
    return cached ?? new Set<string>();
  })();
  return inflight;
}

/**
 * States with at least one live listing, or null while unknown.
 * Null means "say nothing", never "not covered".
 */
export function useCoveredStates(): Set<string> | null {
  const [covered, setCovered] = React.useState<Set<string> | null>(cached);

  React.useEffect(() => {
    if (cached) { setCovered(cached); return; }
    let active = true;
    fetchCovered().then((s) => { if (active) setCovered(cached ? s : null); });
    return () => { active = false; };
  }, []);

  return covered;
}
