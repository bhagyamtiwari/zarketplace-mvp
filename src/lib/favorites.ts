// Favorites ("hearts") for listings.
//
// Signed out, favorites live on the device (localStorage), so a visitor
// landing from Instagram can heart something in the first ten seconds without
// an auth wall. Signed in, they live on the account (public.favorites) and
// follow the person to every device; localStorage is then only a cache of the
// account's list, so hearts still show instantly.
//
//   Sign in:   anything hearted on this device while signed out is added to
//              the account, then the device takes the account's list.
//   Signed in: each heart is written to the account as it happens, and the
//              device re-reads the account's list whenever the tab comes back.
//   Sign out:  the device forgets the account's favorites.
//
// Each favorite also keeps a small snapshot of the item (name, photo, price,
// size). Once an item sells it leaves the public catalogue and cannot be
// looked up there, so the snapshot is what lets the favorites view still show
// it and say it has sold. Signed in, the snapshot comes from my_favorites(),
// which also says whether the item sold.
import * as React from 'react';
import type { Listing } from '../types';
import { supabase } from './supabase';
import { log } from './log';

const flog = log('favorites');

const KEY = 'zk_favorites_v1';
const META_KEY = 'zk_favorites_meta_v1';
// Whose list the device is holding: an account id, or absent for favorites
// made while signed out.
const OWNER_KEY = 'zk_favorites_owner_v1';
const EVENT = 'zk:favorites';
const SYNCED_EVENT = 'zk:favorites-synced';

export interface FavoriteSnapshot {
  id: string;
  sku: string | null;
  title: string;
  brand: string | null;
  image_url: string | null;
  price: number;
  sale_price: number | null;
  size: string | null;
  /** Known from the account: the item sold, rather than coming off the site. */
  sold?: boolean;
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

function readOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}

function writeOwner(owner: string | null) {
  try {
    if (owner) localStorage.setItem(OWNER_KEY, owner);
    else localStorage.removeItem(OWNER_KEY);
  } catch { /* see write() */ }
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

// The signed-in account, set by <FavoritesSync /> once auth has settled.
let accountId: string | null = null;

async function addToAccount(listingId: string) {
  if (!accountId) return;
  const { error } = await supabase
    .from('favorites')
    .upsert({ user_id: accountId, listing_id: listingId }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
  if (error) flog.warn('add to account failed', error);
}

async function removeFromAccount(listingId: string) {
  if (!accountId) return;
  const { error } = await supabase.from('favorites').delete().eq('user_id', accountId).eq('listing_id', listingId);
  if (error) flog.warn('remove from account failed', error);
}

export function toggleFavorite(listing: Listing): void {
  const ids = read();
  const meta = readMeta();
  if (ids.has(listing.id)) {
    ids.delete(listing.id);
    delete meta[listing.id];
    void removeFromAccount(listing.id);
  } else {
    ids.add(listing.id);
    meta[listing.id] = snapshotOf(listing);
    void addToAccount(listing.id);
  }
  write(ids, meta);
}

export function removeFavorite(id: string): void {
  const ids = read();
  const meta = readMeta();
  ids.delete(id);
  delete meta[id];
  write(ids, meta);
  void removeFromAccount(id);
}

interface AccountFavorite {
  listing_id: string;
  sku: string | null;
  title: string | null;
  brand: string | null;
  image_url: string | null;
  price: number | null;
  sale_price: number | null;
  size: string | null;
  available: boolean;
  sold: boolean;
}

async function fetchAccountFavorites(): Promise<AccountFavorite[] | null> {
  const { data, error } = await supabase.rpc('my_favorites');
  if (error) { flog.warn('read account favorites failed', error); return null; }
  return (data as AccountFavorite[] | null) ?? [];
}

/**
 * Makes the device's list the account's list. When the device's favorites
 * were made signed out, they are added to the account first (only items
 * still on sale can be; one that has already sold cannot). After that the
 * account's list simply replaces the device's, so a heart removed on another
 * device does not come back from this one. A list left behind by a different
 * account is replaced, never merged in.
 */
export async function syncFavorites(userId: string): Promise<void> {
  const madeSignedOut = readOwner() === null;
  if (madeSignedOut) {
    const local = [...read()];
    const onAccount = await fetchAccountFavorites();
    if (!onAccount) return;
    const have = new Set(onAccount.map((f) => f.listing_id));
    await Promise.allSettled(local.filter((id) => !have.has(id)).map((id) => addToAccount(id)));
  }
  const rows = await fetchAccountFavorites();
  if (!rows || accountId !== userId) return; // signed out meanwhile

  const ids = new Set<string>();
  const meta: Record<string, FavoriteSnapshot> = {};
  for (const r of rows) {
    ids.add(r.listing_id);
    meta[r.listing_id] = {
      id: r.listing_id,
      sku: r.sku,
      title: r.title ?? 'Item',
      brand: r.brand,
      image_url: r.image_url,
      price: Number(r.price ?? 0),
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      size: r.size,
      sold: r.sold,
    };
  }
  writeOwner(userId);
  write(ids, meta);
  window.dispatchEvent(new Event(SYNCED_EVENT));
}

/** Called by <FavoritesSync /> whenever the signed-in account changes. */
export function setFavoritesAccount(userId: string | null): void {
  accountId = userId;
}

/** Signing out: the device stops holding the account's favorites. */
export function forgetAccountFavorites(): void {
  if (!readOwner()) return; // favorites made signed out stay with the device
  writeOwner(null);
  write(new Set(), {});
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

/** Changes each time the account's list has been read, for views to refetch. */
export function useFavoritesSyncTick(): number {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(SYNCED_EVENT, bump);
    return () => window.removeEventListener(SYNCED_EVENT, bump);
  }, []);
  return tick;
}

/** The snapshot taken when each favorite was hearted, where there is one. */
export function favoriteSnapshots(): Record<string, FavoriteSnapshot> {
  return readMeta();
}

/**
 * Brings the snapshots up to date from listings that are still on sale, and
 * records one for favorites hearted before snapshots existed. Called with
 * whatever the feed just loaded; changes nothing the user can see.
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
