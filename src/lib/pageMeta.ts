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
const DEFAULT_TITLE = 'zarketplace - pre-owned fashion, sold & shipped by us';
const DEFAULT_DESCRIPTION =
  'zarketplace buys pre-owned fashion and resells it. Every piece is received, checked and repacked by us before it ships. Tracked delivery, one source, no DMs.';

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

/** Every page's tags, in one place so they can be read as a set. */
export const META = {
  home: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
  },
  browse: {
    title: 'Browse pre-owned fashion',
    description: 'Every piece bought, checked and repacked by zarketplace before it ships. One-of-one items, priced upfront, delivered tracked.',
    path: '/browse',
  },
  sell: {
    title: 'Sell us your clothes',
    description: "Tell us what you want for it and we'll tell you what we'll pay. A fixed amount, agreed before your item is listed, that never changes.",
    path: '/sell',
  },
  buyerProtection: {
    title: 'Buyer protection',
    description: 'Every order is handled by zarketplace start to finish. We buy the items we sell, check them against their listing, and repack them before they ship.',
    path: '/buyer-protection',
  },
  shipping: {
    title: 'Shipping',
    description: 'Every order ships from our own hub, in our packaging, under our name. Tracked, same-day dispatch once an item is checked in.',
    path: '/shipping-policy',
  },
  vendorPolicy: {
    title: 'Vendor policy',
    description: 'What we expect from every item we buy, how the acquisition price works, and when you get paid.',
    path: '/vendor-policy',
  },
  faq: {
    title: 'FAQ',
    description: 'Answers on buying from zarketplace, selling us an item, payouts, delivery and returns.',
    path: '/faq',
  },
  about: {
    title: 'What is zarketplace',
    description: 'We buy pre-owned fashion from individuals and resell it ourselves. One source, one standard, one company answerable for every order.',
    path: '/about',
  },
  conditions: {
    title: 'Condition guide',
    description: 'How zarketplace grades condition, on a fixed scale, on every listing.',
    path: '/conditions-guide',
  },
  returns: {
    title: 'Returns',
    description: 'How to return an order to zarketplace, and what happens when an item is not as described.',
    path: '/returns',
  },
  refunds: {
    title: 'Refund policy',
    description: 'How and when zarketplace refunds an order.',
    path: '/refund-policy',
  },
  terms: { title: 'Terms', description: 'The terms you agree to when buying from or selling to zarketplace.', path: '/terms' },
  privacy: { title: 'Privacy', description: 'What zarketplace collects, why, and what we do with it.', path: '/privacy' },
  contact: { title: 'Contact', description: 'Get in touch with zarketplace.', path: '/contact' },
  grievance: { title: 'Grievance officer', description: 'Grievance officer details, as required under the Consumer Protection (E-Commerce) Rules 2020.', path: '/grievance-officer' },
  trademark: { title: 'Trademark & brand notice', description: 'How brand names are used on zarketplace listings.', path: '/trademark-notice' },
  // Signed-in and operator surfaces: never indexed.
  cart: { title: 'Your bag', description: 'Your bag.', path: '/cart', noIndex: true },
  checkout: { title: 'Checkout', description: 'Checkout.', noIndex: true },
  orders: { title: 'Your orders', description: 'Track your orders.', noIndex: true },
  account: { title: 'Your profile', description: 'Your profile.', noIndex: true },
  vendorPortal: { title: 'Your items', description: 'Your items and payouts.', noIndex: true },
  offer: { title: 'Your offer', description: 'Your offer.', noIndex: true },
  hub: { title: 'Hub', description: 'Operations.', noIndex: true },
  admin: { title: 'Admin', description: 'Operations.', noIndex: true },
  resetPassword: { title: 'Reset password', description: 'Reset your password.', noIndex: true },
} as const;
