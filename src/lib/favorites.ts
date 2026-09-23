// Favorites ("hearts") for listings.
//
// Deliberately local-only: there is no favorites table in Supabase yet, and a
// signed-out visitor landing from Instagram must be able to heart something in
// the first ten seconds without hitting an auth wall. Storage is localStorage,
// keyed by listing id. When a server-side table exists this module is the one
// place that has to change.
//
// Each favorite also keeps a small snapshot of the item (name, photo, price,
// size) taken when it was hearted. Once an item sells it leaves the public
// catalogue and cannot be looked up again, so without the snapshot a sold
// favorite would simply vanish; with it, the favorites view can still show it
// and say it is no longer available.
import * as React from 'react';
import type { Listing } from '../types';

const KEY = 'zk_favorites_v1';
const META_KEY = 'zk_favorites_meta_v1';
const EVENT = 'zk:favorites';

export interface FavoriteSnapshot {
  id: string;
  sku: string | null;
  title: string;
  brand: string | null;
  image_url: string | null;
  price: number;
  sale_price: number | null;
  size: string | null;
}

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

function readMeta(): Record<string, FavoriteSnapshot> {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(ids: Set<string>, meta: Record<string, FavoriteSnapshot>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* quota or private mode - the in-memory state still updates for this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function snapshotOf(l: Listing): FavoriteSnapshot {
  return {
    id: l.id,
    sku: l.sku ?? null,
    title: l.title,
    brand: l.brand ?? null,
    image_url: l.image_url ?? null,
    price: Number(l.price ?? 0),
    sale_price: l.sale_price != null ? Number(l.sale_price) : null,
    size: l.size_type || l.size || null,
  };
}

export function toggleFavorite(listing: Listing): void {
  const ids = read();
  const meta = readMeta();
  if (ids.has(listing.id)) {
    ids.delete(listing.id);
    delete meta[listing.id];
  } else {
    ids.add(listing.id);
    meta[listing.id] = snapshotOf(listing);
  }
  write(ids, meta);
}

export function removeFavorite(id: string): void {
  const ids = read();
  const meta = readMeta();
  ids.delete(id);
  delete meta[id];
  write(ids, meta);
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

/** The snapshot taken when each favorite was hearted, where there is one. */
export function favoriteSnapshots(): Record<string, FavoriteSnapshot> {
  return readMeta();
}

/**
 * Brings the snapshots up to date from listings that are still on sale, and
 * records one for favorites hearted before snapshots existed. Called with
 * whatever the favorites view just loaded; changes nothing the user can see.
 */
export function refreshSnapshots(listings: Listing[]): void {
  const ids = read();
  const meta = readMeta();
  let changed = false;
  for (const l of listings) {
    if (!ids.has(l.id)) continue;
    const next = snapshotOf(l);
    if (JSON.stringify(meta[l.id]) !== JSON.stringify(next)) {
      meta[l.id] = next;
      changed = true;
    }
  }
  if (!changed) return;
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* see write() */ }
}
