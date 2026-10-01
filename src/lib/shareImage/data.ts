// What a share image says, built only from fields the listing actually has.
// See docs/SHARE_IMAGE_SYSTEM.md. Nothing here is invented: a missing field
// is a missing line, never a placeholder.

import type { Listing } from '../../types';
import { itemPath } from '../pageMeta';

export interface ShareData {
  /** As the vendor wrote it; the renderer sets it in capitals. */
  brand: string | null;
  /** The garment's name without the brand, in sentence or title case. */
  name: string;
  /** "₹1,490" */
  price: string;
  /** In order, each only if known: listed size, fit, condition. */
  details: string[];
  /** The item's address, for the optional QR. */
  url: string;
}

const SITE = 'https://www.zarketplace.com';

export function formatRupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// Words that stay lowercase inside a title once a shouted title is brought
// down to title case.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'x']);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "FA (F*cking Awesome)" is also "FA" and "F*cking Awesome". Longest first. */
function brandAliases(brand: string | null | undefined): string[] {
  const b = (brand ?? '').trim();
  if (!b) return [];
  const inside = b.match(/\(([^)]+)\)/)?.[1]?.trim();
  const outside = b.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return [...new Set([b, outside, inside].filter((x): x is string => !!x && x.length >= 2))]
    .sort((x, y) => y.length - x.length);
}

/**
 * A title as a name: "Religion Praying Details T-Shirt" with brand "Religion"
 * is "Praying Details Tee". Handles and web addresses go, a shouted run
 * ("MADE IN ITALY") is brought to title case while short acronyms (USA, UFC)
 * stay, and straight quotes are curled. Typos are the vendor's and stay.
 */
export function cleanName(title: string, brand: string | null | undefined): string {
  let t = ` ${title} `;
  t = t.replace(/\s@[\w.]+/g, ' ');
  t = t.replace(/\s[\w-]+\.(?:com|co|in|net|org|store|shop)\b/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();

  for (const alias of brandAliases(brand)) {
    const start = new RegExp(`^${escapeRe(alias)}(?:\\s+|$)`, 'i');
    const end = new RegExp(`(?:^|\\s+)${escapeRe(alias)}$`, 'i');
    if (start.test(t)) { t = t.replace(start, ''); break; }
    if (end.test(t)) { t = t.replace(end, ''); break; }
  }

  t = t.replace(/\bT[\s-]?shirts?\b/gi, 'Tee');
  t = t.replace(/'([^']+)'/g, '‘$1’').replace(/"([^"]+)"/g, '“$1”');
  t = t.replace(/^[\s\-–|,·:]+|[\s\-–|,·:]+$/g, '').replace(/\s+/g, ' ');

  const words = t.split(' ');
  const shouted = (w: string) => /^[A-Z]{2,}$/.test(w);
  t = words.map((w, i) => {
    if (i > 0 && SMALL_WORDS.has(w.toLowerCase()) && (shouted(w) || w === w.toLowerCase())) return w.toLowerCase();
    if (/^[A-Z]{4,}$/.test(w)) return w[0] + w.slice(1).toLowerCase();
    return w;
  }).join(' ');

  // An all-lowercase title gets capitals at the start of its words.
  if (t && t === t.toLowerCase()) {
    t = t.split(' ').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t || title.trim();
}

/**
 * The fit from the vendor's free-text note: "Fits like L/XL", "Fits L/XL" and
 * "No Size Tag, Fits like L" all mean the same thing; "33x32" is a waist and
 * leg. Anything else in the note (shoe conversions, prose) is left out rather
 * than guessed at.
 */
function fitFrom(note: string | null | undefined): string | null {
  const n = (note ?? '').trim();
  if (!n) return null;
  const waistLeg = n.match(/^(\d{2})\s*[x×]\s*(\d{2})$/i);
  if (waistLeg) return `W${waistLeg[1]} L${waistLeg[2]}`;
  const fits = n.match(/\bfits?\s*(?:like)?\s*:?\s*([A-Za-z0-9/.\- ]+?)\s*(?:[,(;]|$)/i);
  const v = fits?.[1]?.trim();
  return v ? `fits like ${v}` : null;
}

export function detailsFor(listing: Pick<Listing, 'size_type' | 'size' | 'condition' | 'category'>): string[] {
  const listed = (listing.size_type ?? '').trim();
  let size = /^one size$/i.test(listed)
    ? 'one size'
    : /^\d{2}$/.test(listed) && listing.category === 'Bottoms' ? `W${listed}` : listed;

  let fit = fitFrom(listing.size);
  if (fit) {
    const fitValue = fit.replace(/^fits like /, '');
    // "L · fits like L" says one thing twice; "W33 · W33 L32" too.
    if (fitValue.toLowerCase() === listed.toLowerCase()) fit = null;
    else if (size && fit.startsWith(size)) { size = fit; fit = null; }
  }

  const condition = (listing.condition ?? '').trim().toLowerCase();
  return [size, fit, condition].filter((x): x is string => !!x);
}

export function shareDataFor(listing: Listing): ShareData {
  const amount = Number(listing.sale_price ?? listing.price ?? 0);
  return {
    brand: listing.brand?.trim() || null,
    name: cleanName(listing.title ?? '', listing.brand),
    price: formatRupees(amount),
    details: detailsFor(listing),
    url: `${SITE}${itemPath(listing)}`,
  };
}
