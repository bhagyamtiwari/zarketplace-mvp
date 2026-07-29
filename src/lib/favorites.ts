// Favorites ("hearts") for listings.
//
// Deliberately local-only: there is no favorites table in Supabase yet, and a
// signed-out visitor landing from Instagram must be able to heart something in
// the first ten seconds without hitting an auth wall. Storage is localStorage,
// keyed by listing id. When a server-side table exists this module is the one
// place that has to change.
import * as React from 'react';

const KEY = 'zk_favorites_v1';
const EVENT = 'zk:favorites';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === 'string')) : new Set();
  } catch {
    // Private-mode / corrupted value: favorites are a nice-to-have, never a crash.
    return new Set();
  }
}

function write(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    /* quota or private mode - the in-memory state still updates for this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleFavorite(id: string): void {
  const ids = read();
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  write(ids);
}

/** Every hearted id, re-rendering any subscriber when the set changes. */
export function useFavorites(): Set<string> {
  const [ids, setIds] = React.useState<Set<string>>(() => read());
  React.useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener(EVENT, sync);
    // `storage` covers the same site open in another tab.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return ids;
}
