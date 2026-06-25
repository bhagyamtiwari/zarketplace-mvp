import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { SlidersHorizontal, Loader2, X, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { log } from '../lib/log';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const blog = log('browse');

const CATEGORY_SIZES: Record<string, string[]> = {
  'Tops': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Bottoms': ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  'Outerwear': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Accessories': ['One Size'],
  'Shoes': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
};

export function Browse() {
  useDocumentTitle('Buy');

  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  const categoryFilter = searchParams.get('category');
  const genderFilter = searchParams.get('gender');
  const sizeTypeFilter = searchParams.get('size_type');
  const conditionFilter = searchParams.get('condition');
  const minPrice = searchParams.get('min_price');
  const maxPrice = searchParams.get('max_price');
  const searchQuery = searchParams.get('search');
  const sortBy = searchParams.get('sort') || 'newest';

  React.useEffect(() => {
    blog('useEffect fired', { categoryFilter, genderFilter, sizeTypeFilter, conditionFilter, minPrice, maxPrice, searchQuery });

    async function fetchListings() {
      const t = blog.time('fetchListings');
      setLoading(true);
      try {
        let query = supabase
          .from('listings')
          .select('*')
          .eq('status', 'approved')
          .or('is_sold.is.null,is_sold.eq.false');

        if (sortBy === 'price_low') {
          query = query.order('price', { ascending: true });
        } else if (sortBy === 'price_high') {
          query = query.order('price', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        if (categoryFilter) query = query.eq('category', categoryFilter);
        if (genderFilter) query = query.eq('gender', genderFilter);
        if (sizeTypeFilter) query = query.eq('size_type', sizeTypeFilter);
        if (conditionFilter) query = query.eq('condition', conditionFilter);
        if (minPrice) query = query.gte('price', parseInt(minPrice));
        if (maxPrice) query = query.lte('price', parseInt(maxPrice));

        if (searchQuery) {
          query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
        }

        const { data, error } = await query;
        t.end({ count: data?.length, error });
        if (error) throw error;
        setListings(data || []);
      } catch (err: any) {
        blog.error('fetchListings THREW', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [categoryFilter, genderFilter, sizeTypeFilter, conditionFilter, minPrice, maxPrice, searchQuery, sortBy]);

  const updateFilter = (key: string, value: string | null) => {
    if (value === null || value === 'all') {
      searchParams.delete(key);
    } else {
      searchParams.set(key, value);
    }
    setSearchParams(searchParams);
  };

  const GENDERS = ['Men', 'Women', 'Unisex'];
  const PRODUCT_TYPES = ['Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'];
  const SORT_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'newest', label: 'Newest' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
  ];
  const breadcrumbParts = [genderFilter, categoryFilter].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-20">
      <div className="flex flex-col gap-5">
        {searchQuery ? (
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-center">
            Search: {searchQuery}
          </h1>
        ) : breadcrumbParts.length > 0 ? (
          <h1 className="flex items-center justify-center gap-3 text-2xl sm:text-3xl font-black tracking-tight uppercase text-center">
            {breadcrumbParts.map((part, i) => (
              <React.Fragment key={part}>
                {i > 0 && <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-black/40" />}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </h1>
        ) : (
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase text-center">
            Available Now
          </h1>
        )}

        {/* Browsing controls: gender + type rows are tightly grouped; Filters sits beside gender row on desktop */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            {/* Gender row */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
              <button
                onClick={() => { searchParams.delete('gender'); setSearchParams(searchParams); }}
                className={cn(
                  "shrink-0 border px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors",
                  !genderFilter ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
                )}
              >
                All
              </button>
              {GENDERS.map((g) => (
                <button
                  key={g}
                  onClick={() => updateFilter('gender', g)}
                  className={cn(
                    "shrink-0 border px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors",
                    genderFilter === g ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Filters - shares the gender row on desktop, own row on mobile */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "hidden sm:flex shrink-0 items-center gap-2 border px-5 py-3 text-[11px] font-black uppercase tracking-widest transition-all",
                showFilters ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
            </button>
          </div>

          {/* Product type row */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <button
              onClick={() => { searchParams.delete('category'); searchParams.delete('size_type'); setSearchParams(searchParams); }}
              className={cn(
                "shrink-0 border px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors",
                !categoryFilter ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
              )}
            >
              All
            </button>
            {PRODUCT_TYPES.map(cat => (
              <button
                key={cat}
                onClick={() => { updateFilter('category', cat); updateFilter('size_type', 'all'); }}
                className={cn(
                  "shrink-0 border px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors",
                  categoryFilter === cat ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Filters - mobile-only own row, below both pill rows */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "sm:hidden flex items-center justify-center gap-2 border px-5 py-3 text-[11px] font-black uppercase tracking-widest transition-all",
              showFilters ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
          </button>
        </div>

        {/* Expanded filters panel, full width, stacks on mobile */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 p-6 bg-zinc-50 border border-black/5 mt-1 border-t-0">
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Sort</h3>
              <div className="flex flex-col gap-2">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateFilter('sort', opt.value === 'newest' ? null : opt.value)}
                    className={cn(
                      "text-left text-xs font-bold uppercase tracking-widest py-0.5 transition-colors",
                      sortBy === opt.value ? "text-black underline" : "text-black/60 hover:text-black"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Size</h3>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {['all', ...(categoryFilter && categoryFilter !== 'all' ? CATEGORY_SIZES[categoryFilter] || [] : ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'])].map(type => (
                  <button
                    key={type}
                    onClick={() => updateFilter('size_type', type)}
                    className={cn(
                      "text-left text-xs font-bold uppercase tracking-widest py-0.5 transition-colors",
                      (sizeTypeFilter === type || (!sizeTypeFilter && type === 'all')) ? "text-black underline" : "text-black/60 hover:text-black"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Condition</h3>
              <div className="flex flex-col gap-2">
                {['all', 'Pristine', 'Great', 'Good', 'Fair', 'As Is'].map(cond => (
                  <button
                    key={cond}
                    onClick={() => updateFilter('condition', cond)}
                    className={cn(
                      "text-left text-xs font-bold uppercase tracking-widest py-0.5 transition-colors",
                      (conditionFilter === cond || (!conditionFilter && cond === 'all')) ? "text-black underline" : "text-black/60 hover:text-black"
                    )}
                  >
                    {cond}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 items-start">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Reset</h3>
              <button
                onClick={() => setSearchParams({})}
                className="flex items-center justify-center gap-2 border border-black/10 py-3 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
              >
                <X className="h-3 w-3" /> Clear All
              </button>
            </div>
          </div>
        )}

        {/* Listings Grid */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-black/20" />
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            action={
              <button
                onClick={() => setSearchParams({})}
                className="text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1"
              >
                Reset Filters
              </button>
            }
          >
            No items match your search
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-12 mt-2">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
