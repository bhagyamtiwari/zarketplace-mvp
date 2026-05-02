import React from 'react';
import { Link } from 'react-router-dom';
import { Listing } from '../types';
import { formatCurrency } from '../lib/utils';

interface ListingCardProps {
  listing: Listing;
}

export const ListingCard: React.FC<ListingCardProps> = ({ listing }) => {
  return (
    <Link to={`/product/${listing.id}`} className="group flex flex-col gap-4">
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-50 rounded-sm border border-black/5">
        <img
          src={listing.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=600'}
          alt={listing.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        {listing.sale_price && (
          <div className="absolute top-4 left-4 bg-black px-3 py-1 text-[9px] font-black text-white uppercase tracking-[0.2em]">
            Sale
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-start gap-2">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black">{listing.brand}</span>
          <span className="text-[10px] font-black uppercase tracking-widest">{listing.size}</span>
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest truncate">{listing.title}</h3>
        <div className="mt-1 flex items-center gap-3">
          {listing.sale_price ? (
            <>
              <span className="text-xs font-black text-black">{formatCurrency(listing.sale_price)}</span>
              <span className="text-[10px] text-black line-through font-bold">{formatCurrency(listing.price)}</span>
            </>
          ) : (
            <span className="text-xs font-black">{formatCurrency(listing.price)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
