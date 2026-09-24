// The marketplace feed. This is both "/" and "/browse" - there is no separate
// landing page, because a homepage that explains the marketplace instead of
// being the marketplace costs us the visitor who arrived from an Instagram
// story. A dismissible intro banner sits on top for first-time visitors; below
// it the page is search, filters and real inventory, and nothing else.
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Loader2, ChevronDown } from 'lucide-react';
import { supabasePublic } from '../lib/supabase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { EmptyState } from '../components/EmptyState';
import { CampaignBand } from '../components/CampaignBand';
import { cn } from '../lib/utils';
import { log } from '../lib/log';
import { usePageMeta, META } from '../lib/pageMeta';
import { useFavorites, useFavoritesSyncTick, favoriteSnapshots, refreshSnapshots, removeFavorite, type FavoriteSnapshot } from '../lib/favorites';
import { GoneFavorites } from '../components/GoneFavorites';
import { CONDITIONS } from '../lib/condition';
import { CATEGORY_SIZES, ALL_SIZES } from '../lib/sizes';

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



// Discovery chips. These are shortcuts into the same filter surface, not
// marketing sections - each one is a query anyone could have built by hand.

const QUICK_CHIPS: Array<{ value: string; label: string; tag?: string }> = [
  // MODEL.md §3. Stock we own and photographed ourselves, on our shelf, so it
  // goes out the day it is bought rather than waiting on anyone.
  { value: 'verified', label: 'Instant Ship' },
  { value: 'under_999', label: 'Under ₹999' },
  { value: 'sale', label: 'On Sale' },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
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
    if (f.gender && l.gender !== f.gender && !(f.gender !== 'Unisex' && l.gender === 'Unisex')) return false;
    if (f.sizeType && l.size_type !== f.sizeType) return false;
    if (f.condition && l.condition !== f.condition) return false;
    if (f.quick === 'verified') return !!l.is_verified;
    if (f.quick === 'under_999') return l.price <= 999;
    if (f.quick === 'sale') return l.sale_price !== null;
    return true;
  });
  if (f.sortBy === 'price_low') out = [...out].sort((a, b) => a.price - b.price);
  else if (f.sortBy === 'price_high') out = [...out].sort((a, b) => b.price - a.price);
  return out;
}

export function Marketplace() {
  usePageMeta(META.home);

  const [searchParams, setSearchParams] = useSearchParams();
  const favorites = useFavorites();

  const category = searchParams.get('category');
  const gender = searchParams.get('gender');
  const sizeType = searchParams.get('size_type');
  const condition = searchParams.get('condition');
  const quick = searchParams.get('q');
  const searchQuery = searchParams.get('search') ?? '';
  // Relevance, not recency. Newest-first made the homepage a function of
  // upload order, so the last thing listed led - which put a Rs 50 jersey
  // ahead of a Rs 14,500 jacket on the only screen most visitors ever see.
  const sortBy = searchParams.get('sort') || 'relevance';
  // Opt-in, never the default. Defaulting this on would show an empty feed to
  // everyone outside Delhi, where all current stock is, and an empty grid
  // cannot distinguish "nothing near you" from "nothing here".


  const [listings, setListings] = React.useState<Listing[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [page, setPage] = React.useState(0);
  const [state, setState] = React.useState<'loading' | 'paging' | 'ready' | 'error'>('loading');
  const [showFilters, setShowFilters] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  // Favorites that have left the shop (sold, or taken off it), shown under
  // the ones still on sale so a hearted item never just disappears.
  const [gone, setGone] = React.useState<FavoriteSnapshot[]>([]);

  // Search box is local so typing stays instant; the URL (the source of truth
  // for every other filter) catches up on a debounce.
  const [searchInput, setSearchInput] = React.useState(searchQuery);
  React.useEffect(() => { setSearchInput(searchQuery); }, [searchQuery]);

  // Read at fetch time rather than tracked as a dependency: un-hearting an item
  // while looking at the Favorites view should not yank the card out from under the
  // cursor, so the list stays as-fetched until the user changes something.
  const favoritesRef = React.useRef(favorites);
  favoritesRef.current = favorites;

  // The favorites view also reloads when the account's list has just been
  // read (after signing in, or on returning to the tab), so a heart added on
  // another device shows up without a refresh.
  const syncTick = useFavoritesSyncTick();
  const filterKey = [category, gender, sizeType, condition, quick, searchQuery, sortBy, quick === 'saved' ? syncTick : 0].join('|');

  // Any filter change starts a fresh feed rather than appending to the old one.
  React.useEffect(() => { setPage(0); }, [filterKey]);

  React.useEffect(() => {
    let cancelled = false;
    const t = mlog.time('fetchPage');
    setState(page === 0 ? 'loading' : 'paging');

    async function fetchPage() {
      try {
        let query = supabasePublic
          .from('public_listings')
          .select('*', page === 0 ? { count: 'exact' } : {})
          .eq('status', 'approved')
          // Sold stock never reaches the buyer. Scrolling past things you cannot
          // buy is the single most irritating thing a resale feed can do, so the
          // moment an item sells it leaves the grid.
          .or('is_sold.is.null,is_sold.eq.false');

        if (sortBy === 'price_low') query = query.order('price', { ascending: true });
        else if (sortBy === 'price_high') query = query.order('price', { ascending: false });
        else if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
        // relevance_score is price times a jitter fixed once per listing, so
        // the order is stable across pages and across visits. See the
        // migration: a feed reshuffled per request breaks .range() paging.
        else query = query.order('relevance_score', { ascending: false, nullsFirst: false });
        // Stable tiebreaker: without it, rows sharing a price can shift between
        // pages and the feed shows duplicates or silently skips items.
        query = query.order('id', { ascending: false });

        if (category) query = query.eq('category', category);
        // Unisex pieces are for everyone, so they appear under Men and under
        // Women as well as under Unisex itself.
        if (gender) query = gender === 'Unisex' ? query.eq('gender', 'Unisex') : query.in('gender', [gender, 'Unisex']);
        if (sizeType) query = query.eq('size_type', sizeType);
        if (condition) query = query.eq('condition', condition);

        if (quick === 'verified') {
          query = query.eq('is_verified', true);
        } else if (quick === 'under_999') {
          query = query.lte('price', 999);
        } else if (quick === 'sale') {
          query = query.not('sale_price', 'is', null);
        } else if (quick === 'saved') {
          const ids = [...favoritesRef.current];
          if (ids.length === 0) {
            // `.in('id', [])` is a valid query that returns nothing, but short
            // -circuiting keeps an empty Favorites view off the network entirely.
            setListings([]);
            setTotal(0);
            setGone([]);
            setState('ready');
            return;
          }
          query = query.in('id', ids);
          if (page === 0) {
            // Which favorites are still on sale, all of them, not just this
            // page: the rest have sold or come off the site. Those are shown
            // from the snapshot taken when they were hearted; one hearted
            // before snapshots existed has nothing to show, so it is dropped.
            const { data: onSale } = await supabasePublic
              .from('public_listings')
              .select('id')
              .eq('status', 'approved')
              .or('is_sold.is.null,is_sold.eq.false')
              .in('id', ids);
            if (cancelled) return;
            if (onSale) {
              const available = new Set(onSale.map((r: { id: string }) => r.id));
              const snaps = favoriteSnapshots();
              const leftShop = ids.filter((id) => !available.has(id));
              for (const id of leftShop) if (!snaps[id]) removeFavorite(id);
              setGone(leftShop.map((id) => snaps[id]).filter(Boolean));
            }
          }
        }

        const safe = sanitizeSearch(searchQuery);
        if (safe) {
          query = query.or(
            `title.ilike.%${safe}%,description.ilike.%${safe}%,brand.ilike.%${safe}%,category.ilike.%${safe}%`,
          );
        }

        const from = page * PAGE_SIZE;
        // Hard ceiling on the request. A feed that spins forever is worse than
        // one that says it failed and offers Retry: the spinner gives the
        // visitor nothing to do, so they leave or reload blind.
        const { data, error, count } = await Promise.race([
          query.range(from, from + PAGE_SIZE - 1),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Listings request timed out')), 12000),
          ),
        ]);
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

        // Keeps each favorite's snapshot current while it is still on sale.
        refreshSnapshots(rows as Listing[]);
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
  // Un-hearting one of these takes it off the list straight away.
  const goneShown = gone.filter((g) => favorites.has(g.id));

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
      {/* The pitch, above the controls, so a newcomer reads what zarketplace is
          before reaching the grid. */}
      <HeroBanner />

      {/* No promise ticker between the hero and the shop. The hero already
          says sold and shipped by us, prices upfront, checked; the striped
          tape said it again, louder, and pushed the products down. */}

      {/* The shop's controls, one strip: what you are looking at on the left
          as a row of words, and the tools on the right. It stays where it
          sits rather than following the scroll: pinned, it rode all the way
          down to the footer. The hero's "Shop now" scrolls here (#shop). */}
      <div id="shop" className="scroll-mt-20 border-b border-black/10 bg-white">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          {/* Gender is the one filter that earns a permanent place: it halves
              the catalogue in one tap. Instant Ship sits beside it because
              "can I have it this week" is a question people arrive with. */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-6 overflow-x-auto scrollbar-hide">
            <Tab active={!gender && !quick && !category} onClick={clearAll}>All</Tab>
            {GENDERS.map((g) => (
              <React.Fragment key={g}>
                <Tab active={gender === g} onClick={() => toggleParam('gender', g)}>{g}</Tab>
              </React.Fragment>
            ))}
            <Tab active={quick === 'verified'} onClick={() => toggleParam('q', 'verified')}>Instant Ship</Tab>
            {favorites.size > 0 && (
              <Tab active={quick === 'saved'} onClick={() => toggleParam('q', 'saved')}>Favorites ({favorites.size})</Tab>
            )}
          </div>

          <div className="flex items-center gap-5 sm:gap-6">
            <form onSubmit={onSearchSubmit} className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
              <Search className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search brands, items, sizes"
                aria-label="Search listings"
                className="w-full min-h-[44px] border-b border-black/20 bg-transparent pl-7 pr-2 text-sm placeholder:text-black/40 focus:border-black focus:outline-none"
              />
            </form>
            {/* Sort moves into the sheet on a phone, where the row has no room
                for it next to the search. */}
            <span className="hidden sm:flex">
              <SortChip value={sortBy} onChange={(v) => setParam('sort', v === 'relevance' ? null : v)} />
            </span>
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              className="shrink-0 flex min-h-[44px] items-center gap-2 text-sm font-bold hover:underline underline-offset-4"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 pb-16 pt-6 sm:pt-8 flex gap-10">

        <div className="min-w-0 flex-1 flex flex-col gap-4">
          {state === 'error' && listings.length === 0 ? (
            /* A failed fetch must never look like an empty catalogue. */
            <div className="border border-black/10 p-8 flex flex-col items-start gap-4">
              <p className="text-sm font-bold">
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
          ) : listings.length === 0 && !(quick === 'saved' && goneShown.length > 0) ? (
            <EmptyState
              detail={
                quick === 'saved'
                  ? 'Tap the heart on anything you like and it stays here, so you can come back to it.'
                  : activeFilterCount > 0 || searchQuery
                  ? undefined
                  : 'Every piece here is one we sourced, checked, and dispatched ourselves, so the shelf fills one item at a time. Sell us something and it could be the next one.'
              }
              action={
                quick === 'saved' ? (
                  <Link to="/" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    Shop now
                  </Link>
                ) : (
                  <Link to="/sell" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    Sell us something
                  </Link>
                )
              }
            >
              {quick === 'saved'
                ? 'No favorites yet'
                : quick === 'verified' && activeFilterCount === 1 && !searchQuery
                  ? 'Nothing in our hub right now'
                : activeFilterCount > 0 || searchQuery
                  ? 'Nothing matches that'
                  // No filters and no results means the shelf is genuinely
                  // empty, which is a different thing from a search that missed
                  // and deserves a different answer.
                  : "We're buying stock right now"}
            </EmptyState>
          ) : (
            <>
              {listings.length > 0 && <FeedGrid>
                {listings.map((listing, i) => (
                  <React.Fragment key={listing.id}>
                    <ListingCard listing={listing} priority={i < 4} />
                    {/* One contextual sell prompt, deep enough in the feed that
                        it reaches someone who is browsing rather than someone
                        who just landed. */}
                    {i === 15 && <SellTile />}
                  </React.Fragment>
                ))}
              </FeedGrid>}
              {quick === 'saved' && listings.length === 0 && (
                <p className="text-sm">None of your favorites are on sale right now.</p>
              )}

              <div ref={sentinelRef} className="h-10" />
              {/* At the end of the feed, nothing. A closing line under the last
                  row ("new pieces go up as we buy them") read as an apology,
                  and the band below the grid already ends the page. */}
              {state === 'paging' ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin ink-low" />
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
              ) : null}

              {quick === 'saved' && goneShown.length > 0 && <GoneFavorites items={goneShown} />}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="relative max-h-[80vh] w-full sm:max-w-lg overflow-y-auto bg-white border-t sm:border border-black/10 p-6 sm:p-8 flex flex-col gap-10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Filters</h2>
              <button onClick={() => setShowFilters(false)} aria-label="Close filters" className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>


            <SheetGroup title="Sort by" className="sm:hidden">
              {SORT_OPTIONS.map((o) => (
                <SheetChip key={o.value} active={sortBy === o.value}
                  onClick={() => setParam('sort', o.value === 'relevance' ? null : o.value)}>
                  {o.label}
                </SheetChip>
              ))}
            </SheetGroup>

            <SheetGroup title="Show me">
              <SheetChip active={!quick} onClick={() => setParam('q', null)}>Everything</SheetChip>
              {QUICK_CHIPS.map((c) => (
                <SheetChip key={c.value} active={quick === c.value} onClick={() => setParam('q', c.value)}>
                  {c.label}
                </SheetChip>
              ))}
            </SheetGroup>

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
                className="flex-1 border border-black py-4 text-[11px] font-black uppercase tracking-widest"
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

      {/* One band, to the seller. By the foot of the feed the buyer has
          been served; the one reader left to reach is someone with something
          to sell. A second band ("Reduce waste, buy pre-loved", to Browse)
          said the same thing again and linked to the page it sat on. The
          photograph is a real resale crowd, not a single shoe. */}
      <CampaignBand
        image="/images/resale-web.jpg"
        heading="Good clothes deserve"
        script="another life."
        emphasis="script"
        cta={{ label: 'Get an offer', to: '/sell' }}
      />

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

const HERO_IMAGE = 'url(/images/banner-3-new.jpg)';

// The home banner. One line of display type that lands the joke the photo
// sets up (the headstone reads "DM FOR PRICE"), then two short sentences: what
// we are, and the answer to the joke (the price is on the page, and the piece
// has been checked). Then the two things a visitor can do.
//
// Mirrored by hand in index.html (#static-hero) for the first paint. The two
// must stay identical, or the page visibly changes as the app loads.
function HeroBanner() {
  // Hand off from the static hero in index.html. A layout effect runs after
  // this component is in the DOM but before the browser paints, so the swap
  // happens between two frames: never two heroes, never a gap where one was.
  React.useLayoutEffect(() => {
    document.getElementById('static-hero')?.remove();
  }, []);

  const toShop = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative isolate overflow-hidden bg-black text-white">
      {/* Phone: the photo takes the right side whole, so the figure stays intact
          and the copy sits on flat black instead of fighting the image. */}
      <div aria-hidden className="absolute inset-y-0 right-0 w-[68%] sm:hidden">
        <div
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{ backgroundImage: HERO_IMAGE, backgroundPosition: '14% center' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-black/10" />
      </div>

      {/* Wide: the photo holds the right side, where the whole frame fits
          (figure and headstone both), and fades into flat black under the copy. */}
      <div aria-hidden className="hidden sm:block absolute inset-y-0 right-0 w-[64%]">
        <div className="absolute inset-0 bg-cover bg-no-repeat bg-center" style={{ backgroundImage: HERO_IMAGE }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/45 via-35% to-transparent to-75%" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24 flex flex-col items-start gap-6 sm:gap-8">
        {/* Two lines, broken where the joke breaks: the phrase, then the thing
            it buries. */}
        <h1 className="text-[2.35rem] leading-[0.9] sm:text-6xl lg:text-7xl font-black uppercase tracking-tighter">
          <span className="block">Rest in peace,</span>
          <span className="block">DM for price.</span>
        </h1>
        <p className="max-w-[34ch] text-sm sm:text-base font-medium leading-relaxed">
          Pre-owned fashion, sold and shipped by us. Every price upfront, every piece checked.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="#shop"
            onClick={toShop}
            className="bg-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-black transition-colors hover:bg-zinc-200"
          >
            Shop now
          </a>
          <Link
            to="/sell"
            className="border border-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-white hover:text-black"
          >
            Get an offer
          </Link>
        </div>
      </div>
    </section>
  );
}

function SellTile() {
  return (
    <Link to="/sell" className="group flex flex-col gap-3">
      <div className="relative isolate aspect-[3/4] overflow-hidden bg-black text-white">
        <img
          src="/images/denim-2-web.jpg"
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <span className="absolute inset-x-5 bottom-5 text-xl sm:text-2xl font-black uppercase tracking-tighter leading-[0.95]">
          Got something<br />to sell?
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold">Sell it to us</span>
        <span className="text-sm">We'll make you an offer.</span>
        <span className="mt-1 text-sm font-bold underline underline-offset-4 group-hover:decoration-2">Get an offer</span>
      </div>
    </Link>
  );
}

// Sort, wearing the same chip as the filters beside it. index.css keeps a 16px
// floor on form controls so iOS Safari never auto-zooms on tap, so the native
// select is kept (native picker, no zoom) but rendered invisible over a label we
// size ourselves.
function SortChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative shrink-0 flex min-h-[44px] items-center gap-1.5 text-sm hover:underline underline-offset-4">
      <span>Sort:</span>
      <span className="font-bold">{SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Newest'}</span>
      <ChevronDown className="h-4 w-4" />
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

// One word in the shop's row of views. The one you are on is underlined,
// the rest are plain; no boxes, so the row reads as navigation, not a form.
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 min-h-[44px] whitespace-nowrap text-sm font-bold underline-offset-[10px] decoration-2',
        active ? 'underline' : 'hover:underline hover:decoration-black/30',
      )}
    >
      {children}
    </button>
  );
}

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
        <span className="text-sm font-bold">{title}</span>
        <span className="flex items-center gap-2">
          {!open && summary && (
            <span className="text-[10px] font-black uppercase tracking-widest text-black truncate max-w-[6rem]">{summary}</span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 ink-low transition-transform', open && 'rotate-180')} />
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
        active ? 'text-black underline underline-offset-4' : 'ink-mid hover:text-black',
      )}
    >
      {children}
    </button>
  );
};

function SheetGroup({ title, summary, collapsible = false, defaultOpen = true, className, children }: {
  title: string;
  summary?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(collapsible ? defaultOpen : true);
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center justify-between gap-2"
        >
          <span className="text-sm font-bold">{title}</span>
          <span className="flex items-center gap-2">
            {!open && summary && (
              <span className="text-sm">{summary}</span>
            )}
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
      ) : (
        <h3 className="text-sm font-bold">{title}</h3>
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
        'border px-4 py-2.5 min-h-[44px] text-sm transition-colors',
        active ? 'bg-black text-white border-black font-bold' : 'bg-white text-black border-black/15 hover:border-black',
      )}
    >
      {children}
    </button>
  );
};
