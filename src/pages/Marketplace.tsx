// The marketplace feed. This is both "/" and "/browse" - there is no separate
// landing page, because a homepage that explains the marketplace instead of
// being the marketplace costs us the visitor who arrived from an Instagram
// story. A dismissible intro banner sits on top for first-time visitors; below
// it the page is search, filters and real inventory, and nothing else.
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Plus, Loader2, Heart, ChevronDown, ShieldCheck, PackageCheck, Tag, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { EmptyState } from '../components/EmptyState';
import { CampaignBand } from '../components/CampaignBand';
import { PromiseBanner } from '../components/PromiseBanner';
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
  /** Small corner flag, e.g. "New" on a freshly added filter. */
  tag?: string;
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
const QUICK_CHIPS: Array<{ value: string; label: string; tag?: string }> = [
  { value: 'new_today', label: 'New today' },
  { value: 'under_999', label: 'Under ₹999', tag: 'New' },
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
  useDocumentTitle('buy & sell pre-owned fashion');

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

      {/* The zero-fee promise. It used to run over the Create Listing form,
          where brand noise on top of a form is pure friction. Here it reaches
          the same sellers - people browsing are the ones who go on to list -
          without standing between anyone and a field they have to fill. */}
      <PromiseBanner variant="ticker" />

      {/* Control deck: search + chips. It stays where it sits, between the
          banner and the grid, rather than following the scroll - pinned, it
          rode all the way down to the footer, where a search box over the
          closing bands is just something in the way. */}
      <div className="border-b border-black/5 bg-white">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-3">
          {/* Search keeps sentence case rather than the sitewide uppercase: the
              full hint has to fit a phone's width without truncating. */}
          <form onSubmit={onSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search brands, items, sizes"
              aria-label="Search listings"
              className="w-full border border-black/10 bg-zinc-50 py-3 pl-11 pr-4 text-sm font-bold tracking-normal placeholder:text-black/30 focus:border-black focus:outline-none"
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
            </div>

            {/* Sort leads this row and Filters closes it, so everything that
                changes what the grid shows lives on one line. */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-2 -my-2 lg:mx-0 lg:px-0 lg:justify-end">
              <SortChip value={sortBy} onChange={(v) => setParam('sort', v === 'newest' ? null : v)} />
              {QUICK_CHIPS.map((c) => (
                <Chip key={c.value} active={quick === c.value} onClick={() => toggleParam('q', c.value)} tag={c.tag}>
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
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="lg:hidden shrink-0 flex min-h-[44px] items-center gap-2 border border-black bg-white px-4 py-3 text-[11px] font-black uppercase tracking-widest"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 pb-12 pt-4 flex gap-10">
        {/* Desktop filter rail. Persistent because once the screen is wide
            enough, horizontal chips are a mobile compromise. */}
        <aside className="hidden lg:block w-56 shrink-0">
          {/* The rail still pins, now under the navbar rather than under a
              control deck that no longer stays. */}
          <div className="sticky top-24 flex flex-col gap-2 pb-10">
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
              {state === 'loading'
                ? 'Loading'
                : (total ?? listings.length) > 0
                  ? `${total ?? listings.length} item${(total ?? listings.length) === 1 ? '' : 's'}`
                  : ''}
            </p>
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
          image="/images/boots-web.jpg"
          heading="Reduce waste,"
          script="buy pre-loved."
          body="Keep clothes in circulation and out of landfills."
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
          image="/images/resale-web.jpg"
          heading="Good clothes deserve"
          script="another life."
          body="Resellers, Instagram thrift stores and everyday sellers, all in one place."
          cta={{ label: "See what's listed", to: '/browse' }}
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
const PROMISES: Array<{ label: string; body: string; to: string; Icon: typeof ShieldCheck }> = [
  { label: 'Buyer protection', body: 'Pay with confidence.', to: '/buyer-protection', Icon: ShieldCheck },
  { label: 'No selling fees', body: 'Keep 100%.', to: '/sell', Icon: Tag },
  { label: 'Doorstep pickup', body: 'We collect it.', to: '/shipping-policy', Icon: PackageCheck },
];

const HERO_IMAGE = 'url(/images/new-banner3.jpg)';

// The home banner: the pitch, the three promises that back it, and the only two
// things a visitor can do here. It is permanent rather than dismissible - it is
// the top of the marketplace, not a first-visit notice.
function HeroBanner() {
  // Hand off from the static hero in index.html. A layout effect runs after
  // this component is in the DOM but before the browser paints, so the swap
  // happens between two frames: never two heroes, never a gap where one was.
  React.useLayoutEffect(() => {
    document.getElementById('static-hero')?.remove();
  }, []);

  return (
    <section className="relative isolate overflow-hidden bg-black text-white">
      {/* Phone: the photo takes the right side whole, so the figure stays intact
          and the copy sits on flat black instead of fighting the image. The
          horizontal position keeps the face in frame at this crop. */}
      <div aria-hidden className="absolute inset-y-0 right-0 w-[68%] sm:hidden">
        <div
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{ backgroundImage: HERO_IMAGE, backgroundPosition: '14% center' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-black/10" />
      </div>

      {/* Wide: same idea with more room. The photo holds the right side, where
          the whole frame fits (figure and headstone both), and fades into flat
          black under the copy rather than being dimmed all the way across. */}
      <div aria-hidden className="hidden sm:block absolute inset-y-0 right-0 w-[64%]">
        <div className="absolute inset-0 bg-cover bg-no-repeat bg-center" style={{ backgroundImage: HERO_IMAGE }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/45 via-35% to-transparent to-75%" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-7 sm:py-14 lg:py-16 flex flex-col gap-6 sm:gap-7">
        <h1 className="max-w-[8ch] sm:max-w-none text-[2.1rem] leading-[0.95] sm:text-4xl lg:text-5xl font-black tracking-tighter">
          Buy &amp; sell<br className="hidden sm:block" /> pre-owned fashion.
        </h1>

        {/* One promise row at every width. The phone drops the second line -
            three labels and three sentences do not fit side by side - and keeps
            the dividers so the claims read as a set. */}
        <ul className="grid grid-cols-3 divide-x divide-white/20 sm:flex sm:divide-x-0 sm:gap-10">
          {PROMISES.map(({ label, body, to, Icon }) => (
            <li key={label} className="min-w-0 pr-2 first:pl-0 pl-3 sm:p-0">
              <Link to={to} className="group flex min-h-[44px] items-start gap-2.5 py-1 sm:items-center sm:gap-3 sm:py-0">
                <Icon className="mt-0.5 h-5 w-5 sm:mt-0 sm:h-6 sm:w-6 shrink-0 text-white/85" strokeWidth={1.5} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] sm:text-sm font-black tracking-tight group-hover:text-white/70">
                    {label}
                  </span>
                  <span className="hidden sm:block text-xs font-bold text-white/60">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <Link
            to="/browse"
            className="flex items-center justify-between gap-3 bg-white px-5 py-4 sm:min-w-[230px] sm:px-7 text-[11px] font-black uppercase tracking-widest text-black transition-colors hover:bg-white/85"
          >
            <span className="sm:hidden">Browse</span>
            <span className="hidden sm:inline">Browse items</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/sell"
            className="flex items-center justify-between gap-3 border border-white/40 bg-black sm:bg-transparent px-5 py-4 sm:min-w-[230px] sm:px-7 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:border-white hover:bg-white/10"
          >
            Sell an item
            <ArrowRight className="h-4 w-4" />
          </Link>
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

// Sort, wearing the same chip as the filters beside it. index.css keeps a 16px
// floor on form controls so iOS Safari never auto-zooms on tap, so the native
// select is kept (native picker, no zoom) but rendered invisible over a label we
// size ourselves.
function SortChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative shrink-0 flex min-h-[44px] items-center gap-2 border border-black/10 bg-white px-4 py-3 sm:py-2.5 text-[11px] font-black uppercase tracking-widest hover:border-black transition-colors">
      {SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Newest'}
      <ChevronDown className="h-3.5 w-3.5 text-black/40" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sort listings"
        className="absolute inset-0 h-full min-h-[44px] w-full cursor-pointer opacity-0"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

const Chip: React.FC<ToggleProps> = ({ active, onClick, children, tag }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative shrink-0 min-h-[44px] border px-4 py-3 sm:py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors',
        active ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10 hover:border-black',
      )}
    >
      {children}
      {tag && (
        // Sits on the corner rather than in the label, so the filter name stays
        // the thing you read and the flag is what you notice.
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 bg-black text-white border border-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.15em] leading-none">
          {tag}
        </span>
      )}
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
        'border px-4 py-2.5 min-h-[44px] text-[11px] font-black uppercase tracking-widest transition-colors',
        active ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10',
      )}
    >
      {children}
    </button>
  );
};
