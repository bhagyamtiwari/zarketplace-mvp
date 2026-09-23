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

interface Row { sku: string | null; title: string | null; updated_at: string | null; created_at: string | null }

function xmlEscape(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default async function handler(_req: any, res: any) {
  let rows: Row[] = [];
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/public_listings?select=sku,title,updated_at,created_at&order=created_at.desc&limit=5000`,
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
      const loc = `${SITE}/item/${encodeURIComponent((l.sku as string).toLowerCase())}`;
      const when = (l.updated_at || l.created_at || '').slice(0, 10);
      return `  <url><loc>${xmlEscape(loc)}</loc>${when ? `<lastmod>${when}</lastmod>` : ''}</url>`;
    });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Items come and go daily; an hour is fresh enough for any crawler.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
