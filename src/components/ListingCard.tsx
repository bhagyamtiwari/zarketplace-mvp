import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Zap } from 'lucide-react';
import { Listing } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { variantUrl, variantSrcSet } from '../lib/images';
import { toggleFavorite, useFavorites } from '../lib/favorites';

interface ListingCardProps {
  listing: Listing;
  /** First row of the feed: load immediately instead of lazily. On a phone the
      grid is the largest thing on screen, so these images are the LCP. */
  priority?: boolean;
}

/**
 * The title with the brand taken off the front, because the card sets the
 * brand in bold at the start of the name itself. Without this, "Carhartt WIP"
 * then "Carhartt WIP Michigan Chore Coat" read the brand twice.
 */
export function titleWithoutBrand(title: string, brand: string | null | undefined): string {
  if (!brand) return title;
  const b = brand.trim();
  if (b && title.toLowerCase().startsWith(b.toLowerCase())) {
    const rest = title.slice(b.length).replace(/^[\s,:\-–]+/, '');
    if (rest) return rest;
  }
  return title;
}

// A card is a photograph and a few lines of type, nothing laid over the photo.
//
//   **Brand** name of the item      up to two lines
//   Price                  Size     bold price, plain size
//
// Status is said in words in that stack rather than as stickers on the
// picture: a sale is the red price, Instant Ship is a line of its own, sold
// is the grey photo and "Sold" where the price was. On a pointer device the
// second photo fades in on hover, loaded only once someone actually hovers.
export const ListingCard: React.FC<ListingCardProps> = ({ listing, priority = false }) => {
  const favorites = useFavorites();
  const favorited = favorites.has(listing.id);
  const sold = !!listing.is_sold;
  const second = listing.image_urls?.find((u) => u && u !== listing.image_url) ?? null;
  const [showSecond, setShowSecond] = React.useState(false);

  const onHeart = (e: React.MouseEvent) => {
    // The whole card is a link; saving must not navigate.
    e.preventDefault();
    e.stopPropagation();
    if (sold) return;
    toggleFavorite(listing.id);
  };

  const size = listing.size_type || listing.size;

  return (
    <Link
      to={listing.sku ? `/item/${listing.sku.toLowerCase()}` : `/product/${listing.id}`}
      onMouseEnter={() => { if (second && !sold) setShowSecond(true); }}
      className="group flex flex-col gap-3"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-100">
        <img
          src={variantUrl(listing.image_url, 'grid') || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=600'}
          srcSet={variantSrcSet(listing.image_url, ['thumb', 'grid'])}
          alt={listing.title}
          className={cn('h-full w-full object-cover', sold && 'grayscale opacity-40')}
          referrerPolicy="no-referrer"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        />
        {showSecond && second && (
          <img
            src={variantUrl(second, 'grid')}
            srcSet={variantSrcSet(second, ['thumb', 'grid'])}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            referrerPolicy="no-referrer"
            decoding="async"
            sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          />
        )}
      </div>

      <div className={cn('flex items-start gap-2', sold && 'opacity-50')}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The item's name, with its brand in bold as the first words of
              it, rather than the brand on a line of its own: a grid led by a
              column of brand names reads as a list of logos. */}
          <h3 className="line-clamp-2 text-sm leading-snug">
            {listing.brand ? (
              <>
                <span className="font-bold">{listing.brand}</span>{' '}
                {titleWithoutBrand(listing.title, listing.brand)}
              </>
            ) : (
              <span className="font-bold">{listing.title}</span>
            )}
          </h3>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            {sold ? (
              <span className="text-sm font-bold">Sold</span>
            ) : listing.sale_price ? (
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-red-600">{formatCurrency(listing.sale_price)}</span>
                <span className="text-sm line-through">{formatCurrency(listing.price)}</span>
              </span>
            ) : (
              <span className="text-sm font-bold">{formatCurrency(listing.price)}</span>
            )}
            {size && <span className="shrink-0 text-sm">{size}</span>}
          </div>
          {/* The same mark as the sign on the item page, so the two read as
              one thing. */}
          {listing.is_verified && !sold && (
            <span className="flex items-center gap-1 text-sm">
              <Zap aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Instant Ship
            </span>
          )}
        </div>

        {/* Beside the type rather than floating on the photo. Negative margin
            keeps a 44px target without pushing the text around. */}
        <button
          type="button"
          onClick={onHeart}
          disabled={sold}
          aria-label={favorited ? 'Remove from saved' : 'Save'}
          aria-pressed={favorited}
          className={cn('-mr-3 -mt-3 flex h-11 w-11 shrink-0 items-center justify-center', sold && 'cursor-default')}
        >
          <Heart className={cn('h-[18px] w-[18px]', favorited && 'fill-black')} strokeWidth={1.75} />
        </button>
      </div>
    </Link>
  );
};
