// Per-listing Open Graph tags for /item/<sku>.
//
// The app is client-rendered, and social scrapers (WhatsApp, Instagram,
// Facebook, Twitter/X, Slack) do not run JavaScript: they read the first HTML
// response and stop. So every shared item link previewed as the wordmark plus
// the sitewide description, which is the largest leak in the product given
// that sellers sharing links IS the growth loop.
//
// This is deliberately not SSR. It serves the exact same built index.html the
// static host would serve, with the sitewide OG block swapped for item-specific
// tags before it goes out. The React app boots from it identically - it is the
// same document, four meta tags different - so there is one renderer, not two.
//
// Only /item/* is routed here (see vercel.json). Everything else stays static.

// Canonical host is taken from the request, not hardcoded: the apex
// 307-redirects to www, so a hardcoded apex made every og:url and canonical
// point at a redirect. Scrapers follow it, but it splits the signals for a
// link that is meant to be the growth loop.
// The hero photograph, letterboxed to 1200x630. Used when a listing somehow
// has no usable photo, and matched to the sitewide card in index.html so a
// shared link never previews as a bare logo. Already 1200x630, so the
// dimension tags below apply to it as well as to a listing's own card.
const FALLBACK_IMAGE = 'https://www.zarketplace.com/images/og-hero.jpg';
const FALLBACK_IS_1200x630 = true;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

interface PublicListing {
  id: string;
  sku: string | null;
  title: string | null;
  brand: string | null;
  size_type: string | null;
  size: string | null;
  condition: string | null;
  price: number | null;
  sale_price: number | null;
  image_url: string | null;
  shipping_category: string | null;
  free_shipping: boolean | null;
  description: string | null;
  has_flaws: boolean | null;
  flaws_description: string | null;
}

// Mirrors socialCardUrl() in src/lib/images.ts. Duplicated rather than
// imported because this function is bundled by Vercel, not by Vite, and must
// not pull the browser image pipeline into a Node runtime.
const VARIANT_SUFFIX_RE = /-(?:400|800|1600)\.(?:webp|jpe?g|png)$/i;
function socialCardUrl(url: string): string | null {
  return VARIANT_SUFFIX_RE.test(url) ? url.replace(VARIANT_SUFFIX_RE, '-og.jpg') : null;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The same three as itemName, itemMetaTitle and itemMetaDescription in
// src/lib/pageMeta.ts, which set these tags when a visit arrives by clicking
// through the shop. Duplicated for the same reason as socialCardUrl.
function itemName(title: string | null, brand: string | null): string {
  const t = (title ?? '').trim() || 'Item';
  const b = (brand ?? '').trim();
  return b && !t.toLowerCase().includes(b.toLowerCase()) ? `${b} ${t}` : t;
}

function itemMetaTitle(name: string, size: string | null | undefined): string {
  const sz = (size ?? '').trim();
  return `Pre-owned ${name}${sz ? `, size ${sz}` : ''}`;
}

function itemMetaDescription(name: string, size: string | null | undefined, condition: string | null, freeDelivery: boolean): string {
  const sz = (size ?? '').trim();
  const cond = (condition ?? '').trim();
  return `${name}${sz ? `, size ${sz}` : ''}${cond ? `, in ${cond} condition` : ''}. Sold and shipped by zarketplace${freeDelivery ? ' with free delivery' : ''}, and checked at our hub before it ships.`;
}

// Demo listings show how the shop looks and are never for sale: no product
// markup, and never indexed.
function isDemo(l: PublicListing): boolean {
  return /\(demo\)\s*$/i.test(l.title ?? '');
}

function rupees(n: number): string {
  // Indian digit grouping, matching formatCurrency() in the app.
  return `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

async function pg<T>(path: string): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

/** The number a buyer actually pays: item + buyer protection + shipping. */
async function checkoutTotal(l: PublicListing): Promise<number> {
  const item = Number(l.sale_price ?? l.price ?? 0);
  if (!item) return 0;

  const [cfg] = await pg<{
    buyer_protection_percent: number;
    buyer_protection_floor: number;
    buyer_protection_cap: number | null;
  }>('pricing_config?id=eq.1&select=buyer_protection_percent,buyer_protection_floor,buyer_protection_cap');

  let fee = 0;
  if (cfg) {
    fee = Math.max(cfg.buyer_protection_floor, Math.round((cfg.buyer_protection_percent / 100) * item));
    if (cfg.buyer_protection_cap != null) fee = Math.min(cfg.buyer_protection_cap, fee);
  }

  let shipping = 0;
  if (!l.free_shipping && l.shipping_category) {
    const [rate] = await pg<{ rate: number }>(
      `shipping_categories?key=eq.${encodeURIComponent(l.shipping_category)}&select=rate`,
    );
    shipping = Number(rate?.rate ?? 0);
  }
  return item + fee + shipping;
}

// The machine-readable version of the one thing that matters about this
// business: the seller on every Product is ADNIZ Private Limited, not the
// person who owned the item. A marketplace cannot say that, and without it
// there is nothing in the markup to tell the two apart.
//
// itemCondition is UsedCondition on every listing, because everything here is.
// availability is InStock with an inventory of one: these are single pieces,
// and a sold listing is not served by this route at all.
function productJsonLd(
  l: PublicListing,
  total: number,
  canonical: string,
  image: string,
  name: string,
): string {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    image: [image],
    url: canonical,
    itemCondition: 'https://schema.org/UsedCondition',
    ...(l.sku ? { sku: l.sku } : {}),
    ...(l.brand?.trim() ? { brand: { '@type': 'Brand', name: l.brand.trim() } } : {}),
    ...(l.size_type?.trim() || l.size?.trim()
      ? { size: (l.size_type?.trim() || l.size?.trim()) as string }
      : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      price: total.toFixed(2),
      priceCurrency: 'INR',
      itemCondition: 'https://schema.org/UsedCondition',
      availability: 'https://schema.org/InStock',
      inventoryLevel: { '@type': 'QuantitativeValue', value: 1 },
      ...(l.free_shipping ? {
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'INR' },
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
        },
      } : {}),
      seller: {
        '@type': 'Organization',
        '@id': 'https://www.zarketplace.com/#organisation',
        name: 'zarketplace',
        legalName: 'ADNIZ Private Limited',
      },
    },
  };
  // Escaped so a title containing "</script>" cannot break out of the block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function buildTags(l: PublicListing, total: number, canonical: string): string {
  const name = itemName(l.title, l.brand);
  const size = l.size_type?.trim() || l.size?.trim() || null;
  const title = itemMetaTitle(name, size);
  // A sentence for search results, and the price first for a shared link's
  // preview card, where it is what people want to see.
  const description = itemMetaDescription(name, size, l.condition, !!l.free_shipping);
  const cardBits: string[] = [];
  if (total > 0) cardBits.push(rupees(total));
  if (l.condition?.trim()) cardBits.push(`${l.condition.trim()} condition`);
  cardBits.push('Sold and shipped by zarketplace');
  const cardDescription = cardBits.join(' · ');
  const demo = isDemo(l);

  // Absolute URL required: scrapers do not resolve relative paths. The stored
  // image_url is already an absolute Supabase public URL.
  //
  // Prefer the 1200x630 JPEG social card the upload pipeline writes alongside
  // the cover photo. The photo itself is a 3:4 WebP: declaring 1.91:1 over it
  // makes scrapers crop the garment, and WhatsApp's preview renderer is
  // unreliable with WebP. Listings uploaded before the pipeline have no card,
  // so they fall back to the photo and omit the dimensions rather than lying
  // about them.
  const photo = l.image_url?.startsWith('http') ? l.image_url : FALLBACK_IMAGE;
  const card = socialCardUrl(photo);
  const image = card ?? photo;

  return [
    `<title>${escapeHtml(title)} | zarketplace</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="${demo ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="zarketplace" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(cardDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    ...(card || (image === FALLBACK_IMAGE && FALLBACK_IS_1200x630)
      ? [`<meta property="og:image:width" content="1200" />`,
         `<meta property="og:image:height" content="630" />`]
      : []),
    `<meta property="og:image:alt" content="${escapeHtml(name)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(cardDescription)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    ...(demo ? [] : [productJsonLd(l, total, canonical, image, name)]),
  ].join('\n    ');
}

// What the item page says, in plain HTML, for anything that reads the first
// response and does not run the app (the AI crawlers among them). Replaces
// the homepage's summary; a browser running the app never shows it.
function buildSummary(l: PublicListing, total: number): string {
  const name = itemName(l.title, l.brand);
  const size = l.size_type?.trim() || l.size?.trim() || null;
  const facts = [
    total > 0 ? rupees(total) : null,
    size ? `Size ${size}` : null,
    l.condition?.trim() ? `${l.condition.trim()} condition` : null,
    l.free_shipping ? 'Free delivery' : null,
  ].filter(Boolean).join('. ');
  const parts = [
    `<h1>${escapeHtml(itemMetaTitle(name, size))}</h1>`,
    facts ? `<p>${escapeHtml(facts)}.</p>` : '',
    l.description?.trim() ? `<p>${escapeHtml(l.description.trim())}</p>` : '',
    l.has_flaws && l.flaws_description?.trim() ? `<p>Flaw: ${escapeHtml(l.flaws_description.trim())}</p>` : '',
    '<p>Sold and shipped by zarketplace. Every item is checked at our hub against its listing before it ships, and every order is covered by Buyer Protection.</p>',
    '<p><a href="/">Shop more pre-owned clothing</a></p>',
  ];
  return `<!--seo:start--><noscript>${parts.join('')}</noscript><!--seo:end-->`;
}

// Every sitewide tag this function replaces. Anything left behind would be a
// duplicate, and scrapers pick unpredictably between duplicates.
const STRIP_RE =
  /[ \t]*<(?:title>[\s\S]*?<\/title|meta\s+(?:property="og:[^"]*"|name="(?:description|robots|twitter:[^"]*)")[^>]*\/?|link\s+rel="canonical"[^>]*\/?)>\n?/gi;
const SUMMARY_RE = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
const HERO_RE = /<!--static-hero:start-->[\s\S]*?<!--static-hero:end-->/;

export default async function handler(req: any, res: any) {
  const sku = String(req.query?.sku ?? '').trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'zarketplace.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  // The built shell, fetched from the static host rather than reconstructed,
  // so hashed asset filenames are always whatever this deployment produced.
  let html: string;
  try {
    const shell = await fetch(`${origin}/index.html`);
    if (!shell.ok) throw new Error(`shell ${shell.status}`);
    html = await shell.text();
  } catch {
    // Cannot serve a broken page: fall through to the SPA, which still works
    // for humans. Only the preview is lost.
    res.setHeader('Location', `/product/${encodeURIComponent(sku)}`);
    res.status(302).end();
    return;
  }

  let listing: PublicListing | undefined;
  if (sku) {
    // SKUs are stored uppercase (ZV-12345) but every link the app builds is
    // lowercased - ListingCard writes /item/${sku.toLowerCase()}. A
    // case-sensitive eq therefore matched nothing for any link the site
    // generated itself, so every shared item previewed as the sitewide
    // wordmark and this whole endpoint was dead on arrival. Uppercasing here
    // rather than using ilike keeps the lookup an exact match: ilike would
    // treat % and _ in a crafted URL as wildcards and could return an
    // unrelated listing.
    const rows = await pg<PublicListing>(
      `public_listings?sku=eq.${encodeURIComponent(sku.toUpperCase())}&select=id,sku,title,brand,size_type,size,condition,price,sale_price,image_url,shipping_category,free_shipping,description,has_flaws,flaws_description&limit=1`,
    );
    listing = rows[0];
  }

  if (listing) {
    // Lowercase, the form every link on the site uses: an uppercase canonical
    // pointed search engines at a URL the site itself never links to.
    const canonical = `${origin}/item/${encodeURIComponent((listing.sku ?? sku).toLowerCase())}`;
    const total = await checkoutTotal(listing);
    html = html
      .replace(STRIP_RE, '')
      .replace('</head>', `  ${buildTags(listing, total, canonical)}\n  </head>`)
      .replace(HERO_RE, '')
      .replace(SUMMARY_RE, buildSummary(listing, total));
    // Short shared cache: a scraper re-fetching after a price edit should not
    // see a week-old preview, but a link doing the rounds on WhatsApp should
    // not hit Postgres every time either.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  } else {
    // Unknown or unapproved SKU: serve the shell untouched with its sitewide
    // tags rather than inventing a preview for something that is not for sale.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
