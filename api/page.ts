// Per-route tags and a readable summary for the static pages.
//
// Same problem api/item.ts solves for listings, and the same fix. The app is
// client-rendered, so every route served the one index.html and every social
// scraper - WhatsApp, Facebook, Twitter/X, Slack, LinkedIn - read the
// homepage's tags whatever URL was shared. src/lib/pageMeta.ts sets the right
// tags, but it sets them in JavaScript, which those scrapers never run.
//
// The AI crawlers (ChatGPT, Claude, Perplexity) do not run it either, so to
// them every page was the homepage's hero and nothing else. Each route here
// therefore also carries a short, plain-text summary of the page, served in a
// <noscript> block in place of the homepage's: a browser running the app
// never shows it, and anything reading the raw HTML gets the substance of the
// page. Every sentence in a summary must be true of the page it stands for.
//
// Google executes JS and sees the real page as well; the tags and summary are
// the same story told for the ones that do not.
//
// Not SSR: this serves the exact built shell with a few blocks swapped, so the
// React app boots from an identical document. One renderer, not two.

const SITE = 'https://www.zarketplace.com';

interface Faq { q: string; a: string }

interface RouteMeta {
  title: string;
  description: string;
  noIndex?: boolean;
  /** The page's own name, as its heading. */
  heading: string;
  /** What the page says, in a few plain sentences. */
  summary: string[];
  /** Questions and answers, for the FAQ page's structured data and summary. */
  faq?: Faq[];
}

// Kept deliberately in step with META in src/lib/pageMeta.ts. Only public,
// shareable routes belong here - a signed-in surface has nothing to preview.
//
// /browse is not here: it renders the same feed as the homepage and is
// canonicalised to it, so it is served the homepage's shell untouched.
const ROUTES: Record<string, RouteMeta> = {
  '/sell': {
    title: 'Sell your clothes for a fixed offer',
    description: 'Get a fixed offer for clothes you no longer wear, within 24 hours. Selling to us is free, we pay for shipping, and the item stays with you until it sells.',
    heading: 'Sell your clothes to zarketplace',
    summary: [
      'Add photos of your item, its size and an honest condition. Within 24 hours we make you an offer: a fixed amount in rupees that we will pay you. It does not change once you accept.',
      'Selling to us is free and we pay for shipping. The item stays with you until someone buys it. Then we email you a prepaid label, a courier collects it from your door, and we pay you once it reaches our hub and has been checked.',
      'You have 7 days to accept an offer. Once you accept, the item is on sale for up to 30 days, and you can withdraw it any time before it is bought. You do not need a GSTIN.',
    ],
  },
  '/buyer-protection': {
    title: 'Buyer Protection',
    description: 'Every zarketplace order is checked at our hub before it ships. Not as described, or the wrong item? Tell us within 7 days of delivery for a full refund.',
    heading: 'Buyer Protection',
    summary: [
      'Every order on zarketplace is covered by Buyer Protection. We buy every item ourselves, check it at our hub against its listing and photos, and ship it to you repacked and tracked. If it does not match, it does not ship.',
      'If an item arrives not as described, or it is the wrong item, tell us within 7 days of delivery for a full refund, and we pay the return postage. Buyer Protection costs nothing extra.',
      'You pay zarketplace directly, through Razorpay, and your address and phone number go only to the courier delivering your order.',
    ],
  },
  '/shipping-policy': {
    title: 'Shipping',
    description: 'Every zarketplace order ships from our own hub, checked and repacked, and tracked to your door. Instant Ship items are dispatched within 48 hours.',
    heading: 'Shipping',
    summary: [
      'Every order ships from our hub, in our packaging, under our name, and every order is tracked. When you buy, we bring the item in to our hub, check it against its listing and photos, and repack it. Once it passes the check it is dispatched that day, and you get the courier and tracking link by email.',
      'Instant Ship items are already at our hub and are dispatched within 48 hours. If a parcel is delayed, damaged or lost on the way, we deal with the courier.',
    ],
  },
  '/how-it-works': {
    title: 'How selling works',
    description: 'How to sell clothes to zarketplace: a fixed offer in 24 hours, the item stays with you until it sells, free courier pickup, and payment once it reaches our hub.',
    heading: 'How selling works',
    summary: [
      '1. Add your item: photos, size and an honest condition. 2. Accept our offer: a fixed amount in rupees, locked once you accept. 3. We collect it: when someone buys it, we email a prepaid label and a courier collects it from your door, usually within 48 hours. It must be handed over within 5 days. 4. Get paid: once we have checked it at our hub, the amount you accepted, in full.',
      'zarketplace buys your item and resells it. We cover shipping both ways, payment processing and handling, and we carry the risk if it does not sell. If it has not sold within 30 days of accepting, the offer ends and nothing is owed either way.',
      'We only buy authentic items. Counterfeits and replicas are refused at our hub and are not paid for.',
    ],
  },
  '/our-mission': {
    title: 'Our mission',
    description: 'Keep good clothes in use. India throws away millions of tonnes of textiles a year; zarketplace only sells clothing that already exists.',
    heading: 'Our mission',
    summary: [
      'Sustainability should not be one more thing to sell. The most sustainable piece of clothing is the one that has already been made, so that is all zarketplace sells.',
      "India throws away around 7.8 million tonnes of textiles a year, roughly a twelfth of all the textile waste in the world (Fashion for Good, Wealth in Waste, 2022). We buy good clothes people have stopped wearing, check every piece, and pass it on to someone who will, keeping it in use and out of that pile.",
      'Items stay with their owners until they sell, so nothing moves on speculation, and every listing carries measurements to cut returns.',
    ],
  },
  '/about': {
    title: 'About us',
    description: 'zarketplace is an Indian resale company. We buy pre-owned clothing from individuals, check every piece at our hub, and sell it ourselves at a fixed price.',
    heading: 'About zarketplace',
    summary: [
      'zarketplace is a resale company for pre-owned clothing in India, and a trading name of ADNIZ Private Limited. We buy clothes from individuals at a fixed offer and resell them in our own name, so every order is sold and shipped by zarketplace. It is a shop, not a marketplace.',
      'Every item comes to our hub and is checked against its listing before it ships. If it does not match, it does not ship. Every price is fixed and shown upfront, and once an item sells it leaves the shop.',
      'Every item resold here is one that stays in use instead of being thrown away.',
    ],
  },
  '/faq': {
    title: 'FAQ',
    description: 'Answers on buying pre-owned clothing from zarketplace, selling us your clothes, payouts, delivery, Buyer Protection and returns.',
    heading: 'Frequently asked questions',
    summary: [],
    // A selection of the questions on the page, in its words.
    faq: [
      { q: 'How do I buy an item?', a: 'Open the item you want and tap Buy It Now or Add to Cart, then pay securely through Razorpay. Every item is sold and shipped by zarketplace, so there is nobody to DM and no price to negotiate.' },
      { q: 'What happens after payment?', a: 'Your order is confirmed. We bring the item in to our hub, check it, repack it, and ship it out to you, tracked. You can follow each step in My Orders.' },
      { q: 'Can I cancel an order?', a: 'Yes, as long as the item has not shipped yet. Email contact@zarketplace.com with your order number.' },
      { q: 'What if an item is not as described?', a: 'Contact us within 7 days of delivery at contact@zarketplace.com. We sold you the item, so you are dealing with us directly, and a wrong or misrepresented item is refunded in full.' },
      { q: 'Does zarketplace check items?', a: 'Every listing is reviewed before it is published, and every item comes in to our hub, where we check it against its listing and photos before we repack it and ship it out. Anything that does not match does not ship.' },
      { q: 'How do I sell an item?', a: 'Tap Get an offer, upload photos, and fill in the category, size and condition. Within 24 hours we come back with an offer: a fixed amount we will pay you. If you accept, that number is locked and the item goes on sale at our price.' },
      { q: 'Do I send the item as soon as I accept?', a: 'No. The item stays with you until someone buys it. Then we email a prepaid label and a courier collects it from your door. It must be handed over within 5 days.' },
      { q: 'When do I get paid?', a: 'Once your item reaches our hub and we accept it, we pay you the amount you agreed to when you accepted our offer.' },
      { q: 'How long is my offer open, and how long is my item on the site?', a: 'You have 7 days to accept an offer. Once you accept, your item is on the site for 30 days. If we have not sold it by then, or you withdraw it, your offer ends and nothing is owed either way.' },
    ],
  },
  '/conditions-guide': {
    title: 'Conditions guide',
    description: 'How zarketplace grades every pre-owned item, on one four-tier scale: Pristine, Great, Good and Worn, and what each grade means.',
    heading: 'Conditions guide',
    summary: [
      'Every item on zarketplace is graded on the same four-tier scale. Pristine (4/4): like new, never worn or worn once, with no visible wear. Great (3/4): lightly worn and well kept, with no flaws. Good (2/4): used, with light fading or small marks, in solid shape. Worn (1/4): clear wear such as fading, marks, loose threads or damage, shown in the listing.',
      'We check every item against its listing before it ships, and anything that does not match does not go out.',
    ],
  },
  '/returns': {
    title: 'Returns and refunds',
    description: 'What zarketplace refunds and what it does not. Wrong item or not as described: tell us within 7 days. Change of mind and wrong fit are not refundable.',
    heading: 'Returns and refunds',
    summary: [
      'We refund an item that is not as described, the wrong item, or one with a flaw we did not disclose. Tell us within 7 days of delivery with your order number and photos, and we pay the return postage. Refunds go back to the way you paid within 5 to 7 business days of approval.',
      'Every item is pre-owned and one of a kind, so a change of mind or a wrong fit is not refundable. Every listing carries its measurements so you can check the fit before you buy. An order can be cancelled by email before it ships.',
    ],
  },
  '/refund-policy': {
    title: 'Refund policy',
    description: 'How and when zarketplace refunds an order: cancellations before dispatch and approved claims, within 5 to 7 business days, to the way you paid.',
    heading: 'Refund policy',
    summary: [
      'We refund when an order is cancelled before we dispatch it, or when an item is materially misrepresented, has undisclosed damage, or is the wrong item. We do not refund a change of mind or a wrong fit.',
      'Cancellations before dispatch are refunded within 5 to 7 business days. Claims are reviewed within 48 hours of receiving your order number and photos, and approved claims are refunded within 5 to 7 business days, to the original payment method.',
    ],
  },
  '/terms': {
    title: 'Terms',
    description: 'The terms you agree to when buying from or selling to zarketplace, a trading name of ADNIZ Private Limited.',
    heading: 'Terms',
    summary: ['The terms you agree to when buying from or selling to zarketplace, a trading name of ADNIZ Private Limited.'],
  },
  '/privacy': {
    title: 'Privacy policy',
    description: 'What zarketplace collects, why, and what we do with it.',
    heading: 'Privacy policy',
    summary: ['What zarketplace collects, why, and what we do with it.'],
  },
  '/contact': {
    title: 'Contact us',
    description: 'Reach zarketplace by email at contact@zarketplace.com or on WhatsApp at 8505-ZARKET. A person answers.',
    heading: 'Contact us',
    summary: [
      'Email contact@zarketplace.com, message us on WhatsApp at 8505-ZARKET (+91 85059 27538), or find us on Instagram at @zarketplace. A person answers. Email is best for anything about an order.',
    ],
  },
  '/grievance-officer': {
    title: 'Grievance Officer',
    description: 'Grievance officer details, as required under the Consumer Protection (E-Commerce) Rules 2020.',
    heading: 'Grievance Officer',
    summary: [
      'Grievance Officer: Bhagyam Tiwari, Director, ADNIZ Private Limited. Email grievance@zarketplace.com, or call +91 85059 27538.',
      'We acknowledge every complaint within 48 hours and resolve it within one month. zarketplace is a trading name of ADNIZ Private Limited, and we are the seller for every order on this site.',
    ],
  },
  '/trademark-notice': {
    title: 'Trademark & brand notice',
    description: 'zarketplace resells pre-owned clothing bought from individuals. How we use brand names, and how rights holders can reach us.',
    heading: 'Trademark and brand notice',
    summary: [
      'Everything zarketplace sells is second-hand and was bought by us from an individual. We are not affiliated with, associated with or endorsed by any of the brands we sell, and we use a brand name only to describe the genuine item being sold.',
      'Rights holders can reach us at contact@zarketplace.com.',
    ],
  },
};

// The pages every summary links to, so a crawler that reads only HTML can
// still find its way around.
const NAV: Array<[string, string]> = [
  ['/', 'Shop pre-owned clothing'],
  ['/sell', 'Get an offer'],
  ['/how-it-works', 'How selling works'],
  ['/buyer-protection', 'Buyer Protection'],
  ['/returns', 'Returns and refunds'],
  ['/shipping-policy', 'Shipping'],
  ['/conditions-guide', 'Conditions guide'],
  ['/faq', 'FAQ'],
  ['/about', 'About zarketplace'],
  ['/our-mission', 'Our mission'],
  ['/contact', 'Contact us'],
];

// The sitewide block index.html ships with. Removed before the per-route block
// goes in, so a scraper never sees two of any tag.
const STRIP_RE =
  /\s*<(?:title>[\s\S]*?<\/title|meta\s+(?:name|property)="(?:description|og:title|og:description|og:url|twitter:title|twitter:description|robots)"[^>]*\/?|link\s+rel="canonical"[^>]*\/?)>/g;
// The homepage's summary, replaced by the route's own.
const SUMMARY_RE = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
// The homepage's hero. Only the feed shows it, and /browse is not routed here.
const HERO_RE = /<!--static-hero:start-->[\s\S]*?<!--static-hero:end-->/;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTags(meta: RouteMeta, canonical: string): string {
  const title = `${meta.title} | zarketplace`;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta name="robots" content="${meta.noIndex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
  ];
  if (meta.faq?.length) {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: meta.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
    // Escaped so no answer can close the script block.
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n  ');
}

function buildSummary(meta: RouteMeta): string {
  const parts = [`<h1>${esc(meta.heading)}</h1>`];
  for (const p of meta.summary) parts.push(`<p>${esc(p)}</p>`);
  for (const f of meta.faq ?? []) parts.push(`<h2>${esc(f.q)}</h2>`, `<p>${esc(f.a)}</p>`);
  parts.push(
    '<p>zarketplace sells pre-owned and thrift clothing in India. Every item is sold and shipped by zarketplace.</p>',
    `<ul>${NAV.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>`,
  );
  return `<!--seo:start--><noscript>${parts.join('')}</noscript><!--seo:end-->`;
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
    html = html
      .replace(STRIP_RE, '')
      .replace('</head>', `  ${buildTags(meta, canonical)}\n  </head>`)
      .replace(HERO_RE, '')
      .replace(SUMMARY_RE, buildSummary(meta));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
