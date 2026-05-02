import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { SlidersHorizontal, Loader2, X } from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORY_SIZES: Record<string, string[]> = {
  'Tops': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Outerwear': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Bottoms': ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  'Shoes': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
  'Accessories': ['One Size'],
  'Miscellaneous': ['One Size']
};

export function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);

  const categoryFilter = searchParams.get('category');
  const genderFilter = searchParams.get('gender');
  const sizeTypeFilter = searchParams.get('size_type');
  const conditionFilter = searchParams.get('condition');
  const brandFilter = searchParams.get('brand');
  const minPrice = searchParams.get('min_price');
  const maxPrice = searchParams.get('max_price');
  const searchQuery = searchParams.get('search');

  React.useEffect(() => {
    async function fetchListings() {
      setLoading(true);
      try {
        let query = supabase
          .from('listings')
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false });

        if (categoryFilter) query = query.eq('category', categoryFilter);
        if (genderFilter) query = query.eq('gender', genderFilter);
        if (sizeTypeFilter) query = query.eq('size_type', sizeTypeFilter);
        if (conditionFilter) query = query.eq('condition', conditionFilter);
        if (brandFilter) {
          if (brandFilter === 'Vintage/Unknown') {
            query = query.or('brand.eq.Vintage,brand.eq.Unknown,brand.is.null');
          } else {
            query = query.eq('brand', brandFilter);
          }
        }
        if (minPrice) query = query.gte('price', parseInt(minPrice));
        if (maxPrice) query = query.lte('price', parseInt(maxPrice));
        
        if (searchQuery) {
          query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        setListings(data || []);
      } catch (err: any) {
        console.error('Error fetching listings:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [categoryFilter, sizeTypeFilter, conditionFilter, brandFilter, minPrice, maxPrice, searchQuery]);

  const updateFilter = (key: string, value: string | null) => {
    if (value === null || value === 'all') {
      searchParams.delete(key);
    } else {
      searchParams.set(key, value);
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black/5 pb-8">
          <div className="flex flex-col gap-4">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-black/40">
              <button onClick={() => setSearchParams({})} className="hover:text-black transition-colors">Browse</button>
              {genderFilter && (
                <>
                  <span className="text-[8px]">→</span>
                  <button 
                    onClick={() => {
                      searchParams.delete('category');
                      setSearchParams(searchParams);
                    }} 
                    className={cn("hover:text-black transition-colors", !categoryFilter && "text-black")}
                  >
                    {genderFilter === 'Men' ? "Men's" : genderFilter === 'Women' ? "Women's" : genderFilter}
                  </button>
                </>
              )}
              {categoryFilter && (
                <>
                  <span className="text-[8px]">→</span>
                  <span className="text-black">{categoryFilter}</span>
                </>
              )}
            </div>

            <h1 className="text-5xl font-black tracking-tighter uppercase">
              {searchQuery ? `Search: ${searchQuery}` : (
                genderFilter ? (
                  categoryFilter ? `${genderFilter === 'Men' ? "Men's" : genderFilter === 'Women' ? "Women's" : genderFilter} → ${categoryFilter}` : `${genderFilter === 'Men' ? "Men's" : genderFilter === 'Women' ? "Women's" : genderFilter}`
                ) : (categoryFilter || 'BROWSE ALL')
              )}
            </h1>
          </div>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-3 border px-8 py-4 text-[11px] font-black uppercase tracking-widest transition-all",
              showFilters ? "bg-black text-white border-black" : "bg-white text-black border-black/10 hover:border-black"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Filters Sidebar */}
          {showFilters && (
            <aside className="w-full lg:w-64 flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Gender</h3>
                <div className="flex flex-wrap lg:flex-col gap-2">
                  {['all', 'Men', 'Women', 'Unisex'].map(g => (
                    <button 
                      key={g}
                      onClick={() => updateFilter('gender', g)}
                      className={cn(
                        "text-left text-xs font-bold uppercase tracking-widest py-1 transition-colors",
                        (genderFilter === g || (!genderFilter && g === 'all')) ? "text-black" : "text-black hover:text-black/80"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Category</h3>
                <div className="flex flex-wrap lg:flex-col gap-2">
                  {['all', 'Tops', 'Outerwear', 'Bottoms', 'Accessories', 'Shoes', 'Miscellaneous'].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => {
                        updateFilter('category', cat);
                        updateFilter('size_type', 'all');
                      }}
                      className={cn(
                        "text-left text-xs font-bold uppercase tracking-widest py-1 transition-colors",
                        (categoryFilter === cat || (!categoryFilter && cat === 'all')) ? "text-black" : "text-black hover:text-black/80"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Size</h3>
                <div className="flex flex-wrap lg:flex-col gap-2">
                  {['all', ...(categoryFilter && categoryFilter !== 'all' ? CATEGORY_SIZES[categoryFilter] || [] : ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'])].map(type => (
                    <button 
                      key={type}
                      onClick={() => updateFilter('size_type', type)}
                      className={cn(
                        "text-left text-xs font-bold uppercase tracking-widest py-1 transition-colors",
                        (sizeTypeFilter === type || (!sizeTypeFilter && type === 'all')) ? "text-black" : "text-black hover:text-black/80"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Condition</h3>
                <div className="flex flex-wrap lg:flex-col gap-2">
                  {['all', 'Pristine', 'Great', 'Good', 'Fair', 'As Is'].map(cond => (
                    <button 
                      key={cond}
                      onClick={() => updateFilter('condition', cond)}
                      className={cn(
                        "text-left text-xs font-bold uppercase tracking-widest py-1 transition-colors",
                        (conditionFilter === cond || (!conditionFilter && cond === 'all')) ? "text-black" : "text-black hover:text-black/80"
                      )}
                    >
                      {cond}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Brand</h3>
                <input 
                  type="text"
                  placeholder="Search brand..."
                  className="border-b border-black/10 py-2 text-xs focus:border-black outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') updateFilter('brand', (e.target as HTMLInputElement).value);
                  }}
                />
                <button 
                  onClick={() => updateFilter('brand', 'Vintage/Unknown')}
                  className={cn(
                    "text-left text-xs font-bold uppercase tracking-widest py-1 transition-colors",
                    brandFilter === 'Vintage/Unknown' ? "text-black" : "text-black hover:text-black/80"
                  )}
                >
                  Vintage / Unknown
                </button>
              </div>

              <button 
                onClick={() => setSearchParams({})}
                className="flex items-center justify-center gap-2 border border-black/10 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
              >
                <X className="h-3 w-3" /> Clear All
              </button>
            </aside>
          )}

          {/* Listings Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-black/20" />
              </div>
            ) : listings.length === 0 ? (
              <div className="flex h-96 flex-col items-center justify-center gap-6 border border-black/5 bg-zinc-50">
                <p className="text-sm font-bold text-black/30 uppercase tracking-[0.2em]">No items match your search</p>
                <button 
                  onClick={() => setSearchParams({})}
                  className="text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-12">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
