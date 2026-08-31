// Per-route Open Graph tags for the static pages.
//
// Same problem api/item.ts solves for listings, and the same fix. The app is
// client-rendered, so every route served the one index.html and every social
// scraper - WhatsApp, Facebook, Twitter/X, Slack, LinkedIn - read the
// homepage's tags whatever URL was shared. src/lib/pageMeta.ts sets the right
// tags, but it sets them in JavaScript, which those scrapers never run.
//
// Google executes JS and would eventually see the client-side tags. Nothing
// else does. So a /sell link shared in a WhatsApp group previewed as the
// homepage, which is precisely the surface the tags exist for.
//
// Not SSR: this serves the exact built shell with its OG block swapped, so the
// React app boots from an identical document. One renderer, not two.

const SITE = 'https://www.zarketplace.com';

interface RouteMeta { title: string; description: string; noIndex?: boolean }

// Kept deliberately in step with META in src/lib/pageMeta.ts. Only public,
// shareable routes belong here - a signed-in surface has nothing to preview.
const ROUTES: Record<string, RouteMeta> = {
  '/browse': {
    title: 'Browse pre-owned fashion',
    description: 'Every piece bought, checked and repacked by zarketplace before it ships. One-of-one items, priced upfront, delivered tracked.',
  },
  '/sell': {
    title: 'Sell us your clothes',
    description: "Tell us what you want for it and we'll tell you what we'll pay. A fixed amount, agreed before your item is listed, that never changes.",
  },
  '/buyer-protection': {
    title: 'Buyer protection',
    description: 'Every order is handled by zarketplace start to finish. We buy the items we sell, check them against their listing, and repack them before they ship.',
  },
  '/shipping-policy': {
    title: 'Shipping',
    description: 'Every order ships from our own hub, in our packaging, under our name. Tracked, same-day dispatch once an item is checked in.',
  },
  '/vendor-policy': {
    title: 'Vendor policy',
    description: 'What we expect from every item we buy, how the acquisition price works, and when you get paid.',
  },
  '/about': {
    title: 'What is zarketplace',
    description: 'We buy pre-owned fashion from individuals and resell it ourselves. One source, one standard, one company answerable for every order.',
  },
  '/faq': {
    title: 'FAQ',
    description: 'Answers on buying from zarketplace, selling us an item, payouts, delivery and returns.',
  },
  '/conditions-guide': {
    title: 'Condition guide',
    description: 'How zarketplace grades condition, on a fixed scale, on every listing.',
  },
  '/returns': { title: 'Returns', description: 'How to return an order to zarketplace, and what happens when an item is not as described.' },
  '/refund-policy': { title: 'Refund policy', description: 'How and when zarketplace refunds an order.' },
  '/terms': { title: 'Terms', description: 'The terms you agree to when buying from or selling to zarketplace.' },
  '/privacy': { title: 'Privacy', description: 'What zarketplace collects, why, and what we do with it.' },
  '/contact': { title: 'Contact', description: 'Get in touch with zarketplace.' },
  '/grievance-officer': { title: 'Grievance officer', description: 'Grievance officer details, as required under the Consumer Protection (E-Commerce) Rules 2020.' },
  '/trademark-notice': { title: 'Trademark & brand notice', description: 'How brand names are used on zarketplace listings.' },
};

// The sitewide block index.html ships with. Removed before the per-route block
// goes in, so a scraper never sees two of any tag.
const STRIP_RE =
  /\s*<(?:title>[\s\S]*?<\/title|meta\s+(?:name|property)="(?:description|og:title|og:description|og:url|twitter:title|twitter:description|robots)"[^>]*\/?|link\s+rel="canonical"[^>]*\/?)>/g;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTags(meta: RouteMeta, canonical: string): string {
  const title = `${meta.title} | zarketplace`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta name="robots" content="${meta.noIndex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
  ].join('\n  ');
}

export default async function handler(req: any, res: any) {
  const path = String(req.query?.path ?? '').trim();
  const route = path.startsWith('/') ? path : `/${path}`;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.zarketplace.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  let html: string;
  try {
    const shell = await fetch(`${origin}/index.html`);
    if (!shell.ok) throw new Error(`shell ${shell.status}`);
    html = await shell.text();
  } catch {
    // Never serve a broken page for the sake of a preview.
    res.setHeader('Location', route);
    res.status(302).end();
    return;
  }

  const meta = ROUTES[route];
  if (meta) {
    const canonical = `${SITE}${route}`;
    html = html.replace(STRIP_RE, '').replace('</head>', `  ${buildTags(meta, canonical)}\n  </head>`);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
