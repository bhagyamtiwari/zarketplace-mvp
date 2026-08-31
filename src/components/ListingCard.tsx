import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Truck, MapPin } from 'lucide-react';
import { Listing } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { variantUrl, variantSrcSet } from '../lib/images';
import { toggleFavorite, useFavorites } from '../lib/favorites';
import { useBuyerState } from '../lib/buyerState';
import { sameState } from '../lib/states';

interface ListingCardProps {
  listing: Listing;
  /** First row of the feed: load immediately instead of lazily. On a phone the
      grid is the largest thing on screen, so these images are the LCP. */
  priority?: boolean;
}

// A card has to answer brand / condition / size / price / trust / favorite
// state in about a second, so everything here is a glance-level signal. Sold
// items stay in the feed, greyed: seeing inventory move is what makes a young
// feed feel alive.
export const ListingCard: React.FC<ListingCardProps> = ({ listing, priority = false }) => {
  const favorites = useFavorites();
  const favorited = favorites.has(listing.id);
  const sold = !!listing.is_sold;

  // Our delivery coverage does not reach every state yet, so a card has to
  // say whether this item is actually buyable from where the visitor is. Only
  // ever a note, never a hidden card: a buyer who cannot check out today still
  // deserves to see that we have what they want.
  const [buyerState] = useBuyerState();
  // Only ever used to work out whether we can deliver to this buyer. It is
  // never shown: where an item came from is ours, not the buyer's business.
  const shipsFrom = listing.pickup_state ?? null;
  const outOfState = !!buyerState && !!shipsFrom && !sameState(buyerState, shipsFrom);

  const onHeart = (e: React.MouseEvent) => {
    // The whole card is a link; hearting must not navigate.
    e.preventDefault();
    e.stopPropagation();
    if (sold) return;
    toggleFavorite(listing.id);
  };

  return (
    <Link
      to={listing.sku ? `/item/${listing.sku.toLowerCase()}` : `/product/${listing.id}`}
      className="group flex flex-col gap-3"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-50 rounded-sm border border-black/5">
        <img
          src={variantUrl(listing.image_url, 'grid') || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=600'}
          srcSet={variantSrcSet(listing.image_url, ['thumb', 'grid'])}
          alt={listing.title}
          className={cn(
            'h-full w-full object-cover transition-transform duration-700 group-hover:scale-105',
            sold && 'grayscale opacity-40',
          )}
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

        <button
          type="button"
          onClick={onHeart}
          disabled={sold}
          aria-label={favorited ? 'Remove from favorites' : 'Save to favorites'}
          aria-pressed={favorited}
          className={cn(
            'absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm transition-transform',
            sold ? 'opacity-40 cursor-default' : 'hover:scale-110 active:scale-95',
          )}
        >
          <Heart className={cn('h-4 w-4', favorited ? 'fill-black text-black' : 'text-black/60')} />
        </button>

        {sold ? (
          <div className="absolute top-2 left-2 bg-black px-3 py-1 text-[9px] font-black text-white uppercase tracking-[0.2em]">
            Sold
          </div>
        ) : listing.sale_price ? (
          <div className="absolute top-2 left-2 bg-black px-3 py-1 text-[9px] font-black text-white uppercase tracking-[0.2em]">
            Sale
          </div>
        ) : null}

        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
          {listing.condition && (
            <span className="bg-white/90 px-2.5 py-1 text-[9px] font-black text-black uppercase tracking-[0.15em]">
              {listing.condition}
            </span>
          )}
          {listing.free_shipping && !sold && (
            <span className="flex items-center gap-1 bg-white/90 px-2.5 py-1 text-[9px] font-black text-black uppercase tracking-[0.15em]">
              <Truck className="h-3 w-3" /> Free ship
            </span>
          )}
          {outOfState && !sold && (
            <span className="flex items-center gap-1 bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-amber-900">
              <MapPin className="h-3 w-3" /> Not delivering to you yet
            </span>
          )}
        </div>
      </div>

      <div className={cn('flex flex-col gap-1.5', sold && 'opacity-50')}>
        <h3 className="text-xs font-bold uppercase tracking-widest leading-tight line-clamp-2">{listing.title}</h3>

        <div className="flex items-center gap-2">
          {listing.sale_price ? (
            <>
              <span className="text-base font-black text-black">{formatCurrency(listing.sale_price)}</span>
              <span className="text-[10px] text-black/40 line-through font-bold">{formatCurrency(listing.price)}</span>
            </>
          ) : (
            <span className="text-base font-black text-black">{formatCurrency(listing.price)}</span>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">
          <span className="truncate max-w-[65%]">{listing.brand || 'Vintage'}</span>
          {(listing.size_type || listing.size) && <span className="shrink-0">{listing.size_type || listing.size}</span>}
        </div>
      </div>
    </Link>
  );
};
