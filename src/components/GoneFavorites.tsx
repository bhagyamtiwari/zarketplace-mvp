import { Heart } from 'lucide-react';
import { variantUrl, variantSrcSet } from '../lib/images';
import { removeFavorite, type FavoriteSnapshot } from '../lib/favorites';
import { titleWithoutBrand } from './ListingCard';

// Favorites that have left the shop: sold, or taken off it. Every piece is one
// of a kind, so the favorites view says so plainly rather than letting a
// hearted item vanish without a word. Drawn from the snapshot taken when the
// item was hearted, since a sold item can no longer be looked up; not linked,
// because its page is gone too. The heart takes it off the list.
export function GoneFavorites({ items }: { items: FavoriteSnapshot[] }) {
  return (
    <section className="mt-12 flex flex-col gap-6 border-t border-black/10 pt-8" aria-labelledby="gone-heading">
      <div className="flex flex-col gap-1">
        <h2 id="gone-heading" className="text-[15px] font-bold">No longer available</h2>
        <p className="text-sm">These have sold or come off the site.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-10">
        {items.map((f) => (
          <div key={f.id} className="flex flex-col gap-3">
            <div className="relative aspect-[3/4] overflow-hidden bg-zinc-100">
              {f.image_url && (
                <img
                  src={variantUrl(f.image_url, 'grid')}
                  srcSet={variantSrcSet(f.image_url, ['thumb', 'grid'])}
                  sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover grayscale opacity-40"
                />
              )}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 opacity-60">
                <h3 className="line-clamp-2 text-sm leading-snug">
                  {f.brand ? (
                    <><span className="font-bold">{f.brand}</span> {titleWithoutBrand(f.title, f.brand)}</>
                  ) : (
                    <span className="font-bold">{f.title}</span>
                  )}
                </h3>
                <span className="mt-1 text-sm font-bold">No longer available</span>
              </div>
              <button
                type="button"
                onClick={() => removeFavorite(f.id)}
                aria-label="Remove from favorites"
                className="-mr-3 -mt-3 flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <Heart className="h-[18px] w-[18px] fill-black" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
