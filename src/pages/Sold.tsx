// Every piece that has sold. Each item is one of a kind, so this is the
// record of what has been through the shop: proof it moves, and a taste of
// what to watch for. Not linked: a sold item's page is gone.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabasePublic } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { variantUrl, variantSrcSet } from '../lib/images';
import { usePageMeta, META, isDemoTitle } from '../lib/pageMeta';
import { titleWithoutBrand } from '../components/ListingCard';
import { Loading, LoadError } from '../components/Loading';
import { ui } from '../lib/ui';

interface SoldItem {
  id: string; title: string; brand: string | null; price: number; sale_price: number | null;
  size_type: string | null; image_url: string; sold_at: string;
}

export function Sold() {
  usePageMeta(META.sold);
  const [items, setItems] = React.useState<SoldItem[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    supabasePublic.from('public_sold_listings').select('id, title, brand, price, sale_price, size_type, image_url, sold_at')
      .order('sold_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setFailed(true); return; }
        setItems(((data as SoldItem[]) ?? []).filter((i) => !isDemoTitle(i.title)));
      });
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>Sold</h1>
        <p className="text-sm">Every piece is one of a kind. These have found a new home. <Link to="/browse" className={ui.link}>See what is available now</Link>.</p>
      </div>
      {failed ? <LoadError message="We could not load sold items." className="min-h-[40vh]" />
        : items === null ? <Loading className="min-h-[40vh]" />
        : items.length === 0 ? <p className="text-sm">Nothing has sold yet.</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-10">
            {items.map((i) => (
              <div key={i.id} className="flex flex-col gap-3">
                <div className="relative aspect-[3/4] overflow-hidden bg-zinc-100">
                  <img src={variantUrl(i.image_url, 'grid')} srcSet={variantSrcSet(i.image_url, ['thumb', 'grid'])}
                    sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
                    alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <span className="absolute left-2 top-2 bg-black px-2 py-1 text-[11px] font-black uppercase tracking-widest text-white">Sold</span>
                </div>
                <div className="flex flex-col gap-0.5 text-sm">
                  <h3 className="line-clamp-2 leading-snug">
                    {i.brand ? <><span className="font-bold">{i.brand}</span> {titleWithoutBrand(i.title, i.brand)}</> : <span className="font-bold">{i.title}</span>}
                  </h3>
                  <span>{[i.size_type, formatCurrency(Number(i.sale_price ?? i.price))].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
