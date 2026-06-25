import React from 'react';
import { Link } from 'react-router-dom';
import { Listing } from '../types';
import { formatCurrency } from '../lib/utils';

interface ListingCardProps {
  listing: Listing;
}

export const ListingCard: React.FC<ListingCardProps> = ({ listing }) => {
  return (
    <Link to={listing.sku ? `/item/${listing.sku.toLowerCase()}` : `/product/${listing.id}`} className="group flex flex-col gap-4">
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-50 rounded-sm border border-black/5">
        <img
          src={listing.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=600'}
          alt={listing.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        />
        {listing.sale_price && (
          <div className="absolute top-4 left-4 bg-black px-3 py-1 text-[9px] font-black text-white uppercase tracking-[0.2em]">
            Sale
          </div>
        )}
        {listing.condition && (
          <div className="absolute bottom-4 left-4 bg-white/90 px-3 py-1 text-[9px] font-black text-black uppercase tracking-[0.2em]">
            {listing.condition}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
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
}
