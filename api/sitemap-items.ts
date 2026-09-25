// Every item on sale, as a sitemap: /sitemap-items.xml (see vercel.json).
//
// The feed is drawn in the browser, so a crawler that reads only HTML never
// sees a link to a single item, and even one that runs the page only finds
// what the first screen of the feed loads. This lists them all, straight from
// public_listings (which only ever holds items that are on sale).
//
// Demo items are left out: they show how the shop looks and are never for
// sale, and their pages say noindex.

const SITE = 'https://www.zarketplace.com';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

interface Row {
  sku: string | null; title: string | null; brand: string | null; image_url: string | null;
  updated_at: string | null; created_at: string | null;
}

// Kept in step with itemName in src/lib/pageMeta.ts and api/item.ts.
function itemName(title: string | null, brand: string | null): string {
  const t = (title ?? '').trim() || 'Item';
  const b = (brand ?? '').trim();
  return b && !t.toLowerCase().includes(b.toLowerCase()) ? `${b} ${t}` : t;
}

// Item addresses: /item/zv-83374-levis-501-jeans. The same functions as
// itemSlug and itemPath in src/lib/pageMeta.ts and api/item.ts, duplicated
// because this file is bundled by Vercel, not by Vite. Change all three
// together.
function itemSlug(title: string | null | undefined, brand: string | null | undefined): string {
  let s = itemName(title ?? null, brand ?? null)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 80) s = s.slice(0, 81).replace(/-[^-]*$/, '');
  return s;
}

function itemPath(l: { sku?: string | null; id?: string | null; title?: string | null; brand?: string | null }): string {
  if (!l.sku) return `/product/${l.id ?? ''}`;
  const code = l.sku.toLowerCase();
  const slug = itemSlug(l.title, l.brand);
  return `/item/${slug ? `${code}-${slug}` : code}`;
}

function xmlEscape(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default async function handler(_req: any, res: any) {
  let rows: Row[] = [];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/public_listings?select=sku,title,brand,image_url,updated_at,created_at&order=created_at.desc&limit=5000`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
      );
      if (r.ok) rows = (await r.json()) as Row[];
    } catch {
      // An empty sitemap is valid; a failed one is not. Serve what we have.
    }
  }

  const urls = rows
    .filter((l) => l.sku && !/\(demo\)\s*$/i.test(l.title ?? ''))
    .map((l) => {
      const loc = `${SITE}${itemPath(l)}`;
      const when = (l.updated_at || l.created_at || '').slice(0, 10);
      // The cover photo, so image search can find the item as well.
      const image = l.image_url?.startsWith('http')
        ? `<image:image><image:loc>${xmlEscape(l.image_url)}</image:loc></image:image>`
        : '';
      return `  <url><loc>${xmlEscape(loc)}</loc>${when ? `<lastmod>${when}</lastmod>` : ''}${image}</url>`;
    });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Items come and go daily; an hour is fresh enough for any crawler.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
