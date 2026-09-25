// Per-page title, description and social tags.
//
// The app is client-rendered from one static index.html, so every route used
// to inherit the homepage's tags. Only titles were ever overridden, and the
// fallback title was still the old marketplace one. This sets all four on
// mount and restores them on unmount.
//
// Product pages are the exception: api/item.ts injects their tags server-side,
// which is what a crawler actually reads.

import { useEffect } from 'react';

const SITE = 'https://www.zarketplace.com';
// The name, then what it is, in the words people search with. "zarketplace"
// alone reads as a typo for "marketplace", so the title says what the site
// sells and where, and the description says how it works. Mirrored in
// index.html, which is what a crawler reads first.
const DEFAULT_TITLE = 'zarketplace | Pre-owned & thrift clothing in India';
const DEFAULT_DESCRIPTION =
  'Pre-owned and thrift clothing in India, sold and shipped by zarketplace. Every piece checked, priced upfront and delivered free. Sell us yours for a fixed offer.';

export interface PageMeta {
  /** Appended with " | zarketplace" unless it is the home page. */
  title: string;
  description: string;
  /** Path only, e.g. "/sell". Used for canonical and og:url. */
  path?: string;
  /** Pages that should not be indexed (account, checkout, operator screens). */
  noIndex?: boolean;
}

function setTag(selector: string, attr: 'content' | 'href', value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

export function usePageMeta({ title, description, path, noIndex }: PageMeta) {
  useEffect(() => {
    const fullTitle = title === DEFAULT_TITLE ? title : `${title} | zarketplace`;
    const url = path ? `${SITE}${path}` : SITE;

    const previous = {
      title: document.title,
      description: document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? DEFAULT_DESCRIPTION,
      robots: document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? 'index, follow',
      canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? SITE,
    };

    document.title = fullTitle;
    setTag('meta[name="description"]', 'content', description);
    setTag('meta[name="robots"]', 'content', noIndex ? 'noindex, nofollow' : 'index, follow');
    setTag('link[rel="canonical"]', 'href', url);
    setTag('meta[property="og:title"]', 'content', fullTitle);
    setTag('meta[property="og:description"]', 'content', description);
    setTag('meta[property="og:url"]', 'content', url);
    setTag('meta[name="twitter:title"]', 'content', fullTitle);
    setTag('meta[name="twitter:description"]', 'content', description);

    return () => {
      document.title = previous.title || DEFAULT_TITLE;
      setTag('meta[name="description"]', 'content', previous.description);
      setTag('meta[name="robots"]', 'content', previous.robots);
      setTag('link[rel="canonical"]', 'href', previous.canonical);
      setTag('meta[property="og:title"]', 'content', previous.title || DEFAULT_TITLE);
      setTag('meta[property="og:description"]', 'content', previous.description);
      setTag('meta[property="og:url"]', 'content', previous.canonical);
      setTag('meta[name="twitter:title"]', 'content', previous.title || DEFAULT_TITLE);
      setTag('meta[name="twitter:description"]', 'content', previous.description);
    };
  }, [title, description, path, noIndex]);
}

/** Every page's tags, in one place so they can be read as a set. Public
    pages are kept in step with ROUTES in api/page.ts, which serves the same
    tags to crawlers that do not run JavaScript. */
export const META = {
  home: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
  },
  sell: {
    title: 'Sell your clothes for a fixed offer',
    description: 'Get a fixed offer for clothes you no longer wear, within 24 hours. Selling to us is free, we pay for shipping, and the item stays with you until it sells.',
    path: '/sell',
  },
  buyerProtection: {
    title: 'Buyer Protection',
    description: 'Every zarketplace order is checked at our hub before it ships. Not as described, or the wrong item? Tell us within 7 days of delivery for a full refund.',
    path: '/buyer-protection',
  },
  shipping: {
    title: 'Shipping',
    description: 'Every zarketplace order ships from our own hub, checked and repacked, and tracked to your door. Instant Ship items are dispatched within 48 hours.',
    path: '/shipping-policy',
  },
  howItWorks: {
    title: 'How selling works',
    description: 'How to sell clothes to zarketplace: a fixed offer in 24 hours, the item stays with you until it sells, free courier pickup, and payment once it reaches our hub.',
    path: '/how-it-works',
  },
  faq: {
    title: 'FAQ',
    description: 'Answers on buying pre-owned clothing from zarketplace, selling us your clothes, payouts, delivery, Buyer Protection and returns.',
    path: '/faq',
  },
  about: {
    title: 'About us',
    description: 'zarketplace is an Indian resale company. We buy pre-owned clothing from individuals, check every piece at our hub, and sell it ourselves at a fixed price.',
    path: '/about',
  },
  conditions: {
    title: 'Conditions guide',
    description: 'How zarketplace grades every pre-owned item, on one four-tier scale: Pristine, Great, Good and Worn, and what each grade means.',
    path: '/conditions-guide',
  },
  returns: {
    title: 'Returns and refunds',
    description: 'What zarketplace refunds and what it does not. Wrong item or not as described: tell us within 7 days. Change of mind and wrong fit are not refundable.',
    path: '/returns',
  },
  refunds: {
    title: 'Refund policy',
    description: 'How and when zarketplace refunds an order: cancellations before dispatch and approved claims, within 5 to 7 business days, to the way you paid.',
    path: '/refund-policy',
  },
  terms: { title: 'Terms', description: 'The terms you agree to when buying from or selling to zarketplace, a trading name of ADNIZ Private Limited.', path: '/terms' },
  privacy: { title: 'Privacy policy', description: 'What zarketplace collects, why, and what we do with it.', path: '/privacy' },
  contact: { title: 'Contact us', description: 'Reach zarketplace by email at contact@zarketplace.com or on WhatsApp at 8505-ZARKET. A person answers.', path: '/contact' },
  grievance: { title: 'Grievance Officer', description: 'Grievance officer details, as required under the Consumer Protection (E-Commerce) Rules 2020.', path: '/grievance-officer' },
  mission: {
    title: 'Our mission',
    description: 'Keep good clothes in use. India throws away millions of tonnes of textiles a year; zarketplace only sells clothing that already exists.',
    path: '/our-mission',
  },
  trademark: { title: 'Trademark & brand notice', description: 'zarketplace resells pre-owned clothing bought from individuals. How we use brand names, and how rights holders can reach us.', path: '/trademark-notice' },
  // Signed-in and operator surfaces: never indexed.
  cart: { title: 'Your cart', description: 'Your cart.', path: '/cart', noIndex: true },
  checkout: { title: 'Checkout', description: 'Checkout.', noIndex: true },
  orders: { title: 'Your orders', description: 'Track your orders.', noIndex: true },
  account: { title: 'Your profile', description: 'Your profile.', noIndex: true },
  vendorPortal: { title: 'Your items', description: 'Your items and payouts.', noIndex: true },
  offer: { title: 'Your offer', description: 'Your offer.', noIndex: true },
  hub: { title: 'Hub', description: 'Operations.', noIndex: true },
  admin: { title: 'Admin', description: 'Operations.', noIndex: true },
  resetPassword: { title: 'Reset password', description: 'Reset your password.', noIndex: true },
} as const;

// An item's name as a search result shows it: its brand at the front when
// the title does not already carry it. Kept in step with api/item.ts, which
// writes the same tags into the first response.
export function itemName(title: string | null | undefined, brand: string | null | undefined): string {
  const t = (title ?? '').trim() || 'Item';
  const b = (brand ?? '').trim();
  return b && !t.toLowerCase().includes(b.toLowerCase()) ? `${b} ${t}` : t;
}

// An item's address carries its name after its code, /item/zv-83374-levis-
// 501-jeans, because a search engine reads the words in a link as well as on
// the page. Only the code finds the item: the words after it can change with
// the title and old links still land. Kept in step with api/item.ts and
// api/sitemap-items.ts, which build the same addresses on the server.
export function itemSlug(title: string | null | undefined, brand: string | null | undefined): string {
  let s = itemName(title, brand)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 80) s = s.slice(0, 81).replace(/-[^-]*$/, '');
  return s;
}

/** The link to an item's page. Falls back to /product/<id> for the rare row with no code. */
export function itemPath(l: { sku?: string | null; id?: string | null; title?: string | null; brand?: string | null }): string {
  if (!l.sku) return `/product/${l.id ?? ''}`;
  const code = l.sku.toLowerCase();
  const slug = itemSlug(l.title, l.brand);
  return `/item/${slug ? `${code}-${slug}` : code}`;
}

/** The item code at the front of an /item/ address: zv-83374 from zv-83374-levis-501-jeans. */
export function skuFromItemParam(param: string | null | undefined): string {
  const p = (param ?? '').trim();
  const m = /^zv-[0-9a-f]+(?=-|$)/i.exec(p);
  return m ? m[0] : p;
}

export function itemMetaTitle(name: string, size: string | null | undefined): string {
  const sz = (size ?? '').trim();
  return `Pre-owned ${name}${sz ? `, size ${sz}` : ''}`;
}

export function itemMetaDescription(name: string, size: string | null | undefined, condition: string | null | undefined, freeDelivery: boolean): string {
  const sz = (size ?? '').trim();
  const cond = (condition ?? '').trim();
  return `${name}${sz ? `, size ${sz}` : ''}${cond ? `, in ${cond} condition` : ''}. Sold and shipped by zarketplace${freeDelivery ? ' with free delivery' : ''}, and checked at our hub before it ships.`;
}

/** Demo listings show how the shop looks. They are never for sale, so never indexed. */
export function isDemoTitle(title: string | null | undefined): boolean {
  return /\(demo\)\s*$/i.test(title ?? '');
}
