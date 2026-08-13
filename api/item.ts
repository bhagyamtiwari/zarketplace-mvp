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
const FALLBACK_IMAGE = 'https://www.zarketplace.com/images/wordmark-modified.png';

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

function buildTags(l: PublicListing, total: number, canonical: string): string {
  const name = l.title?.trim() || 'Item';
  const parts = [name];
  if (l.brand?.trim()) parts.push(l.brand.trim());
  const size = l.size_type?.trim() || l.size?.trim();
  if (size) parts.push(`Size ${size}`);
  const title = parts.join(' - ');

  const descBits: string[] = [];
  if (total > 0) descBits.push(rupees(total));
  if (l.condition?.trim()) descBits.push(l.condition.trim());
  descBits.push('Buyer protection included');
  const description = descBits.join(' · ');

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
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="zarketplace" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    ...(card
      ? [`<meta property="og:image:width" content="1200" />`,
         `<meta property="og:image:height" content="630" />`]
      : []),
    `<meta property="og:image:alt" content="${escapeHtml(name)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
  ].join('\n    ');
}

// Every sitewide tag this function replaces. Anything left behind would be a
// duplicate, and scrapers pick unpredictably between duplicates.
const STRIP_RE =
  /[ \t]*<(?:title>[\s\S]*?<\/title|meta\s+(?:property="og:[^"]*"|name="(?:description|twitter:[^"]*)")[^>]*\/?|link\s+rel="canonical"[^>]*\/?)>\n?/gi;

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
      `public_listings?sku=eq.${encodeURIComponent(sku.toUpperCase())}&select=id,sku,title,brand,size_type,size,condition,price,sale_price,image_url,shipping_category,free_shipping&limit=1`,
    );
    listing = rows[0];
  }

  if (listing) {
    const canonical = `${origin}/item/${encodeURIComponent(listing.sku ?? sku)}`;
    const total = await checkoutTotal(listing);
    html = html.replace(STRIP_RE, '').replace('</head>', `  ${buildTags(listing, total, canonical)}\n  </head>`);
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
