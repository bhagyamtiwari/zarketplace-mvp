// Every item on sale as a Google Merchant Center product feed:
// /merchant-feed.xml (see vercel.json). Add this URL in Merchant Center as a
// scheduled fetch and the items appear in free Shopping listings and in
// Google's product answers. Sold items drop out on the next fetch, because
// public_listings only ever holds items on sale.
//
// The price is what a buyer pays at checkout, worked out exactly as on the
// item page (api/item.ts checkoutTotal), so Google never sees two numbers.
// Demo items are left out. Every item is used and one of a kind.

const SITE = 'https://www.zarketplace.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

interface Row {
  id: string; sku: string | null; title: string | null; brand: string | null; description: string | null;
  price: number | null; sale_price: number | null; free_shipping: boolean | null; shipping_category: string | null;
  category: string | null; gender: string | null; size: string | null; size_type: string | null;
  condition: string | null; image_url: string | null; image_urls: string[] | null;
}

async function pg<T>(path: string): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

// Kept in step with itemName / itemSlug / itemPath in src/lib/pageMeta.ts,
// api/item.ts and api/sitemap-items.ts. Change all four together.
function itemName(title: string | null, brand: string | null): string {
  const t = (title ?? '').trim() || 'Item';
  const b = (brand ?? '').trim();
  return b && !t.toLowerCase().includes(b.toLowerCase()) ? `${b} ${t}` : t;
}
function itemSlug(title: string | null | undefined, brand: string | null | undefined): string {
  let s = itemName(title ?? null, brand ?? null)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 80) s = s.slice(0, 81).replace(/-[^-]*$/, '');
  return s;
}
function itemPath(l: { sku?: string | null; id?: string | null; title?: string | null; brand?: string | null }): string {
  if (!l.sku) return `/product/${l.id ?? ''}`;
  const slug = itemSlug(l.title, l.brand);
  return `/item/${slug ? `${l.sku.toLowerCase()}-${slug}` : l.sku.toLowerCase()}`;
}

function x(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Google's apparel taxonomy ids.
const GOOGLE_CATEGORY: Record<string, string> = {
  Tops: '212',          // Apparel & Accessories > Clothing > Shirts & Tops
  Bottoms: '204',       // Clothing > Pants
  Outerwear: '203',     // Clothing > Outerwear
  Shoes: '187',         // Apparel & Accessories > Shoes
  Accessories: '167',   // Apparel & Accessories > Clothing Accessories
};
const GENDER: Record<string, string> = { Men: 'male', Women: 'female', Unisex: 'unisex' };

export default async function handler(_req: any, res: any) {
  const [rows, cfgRows, rates] = await Promise.all([
    pg<Row>('public_listings?select=id,sku,title,brand,description,price,sale_price,free_shipping,shipping_category,category,gender,size,size_type,condition,image_url,image_urls&order=created_at.desc&limit=5000').catch(() => []),
    pg<{ buyer_protection_percent: number; buyer_protection_floor: number; buyer_protection_cap: number | null }>(
      'pricing_config?id=eq.1&select=buyer_protection_percent,buyer_protection_floor,buyer_protection_cap',
    ).catch(() => []),
    pg<{ key: string; rate: number }>('shipping_categories?select=key,rate').catch(() => []),
  ]);
  const cfg = cfgRows[0];
  const rate = new Map(rates.map((r) => [r.key, Number(r.rate ?? 0)]));

  const total = (l: Row): number => {
    const item = Number(l.sale_price ?? l.price ?? 0);
    if (!item) return 0;
    let fee = 0;
    if (cfg) {
      fee = Math.max(cfg.buyer_protection_floor, Math.round((cfg.buyer_protection_percent / 100) * item));
      if (cfg.buyer_protection_cap != null) fee = Math.min(cfg.buyer_protection_cap, fee);
    }
    const shipping = !l.free_shipping && l.shipping_category ? rate.get(l.shipping_category) ?? 0 : 0;
    return item + fee + shipping;
  };

  const items = rows
    .filter((l) => l.sku && l.image_url?.startsWith('http') && !/\(demo\)\s*$/i.test(l.title ?? '') && total(l) > 0)
    .map((l) => {
      const name = itemName(l.title, l.brand);
      const size = l.size_type?.trim() || l.size?.trim() || '';
      const title = `${name}${size ? `, size ${size}` : ''} (pre-owned)`.slice(0, 150);
      const description = (l.description?.trim()
        || `Pre-owned ${name}${size ? `, size ${size}` : ''}${l.condition ? `, in ${l.condition.toLowerCase()} condition` : ''}. Checked at our hub and sold and shipped by zarketplace.`).slice(0, 5000);
      const extra = (l.image_urls ?? []).filter((u) => u && u !== l.image_url && u.startsWith('http')).slice(0, 10);
      const ship = !l.free_shipping && l.shipping_category ? rate.get(l.shipping_category) ?? 0 : 0;
      const lines = [
        `<g:id>${x(l.sku!)}</g:id>`,
        `<g:title>${x(title)}</g:title>`,
        `<g:description>${x(description)}</g:description>`,
        `<g:link>${x(SITE + itemPath(l))}</g:link>`,
        `<g:image_link>${x(l.image_url!)}</g:image_link>`,
        ...extra.map((u) => `<g:additional_image_link>${x(u)}</g:additional_image_link>`),
        '<g:availability>in_stock</g:availability>',
        `<g:price>${total(l).toFixed(2)} INR</g:price>`,
        '<g:condition>used</g:condition>',
        l.brand?.trim() ? `<g:brand>${x(l.brand.trim())}</g:brand>` : '',
        '<g:identifier_exists>no</g:identifier_exists>',
        l.category && GOOGLE_CATEGORY[l.category] ? `<g:google_product_category>${GOOGLE_CATEGORY[l.category]}</g:google_product_category>` : '<g:google_product_category>166</g:google_product_category>',
        l.category ? `<g:product_type>${x(l.category)}</g:product_type>` : '',
        l.gender && GENDER[l.gender] ? `<g:gender>${GENDER[l.gender]}</g:gender>` : '',
        '<g:age_group>adult</g:age_group>',
        size ? `<g:size>${x(size)}</g:size>` : '',
        `<g:shipping><g:country>IN</g:country><g:price>${ship.toFixed(2)} INR</g:price></g:shipping>`,
      ].filter(Boolean);
      return `  <item>\n    ${lines.join('\n    ')}\n  </item>`;
    });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    '  <title>zarketplace</title>',
    `  <link>${SITE}</link>`,
    '  <description>Pre-owned clothing, sold and shipped by zarketplace.</description>',
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
