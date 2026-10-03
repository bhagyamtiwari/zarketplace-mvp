// Items already fetched this visit, so opening one from the shop draws it at
// once from the row the grid already has, while a fresh copy is fetched
// behind it. Kept in memory only: a reload starts clean.
import type { Listing } from '../types';

const byKey = new Map<string, Listing>();

export function rememberListings(rows: Listing[]): void {
  for (const l of rows) {
    if (l.id) byKey.set(l.id, l);
    if (l.sku) byKey.set(l.sku.toUpperCase(), l);
  }
}

/** By id, or by item code in either form (ZKT- or the old ZV-). */
export function cachedListing(slug: string): Listing | null {
  if (!slug) return null;
  const s = slug.trim();
  const upper = s.toUpperCase();
  return byKey.get(s) ?? byKey.get(upper) ?? byKey.get(upper.replace(/^ZV-/, 'ZKT-')) ?? null;
}
