// The marketplace feed. This is both "/" and "/browse" - there is no separate
// landing page, because a homepage that explains the marketplace instead of
// being the marketplace costs us the visitor who arrived from an Instagram
// story. A dismissible intro banner sits on top for first-time visitors; below
// it the page is search, filters and real inventory, and nothing else.
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Plus, Loader2, Heart, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { EmptyState } from '../components/EmptyState';
import { CampaignBand } from '../components/CampaignBand';
import { cn } from '../lib/utils';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useFavorites } from '../lib/favorites';
import { CONDITIONS } from '../lib/condition';

const mlog = log('marketplace');

const PAGE_SIZE = 24;



interface ToggleProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

// Neutralize PostgREST-significant characters before interpolating a user search
// term into a `.or(...)` filter string. Strips comma, parens, star, colon, and
// backslash (which reshape the filter), collapses whitespace, and caps length.
function sanitizeSearch(q: string): string {
  return q
    .replace(/[,()*:\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

const GENDERS = ['Men', 'Women', 'Unisex'];
const PRODUCT_TYPES = ['Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'];

const CATEGORY_SIZES: Record<string, string[]> = {
  Tops: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  Bottoms: ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  Outerwear: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  Accessories: ['One Size'],
  Shoes: ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
};

const ALL_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'];

// Discovery chips. These are shortcuts into the same filter surface, not
// marketing sections - each one is a query anyone could have built by hand.
const QUICK_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'new_today', label: 'New today' },
  { value: 'under_999', label: 'Under Rs. 999' },
  { value: 'free_shipping', label: 'Free shipping' },
  { value: 'sale', label: 'On sale' },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
];

// Mirrors the server-side filters for the dev-only sample rows. Dev build only;
// delete alongside src/lib/devListings.ts.
function applyDevFilters(
  rows: Listing[],
  f: {
    category: string | null; gender: string | null; sizeType: string | null;
    condition: string | null; quick: string | null; sortBy: string;
  },
): Listing[] {
  let out = rows.filter((l) => {
    if (f.category && l.category !== f.category) return false;
    if (f.gender && l.gender !== f.gender) return false;
    if (f.sizeType && l.size_type !== f.sizeType) return false;
    if (f.condition && l.condition !== f.condition) return false;
    if (f.quick === 'new_today') return Date.now() - Date.parse(l.created_at) < 24 * 60 * 60 * 1000;
    if (f.quick === 'under_999') return l.price <= 999;
    if (f.quick === 'free_shipping') return l.free_shipping;
    if (f.quick === 'sale') return l.sale_price !== null;
    return true;
  });
  if (f.sortBy === 'price_low') out = [...out].sort((a, b) => a.price - b.price);
  else if (f.sortBy === 'price_high') out = [...out].sort((a, b) => b.price - a.price);
  return out;
}

export function Marketplace() {
  useDocumentTitle('Buy & sell pre-owned fashion');

  const [searchParams, setSearchParams] = useSearchParams();
  const favorites = useFavorites();

  const category = searchParams.get('category');
  const gender = searchParams.get('gender');
  const sizeType = searchParams.get('size_type');
  const condition = searchParams.get('condition');
  const quick = searchParams.get('q');
  const searchQuery = searchParams.get('search') ?? '';
  const sortBy = searchParams.get('sort') || 'newest';

  const [listings, setListings] = React.useState<Listing[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [page, setPage] = React.useState(0);
  const [state, setState] = React.useState<'loading' | 'paging' | 'ready' | 'error'>('loading');
  const [showFilters, setShowFilters] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  // Search box is local so typing stays instant; the URL (the source of truth
  // for every other filter) catches up on a debounce.
  const [searchInput, setSearchInput] = React.useState(searchQuery);
  React.useEffect(() => { setSearchInput(searchQuery); }, [searchQuery]);

  // Read at fetch time rather than tracked as a dependency: un-hearting an item
  // while looking at the Saved view should not yank the card out from under the
  // cursor, so the list stays as-fetched until the user changes something.
  const favoritesRef = React.useRef(favorites);
  favoritesRef.current = favorites;

  const filterKey = [category, gender, sizeType, condition, quick, searchQuery, sortBy].join('|');

  // Any filter change starts a fresh feed rather than appending to the old one.
  React.useEffect(() => { setPage(0); }, [filterKey]);

  React.useEffect(() => {
    let cancelled = false;
    const t = mlog.time('fetchPage');
    setState(page === 0 ? 'loading' : 'paging');

    async function fetchPage() {
      try {
        let query = supabase
          .from('public_listings')
          .select('*', page === 0 ? { count: 'exact' } : {})
          .eq('status', 'approved')
          // Sold stock never reaches the buyer. Scrolling past things you cannot
          // buy is the single most irritating thing a resale feed can do, so the
          // moment an item sells it leaves the grid.
          .or('is_sold.is.null,is_sold.eq.false');

        if (sortBy === 'price_low') query = query.order('price', { ascending: true });
        else if (sortBy === 'price_high') query = query.order('price', { ascending: false });
        else query = query.order('created_at', { ascending: false });
        // Stable tiebreaker: without it, rows sharing a price can shift between
        // pages and the feed shows duplicates or silently skips items.
        query = query.order('id', { ascending: false });

        if (category) query = query.eq('category', category);
        if (gender) query = query.eq('gender', gender);
        if (sizeType) query = query.eq('size_type', sizeType);
        if (condition) query = query.eq('condition', condition);

        if (quick === 'new_today') {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          query = query.gte('created_at', since);
        } else if (quick === 'under_999') {
          query = query.lte('price', 999);
        } else if (quick === 'free_shipping') {
          query = query.eq('free_shipping', true);
        } else if (quick === 'sale') {
          query = query.not('sale_price', 'is', null);
        } else if (quick === 'saved') {
          const ids = [...favoritesRef.current];
          if (ids.length === 0) {
            // `.in('id', [])` is a valid query that returns nothing, but short
            // -circuiting keeps an empty Saved view off the network entirely.
            setListings([]);
            setTotal(0);
            setState('ready');
            return;
          }
          query = query.in('id', ids);
        }

        const safe = sanitizeSearch(searchQuery);
        if (safe) {
          query = query.or(
            `title.ilike.%${safe}%,description.ilike.%${safe}%,brand.ilike.%${safe}%,category.ilike.%${safe}%`,
          );
        }

        const from = page * PAGE_SIZE;
        const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
        if (cancelled) return;
        t.end({ count: data?.length, error });
        if (error) throw error;

        let rows = data ?? [];
        let totalCount = count ?? rows.length;

        // Local development with an empty catalogue: fall back to sample rows so
        // the feed can actually be looked at. Never runs in a production build,
        // and real data always wins the moment a single listing exists.
        // Imported dynamically, not statically: with DEV compiled to false the
        // whole branch is eliminated and the sample data never reaches the
        // production bundle at all.
        if (import.meta.env.DEV && page === 0 && rows.length === 0 && !searchQuery) {
          const { devListings } = await import('../lib/devListings');
          rows = applyDevFilters(devListings, { category, gender, sizeType, condition, quick, sortBy });
          totalCount = rows.length;
        }

        setListings((prev) => (page === 0 ? rows : [...prev, ...rows]));
        if (page === 0) setTotal(totalCount);
        // A short page means we've reached the end; remember it via total.
        if (rows.length < PAGE_SIZE) setTotal(from + rows.length);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        mlog.warn('fetchPage failed', err);
        setState('error');
      }
    }

    fetchPage();
    return () => { cancelled = true; };
  }, [filterKey, page, reloadKey]);

  const hasMore = total !== null && listings.length < total;

  // Infinite scroll: load the next page as the sentinel comes into view.
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || state === 'loading' || state === 'paging') return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setPage((p) => p + 1); },
      { rootMargin: '600px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, state]);

  // Applies every change in one pass. Two separate setParam calls inside one
  // handler would both build from the same render's searchParams, so the second
  // silently discarded the first - which is how picking a category used to do
  // nothing at all.
  const setParams = (changes: Array<[string, string | null]>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of changes) {
      if (value === null || value === 'all') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const setParam = (key: string, value: string | null) => setParams([[key, value]]);

  // Choosing a category resets size: "UK 9" means nothing once you switch from
  // Shoes to Tops.
  const selectCategory = (value: string | null) => setParams([['category', value], ['size_type', null]]);

  const toggleParam = (key: string, value: string) => {
    setParam(key, searchParams.get(key) === value ? null : value);
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setParam('search', searchInput.trim() || null);
  };

  const activeFilterCount = [category, gender, sizeType, condition, quick].filter(Boolean).length;
  const clearAll = () => setSearchParams({}, { replace: true });

  return (
    <div className="flex flex-col pt-20">
      {/* First-visit explainer, dismissible. It sits above the controls so a
          newcomer gets the pitch, and closes permanently so a returning buyer
          gets the marketplace. */}
      <HeroBanner />

      {/* Sticky control deck: search + chips. Sits directly under the fixed
          navbar so the user is never more than one tap from filtering. */}
      <div className="sticky top-20 z-30 border-b border-black/5 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-3">
          <form onSubmit={onSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search brands, items, sizes"
              aria-label="Search listings"
              className="w-full border border-black/10 bg-zinc-50 py-3 pl-11 pr-4 text-xs font-bold uppercase tracking-widest placeholder:text-black/30 focus:border-black focus:outline-none"
            />
          </form>

          {/* Two groups: who you are shopping for on the left, what you are in
              the mood for on the right. On a phone each group keeps its own
              swipeable row rather than merging into one long strip nobody
              scrolls to the end of. */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
              <Chip active={!gender && !quick && !category} onClick={clearAll}>All</Chip>
              {GENDERS.map((g) => (
                <Chip key={g} active={gender === g} onClick={() => toggleParam('gender', g)}>{g}</Chip>
              ))}
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="lg:hidden shrink-0 flex items-center gap-2 border border-black bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-widest"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0 lg:justify-end">
              {QUICK_CHIPS.map((c) => (
                <Chip key={c.value} active={quick === c.value} onClick={() => toggleParam('q', c.value)}>
                  {c.label}
                </Chip>
              ))}
              {favorites.size > 0 && (
                <Chip active={quick === 'saved'} onClick={() => toggleParam('q', 'saved')}>
                  <span className="flex items-center gap-1.5">
                    <Heart className={cn('h-3 w-3', quick === 'saved' ? 'fill-white' : 'fill-black')} />
                    Saved {favorites.size}
                  </span>
                </Chip>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 pb-12 pt-4 flex gap-10">
        {/* Desktop filter rail. Persistent because once the screen is wide
            enough, horizontal chips are a mobile compromise. */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-56 flex flex-col gap-2 pb-10">
            {/* Category and condition are how people actually narrow a resale
                feed. Size is the long list, so it stays folded until asked for
                rather than filling the rail with eighteen dead options. */}
            <FilterGroup title="Category" defaultOpen summary={category ?? 'All'}>
              <FilterOption active={!category} onClick={() => selectCategory(null)}>All</FilterOption>
              {PRODUCT_TYPES.map((c) => (
                <FilterOption key={c} active={category === c} onClick={() => selectCategory(c)}>{c}</FilterOption>
              ))}
            </FilterGroup>

            <FilterGroup title="Condition" defaultOpen summary={condition ?? 'Any'}>
              <FilterOption active={!condition} onClick={() => setParam('condition', null)}>Any</FilterOption>
              {CONDITIONS.map((c) => (
                <FilterOption key={c.name} active={condition === c.name} onClick={() => setParam('condition', c.name)}>{c.name}</FilterOption>
              ))}
            </FilterGroup>

            <FilterGroup title="Size" defaultOpen={!!sizeType} summary={sizeType ?? 'Any'}>
              <FilterOption active={!sizeType} onClick={() => setParam('size_type', null)}>Any</FilterOption>
              {(category ? CATEGORY_SIZES[category] ?? ALL_SIZES : ALL_SIZES).map((s) => (
                <FilterOption key={s} active={sizeType === s} onClick={() => setParam('size_type', s)}>{s}</FilterOption>
              ))}
            </FilterGroup>

            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-2 self-start border border-black/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
              >
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col gap-4">
          {/* Result count and sort, as a single quiet line of text. */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-black/40">
              {state === 'loading' ? 'Loading' : `${total ?? listings.length} item${(total ?? listings.length) === 1 ? '' : 's'}`}
            </p>
            <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-black/40">
              Sort
              <select
                value={sortBy}
                onChange={(e) => setParam('sort', e.target.value === 'newest' ? null : e.target.value)}
                className="bg-transparent text-black uppercase tracking-[0.2em] underline underline-offset-4 focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          {state === 'error' && listings.length === 0 ? (
            /* A failed fetch must never look like an empty catalogue. */
            <div className="border border-black/10 bg-zinc-50 p-8 flex flex-col items-start gap-4">
              <p className="text-xs font-bold uppercase tracking-widest text-black/60">
                We could not load listings just now.
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800"
              >
                Try again
              </button>
            </div>
          ) : state === 'loading' ? (
            <FeedGrid>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-zinc-50 animate-pulse border border-black/5" />
              ))}
            </FeedGrid>
          ) : listings.length === 0 ? (
            <EmptyState
              action={
                <Link to="/sell" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white">
                  List an item
                </Link>
              }
            >
              {quick === 'saved'
                ? 'Nothing saved yet'
                : activeFilterCount > 0 || searchQuery
                  ? 'No items match these filters'
                  : 'Nothing listed yet'}
            </EmptyState>
          ) : (
            <>
              <FeedGrid>
                {listings.map((listing, i) => (
                  <React.Fragment key={listing.id}>
                    <ListingCard listing={listing} priority={i < 4} />
                    {/* One contextual sell prompt, deep enough in the feed that
                        it reaches someone who is browsing rather than someone
                        who just landed. */}
                    {i === 15 && <SellTile />}
                  </React.Fragment>
                ))}
              </FeedGrid>

              <div ref={sentinelRef} className="h-10" />
              {state === 'paging' ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-black/20" />
                </div>
              ) : hasMore ? (
                // Explicit fallback for the auto-loader. IntersectionObserver is
                // silently unavailable in some embedded webviews, and a feed that
                // simply stops at item 24 with no way forward is worse than one
                // extra tap.
                <div className="flex justify-center py-6">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="border border-black px-10 py-4 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
                  >
                    Browse all listings
                  </button>
                </div>
              ) : (
                <p className="py-8 text-center text-[10px] font-black uppercase tracking-[0.3em] text-black/20">
                  You have seen everything listed
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {showFilters && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="relative max-h-[80vh] overflow-y-auto bg-white border-t border-black/10 p-6 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Filters</h2>
              <button onClick={() => setShowFilters(false)} aria-label="Close filters" className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <SheetGroup title="Category">
              <SheetChip active={!category} onClick={() => selectCategory(null)}>All</SheetChip>
              {PRODUCT_TYPES.map((c) => (
                <SheetChip key={c} active={category === c} onClick={() => selectCategory(c)}>{c}</SheetChip>
              ))}
            </SheetGroup>

            <SheetGroup title="Condition">
              <SheetChip active={!condition} onClick={() => setParam('condition', null)}>Any</SheetChip>
              {CONDITIONS.map((c) => (
                <SheetChip key={c.name} active={condition === c.name} onClick={() => setParam('condition', c.name)}>{c.name}</SheetChip>
              ))}
            </SheetGroup>

            {/* Folded by default: the size list is long, and on a phone it
                pushes everything else off the sheet. */}
            <SheetGroup title="Size" collapsible defaultOpen={!!sizeType} summary={sizeType ?? 'Any'}>
              <SheetChip active={!sizeType} onClick={() => setParam('size_type', null)}>Any</SheetChip>
              {(category ? CATEGORY_SIZES[category] ?? ALL_SIZES : ALL_SIZES).map((s) => (
                <SheetChip key={s} active={sizeType === s} onClick={() => setParam('size_type', s)}>{s}</SheetChip>
              ))}
            </SheetGroup>

            <div className="flex gap-3 sticky bottom-0 bg-white pt-2">
              <button
                onClick={clearAll}
                className="flex-1 border border-black/10 py-4 text-[11px] font-black uppercase tracking-widest"
              >
                Clear all
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 bg-black py-4 text-[11px] font-black uppercase tracking-widest text-white"
              >
                Show {total ?? listings.length} items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The same three bands the About page opens with, closing the feed.
          Full-bleed and flush: no gutters between them, no padding around the
          group, so they read as one block rather than three cards. */}
      <div className="flex flex-col">
        <CampaignBand
          image="/images/resale-web.jpg"
          heading="Good clothes deserve"
          script="another life."
          body="Resellers, Instagram thrift stores and everyday sellers, all in one place."
          cta={{ label: 'What is zarketplace', to: '/about' }}
        />
        <CampaignBand
          image="/images/red2-web.jpg"
          heading="F*ck fast fashion!"
          script="sell ur thrifted finds here."
          body="List free, keep 100% of your asking price, and we handle the pickup."
          cta={{ label: 'Start selling now', to: '/sell' }}
          align="right"
        />
        <CampaignBand
          image="/images/boots-web.jpg"
          heading="Reduce waste,"
          script="buy pre-loved."
          body="Keep clothes in circulation and out of landfills."
          cta={{ label: 'See what is listed', to: '/' }}
        />
      </div>

      {/* Sell is one tap from anywhere in the feed, without ever occupying
          space the inventory could have used. */}
      <Link
        to="/sell"
        aria-label="Sell an item"
        className="lg:hidden fixed bottom-6 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-black pl-4 pr-5 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] active:scale-95 transition-transform"
      >
        <Plus className="h-5 w-5" /> Sell
      </Link>
    </div>
  );
}

function FeedGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-10">
      {children}
    </div>
  );
}

// Trust claims, each one linking to the policy that backs it. They live on the
// banner rather than under the filters: a promise belongs next to the pitch, not
// wedged between a buyer and the grid.
const TRUST_LINKS: Array<{ label: string; to: string }> = [
  { label: 'Buyer protection', to: '/buyer-protection' },
  { label: 'No selling fees', to: '/seller-policy' },
  { label: 'Doorstep pickup', to: '/shipping-policy' },
  { label: 'Condition graded', to: '/conditions-guide' },
];

// Explainer banner for the visitor who has never heard of us. It sits above the
// controls, over the campaign image, and the X clears it for this visit - a
// reload brings it back, so nobody loses the explanation permanently by tapping
// the wrong thing.
function HeroBanner() {
  const [dismissed, setDismissed] = React.useState(false);
  const close = () => setDismissed(true);

  if (dismissed) return null;

  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: '01',
      title: 'Transparent pricing',
      body: 'Price, size and condition upfront. No DM for price. Sold items leave the feed, so you never scroll past something you cannot buy.',
    },
    {
      n: '02',
      title: 'Buyer protection',
      body: 'Your money is held until the item reaches you. Not as described and you are covered. The seller is paid once it lands.',
    },
    {
      n: '03',
      title: 'Sell with zero fees',
      body: 'List for free and keep 100% of your price. Pickup from your door and delivery to the buyer are handled for you.',
    },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-black text-white">
      {/* The image is 2.33:1 and its subject spans the full width. Cropping that
          into a tall phone container throws away both the face and the
          gravestone, so on mobile it runs as its own full-width strip, and on
          desktop it anchors to the top rather than the middle for the same
          reason. */}
      <img
        src="/images/new-banner3-web.jpg"
        alt=""
        aria-hidden
        className="block w-full h-auto object-cover sm:absolute sm:inset-0 sm:h-full sm:object-top sm:opacity-70"
      />
      <div aria-hidden className="hidden sm:block absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/50" />

      {/* Minimal dismiss: just the glyph, no chip behind it. */}
      <button
        type="button"
        onClick={close}
        aria-label="Close introduction"
        className="absolute top-3 right-3 z-10 p-2 text-white/60 hover:text-white transition-colors"
      >
        <X className="h-5 w-5" strokeWidth={1.5} />
      </button>

      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 sm:py-10 flex flex-col gap-5 sm:gap-6">
        {/* Lockup sits left: mark first, then the one-line description beside it
            once there is room to set them on one line. */}
        <h1 className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-6">
          <img
            src="/images/zark-can-web.png"
            alt="zarketplace"
            className="h-10 sm:h-14 lg:h-16 w-auto"
          />
          <span className="text-xs sm:text-lg lg:text-2xl font-black uppercase tracking-[0.2em]">
            Buy &amp; sell pre-owned fashion
          </span>
        </h1>

        {/* Frosted rather than solid: the photograph still reads through, the
            copy still passes contrast. On a phone the three steps swipe
            sideways instead of stacking, which would push the search box and
            the category chips clean off the first screen. */}
        <div className="w-full flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible">
          {steps.map((s) => (
            <div
              key={s.n}
              className="snap-start shrink-0 w-[80%] sm:w-auto border border-white/25 bg-black/45 backdrop-blur-md p-4 sm:p-5 flex flex-col gap-1.5 sm:gap-2"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">{s.n}</span>
              <h2 className="text-sm font-black uppercase tracking-widest">{s.title}</h2>
              <p className="text-[11px] font-bold uppercase tracking-widest leading-relaxed text-white/75">{s.body}</p>
            </div>
          ))}
        </div>

        <Link
          to="/about"
          className="self-start sm:self-center text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] border-b-2 border-white pb-0.5 hover:text-white/70 hover:border-white/70 transition-colors"
        >
          What is zarketplace?
        </Link>

        {/* Each claim is a link to the policy that backs it, so the line is
            checkable rather than decorative. */}
        <div className="w-full flex items-center justify-start sm:justify-center gap-x-3 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:gap-y-2">
          {TRUST_LINKS.map((t, i) => (
            <React.Fragment key={t.to}>
              {i > 0 && <span aria-hidden className="text-white/25">·</span>}
              <Link
                to={t.to}
                className="shrink-0 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] text-white/70 hover:text-white underline-offset-4 hover:underline"
              >
                {t.label}
              </Link>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function SellTile() {
  return (
    <Link
      to="/sell"
      className="group relative isolate overflow-hidden flex flex-col items-start justify-end gap-2 bg-black p-5 text-white aspect-[3/4]"
    >
      <img
        src="/images/denim-2-web.jpg"
        alt=""
        aria-hidden
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-700 group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
      <span className="relative text-xl sm:text-2xl font-black uppercase tracking-tighter leading-none">
        Got something<br />to sell?
      </span>
      <span className="relative text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
        No selling fees. Pickup handled.
      </span>
      <span className="relative mt-1 border-b-2 border-white pb-1 text-[10px] font-black uppercase tracking-[0.2em]">
        List an item
      </span>
    </Link>
  );
}

const Chip: React.FC<ToggleProps> = ({ active, onClick, children }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 border px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors',
        active ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10 hover:border-black',
      )}
    >
      {children}
    </button>
  );
};

// Collapsible rail section. Shows the current selection in the header so a
// folded group still tells you what it is filtering by.
function FilterGroup({ title, summary, defaultOpen = false, children }: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="flex flex-col border-b border-black/5 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-black/40">{title}</span>
        <span className="flex items-center gap-2">
          {!open && summary && (
            <span className="text-[10px] font-black uppercase tracking-widest text-black truncate max-w-[6rem]">{summary}</span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 text-black/40 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="flex flex-col gap-1.5 pt-3 max-h-72 overflow-y-auto">{children}</div>}
    </div>
  );
}

const FilterOption: React.FC<ToggleProps> = ({ active, onClick, children }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-left text-xs font-bold uppercase tracking-widest transition-colors',
        active ? 'text-black underline underline-offset-4' : 'text-black/50 hover:text-black',
      )}
    >
      {children}
    </button>
  );
};

function SheetGroup({ title, summary, collapsible = false, defaultOpen = true, children }: {
  title: string;
  summary?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(collapsible ? defaultOpen : true);
  return (
    <div className="flex flex-col gap-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center justify-between gap-2"
        >
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-black/40">{title}</span>
          <span className="flex items-center gap-2">
            {!open && summary && (
              <span className="text-[10px] font-black uppercase tracking-widest text-black">{summary}</span>
            )}
            <ChevronDown className={cn('h-4 w-4 text-black/40 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
      ) : (
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-black/40">{title}</h3>
      )}
      {open && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const SheetChip: React.FC<ToggleProps> = ({ active, onClick, children }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'border px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors',
        active ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10',
      )}
    >
      {children}
    </button>
  );
};
