// The marketplace feed. This is both "/" and "/browse" - there is no separate
// landing page, because a homepage that explains the marketplace instead of
// being the marketplace costs us the visitor who arrived from an Instagram
// story. A dismissible intro banner sits on top for first-time visitors; below
// it the page is search, filters and real inventory, and nothing else.
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Loader2, ChevronDown } from 'lucide-react';
import { supabasePublic } from '../lib/supabase';
import { rememberListings } from '../lib/listingCache';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { EmptyState } from '../components/EmptyState';
import { CampaignBand } from '../components/CampaignBand';
import { cn } from '../lib/utils';
import { isAdminHost } from '../lib/adminHost';
import { log } from '../lib/log';
import { usePageMeta, META } from '../lib/pageMeta';
import { useFavorites, useFavoritesSyncTick, favoriteSnapshots, refreshSnapshots, removeFavorite, type FavoriteSnapshot } from '../lib/favorites';
import { GoneFavorites } from '../components/GoneFavorites';
import { CONDITIONS } from '../lib/condition';
import { CATEGORY_SIZES, ALL_SIZES } from '../lib/sizes';
import { reportError } from '../lib/errorReport';

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
    category: string | null; gender: string | null; quick: string | null; sortBy: string;
    brands: string[]; sizes: string[]; conditions: string[]; min: number | null; max: number | null;
  },
): Listing[] {
  let out = rows.filter((l) => {
    if (!matchesFacets(l as FacetRow, f)) return false;
    if (f.quick === 'under_999') return l.price <= 999;
    if (f.quick === 'sale') return l.sale_price !== null;
    return true;
  });
  if (f.sortBy === 'price_low') out = [...out].sort((a, b) => a.price - b.price);
  else if (f.sortBy === 'price_high') out = [...out].sort((a, b) => b.price - a.price);
  return out;
}

// The fields the filter column counts over. The whole shelf is a few hundred
// rows, so they are fetched once and counted in the browser: each option shows
// how many items it would leave, given every other filter already chosen.
interface FacetRow {
  id: string; sale_price: number | null;
  brand: string | null; size_type: string | null; condition: string | null;
  category: string | null; gender: string | null; price: number; is_verified: boolean | null;
}
interface Facets {
  category: string | null; gender: string | null; quick: string | null;
  brands: string[]; sizes: string[]; conditions: string[]; min: number | null; max: number | null;
}
type FacetKey = 'brand' | 'size' | 'condition' | 'category' | 'gender' | 'price' | 'instant';

function matchesFacets(r: FacetRow, f: Facets, skip?: FacetKey): boolean {
  if (skip !== 'category' && f.category && r.category !== f.category) return false;
  if (skip !== 'gender' && f.gender && r.gender !== f.gender && !(f.gender !== 'Unisex' && r.gender === 'Unisex')) return false;
  if (skip !== 'brand' && f.brands.length && !f.brands.includes((r.brand ?? '').trim())) return false;
  if (skip !== 'size' && f.sizes.length && !f.sizes.includes(r.size_type ?? '')) return false;
  if (skip !== 'condition' && f.conditions.length && !f.conditions.includes(r.condition ?? '')) return false;
  if (skip !== 'price' && f.min !== null && r.price < f.min) return false;
  if (skip !== 'price' && f.max !== null && r.price > f.max) return false;
  if (skip !== 'instant' && f.quick === 'verified' && !r.is_verified) return false;
  return true;
}

interface FeedEntry { listings: Listing[]; total: number | null; page: number; at: number }
const feedCache = new Map<string, FeedEntry>();
const FEED_FRESH_MS = 3 * 60 * 1000;
let facetCache: FacetRow[] | null = null;

const PRICE_RANGES: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: 'Under ₹1,500', min: null, max: 1499 },
  { label: '₹1,500 to ₹3,000', min: 1500, max: 3000 },
  { label: '₹3,000 to ₹5,000', min: 3001, max: 5000 },
  { label: '₹5,000 to ₹10,000', min: 5001, max: 10000 },
  { label: '₹10,000 to ₹15,000', min: 10001, max: 15000 },
  { label: '₹15,000 and up', min: 15001, max: null },
];

export function Marketplace() {
  usePageMeta(META.home);

  const [searchParams, setSearchParams] = useSearchParams();
  const favorites = useFavorites();

  const category = searchParams.get('category');
  const gender = searchParams.get('gender');
  // Brand, size and condition take several values at once, comma separated
  // in the address (?brand=Nike,Carhartt), so a filtered view can be shared.
  const listParam = (k: string) => (searchParams.get(k) ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  const brandsKey = searchParams.get('brand') ?? '';
  const sizesKey = searchParams.get('size_type') ?? '';
  const conditionsKey = searchParams.get('condition') ?? '';
  const brands = React.useMemo(() => listParam('brand'), [brandsKey]);
  const sizes = React.useMemo(() => listParam('size_type'), [sizesKey]);
  const conditions = React.useMemo(() => listParam('condition'), [conditionsKey]);
  const numParam = (k: string) => {
    const n = Number(searchParams.get(k));
    return searchParams.get(k) && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const minPrice = numParam('min');
  const maxPrice = numParam('max');
  const quick = searchParams.get('q');
  const searchQuery = searchParams.get('search') ?? '';
  // Relevance, not recency. Newest-first made the homepage a function of
  // upload order, so the last thing listed led - which put a Rs 50 jersey
  // ahead of a Rs 14,500 jacket on the only screen most visitors ever see.
  const sortBy = searchParams.get('sort') || 'relevance';
  // Opt-in, never the default. Defaulting this on would show an empty feed to
  // everyone outside Delhi, where all current stock is, and an empty grid
  // cannot distinguish "nothing near you" from "nothing here".


  // The favorites view also reloads when the account's list has just been
  // read (after signing in, or on returning to the tab), so a heart added on
  // another device shows up without a refresh.
  const syncTick = useFavoritesSyncTick();
  const filterKey = [category, gender, brandsKey, sizesKey, conditionsKey, minPrice, maxPrice, quick, searchQuery, sortBy, quick === 'saved' ? syncTick : 0].join('|');

  // Coming back to the shop (from an item, or the back button) draws the feed
  // that was there, every page of it, instead of a skeleton and a refetch.
  const [restored] = React.useState(() => {
    const c = feedCache.get(filterKey);
    return c && Date.now() - c.at < FEED_FRESH_MS ? c : null;
  });
  const skipFirstFetch = React.useRef(!!restored);
  const fetchedAt = React.useRef(restored?.at ?? 0);
  const [listings, setListings] = React.useState<Listing[]>(() => restored?.listings ?? []);
  // Set once the end of the feed is reached: how many there are in all.
  const [total, setTotal] = React.useState<number | null>(() => restored?.total ?? null);
  const [page, setPage] = React.useState(() => restored?.page ?? 0);
  const [state, setState] = React.useState<'loading' | 'paging' | 'ready' | 'error'>(() => (restored ? 'ready' : 'loading'));
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

  // Any filter change starts a fresh feed rather than appending to the old
  // one. Not on first mount: a feed restored from the cache keeps its pages.
  const lastFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    setPage(0);
  }, [filterKey]);

  React.useEffect(() => {
    if (skipFirstFetch.current) { skipFirstFetch.current = false; return; }
    let cancelled = false;
    const t = mlog.time('fetchPage');
    // A filter already looked at this visit shows its last result at once,
    // and the fresh one replaces it when it lands.
    const cached = page === 0 ? feedCache.get(filterKey) : undefined;
    if (cached) { setListings(cached.listings.slice(0, PAGE_SIZE)); setTotal(cached.total); setState('ready'); }
    else setState(page === 0 ? 'loading' : 'paging');

    async function fetchPage() {
      try {
        let query = supabasePublic
          .from('public_listings')
          // Not counted: no total is shown, and a count header makes the
          // browser send a preflight first, a second round trip.
          .select('*')
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
        if (brands.length) query = query.in('brand', brands);
        if (sizes.length) query = query.in('size_type', sizes);
        if (conditions.length) query = query.in('condition', conditions);
        if (minPrice !== null) query = query.gte('price', minPrice);
        if (maxPrice !== null) query = query.lte('price', maxPrice);

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
        let totalCount: number | null = count ?? null;

        // Local development with an empty catalogue: fall back to sample rows so
        // the feed can actually be looked at. Never runs in a production build,
        // and real data always wins the moment a single listing exists.
        // Imported dynamically, not statically: with DEV compiled to false the
        // whole branch is eliminated and the sample data never reaches the
        // production bundle at all.
        if (import.meta.env.DEV && page === 0 && rows.length === 0 && !searchQuery) {
          const { devListings } = await import('../lib/devListings');
          rows = applyDevFilters(devListings, { category, gender, quick, sortBy, brands, sizes, conditions, min: minPrice, max: maxPrice });
          totalCount = rows.length;
        }

        // Keeps each favorite's snapshot current while it is still on sale.
        refreshSnapshots(rows as Listing[]);
        rememberListings(rows as Listing[]);
        fetchedAt.current = Date.now();
        setListings((prev) => (page === 0 ? rows : [...prev, ...rows]));
        if (page === 0) setTotal(totalCount);
        // A short page means we've reached the end; remember it via total.
        if (rows.length < PAGE_SIZE) setTotal(from + rows.length);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        mlog.warn('fetchPage failed', err);
        reportError('load', err, 'Shop feed');
        setState('error');
      }
    }

    fetchPage();
    return () => { cancelled = true; };
  }, [filterKey, page, reloadKey]);

  const hasMore = total === null ? listings.length > 0 && listings.length % PAGE_SIZE === 0 : listings.length < total;

  // Remember this feed for coming back to it.
  React.useEffect(() => {
    if (state !== 'ready' || fetchedAt.current === 0) return;
    feedCache.set(filterKey, { listings, total, page, at: fetchedAt.current });
  }, [state, listings, total, page, filterKey]);
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

  // The shelf's facet fields, for the counts beside each filter option.
  const [facetRows, setFacetRows] = React.useState<FacetRow[]>(() => facetCache ?? []);
  React.useEffect(() => {
    let live = true;
    supabasePublic
      .from('public_listings')
      .select('id,brand,size_type,condition,category,gender,price,sale_price,is_verified')
      .eq('status', 'approved')
      .or('is_sold.is.null,is_sold.eq.false')
      .limit(2000)
      .then(({ data }) => { if (data) facetCache = data as FacetRow[]; if (live && data) setFacetRows(data as FacetRow[]); });
    return () => { live = false; };
  }, []);

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

  const toggleInList = (key: string, current: string[], value: string) => {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setParam(key, next.length ? next.join(',') : null);
  };
  const setPrice = (min: number | null, max: number | null) =>
    setParams([['min', min === null ? null : String(min)], ['max', max === null ? null : String(max)]]);

  const facets: Facets = { category, gender, quick, brands, sizes, conditions, min: minPrice, max: maxPrice };
  const countBy = (skip: FacetKey, pick: (r: FacetRow) => string | null) => {
    const m = new Map<string, number>();
    for (const r of facetRows) {
      if (!matchesFacets(r, facets, skip)) continue;
      const k = (pick(r) ?? '').trim();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const toggleParam = (key: string, value: string) => {
    setParam(key, searchParams.get(key) === value ? null : value);
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setParam('search', searchInput.trim() || null);
  };

  const activeFilterCount = [category, gender, quick].filter(Boolean).length
    + brands.length + sizes.length + conditions.length + (minPrice !== null || maxPrice !== null ? 1 : 0);
  const clearAll = () => setSearchParams({}, { replace: true });

  // Everything chosen, as removable chips above the grid.
  const chips: Array<{ label: string; remove: () => void }> = [
    ...(quick === 'verified' ? [{ label: 'Instant Ship', remove: () => setParam('q', null) }] : []),
    ...(quick === 'under_999' ? [{ label: 'Under ₹999', remove: () => setParam('q', null) }] : []),
    ...(quick === 'sale' ? [{ label: 'On Sale', remove: () => setParam('q', null) }] : []),
    ...(gender ? [{ label: gender, remove: () => setParam('gender', null) }] : []),
    ...(category ? [{ label: category, remove: () => selectCategory(null) }] : []),
    ...brands.map((b) => ({ label: b, remove: () => toggleInList('brand', brands, b) })),
    ...sizes.map((z) => ({ label: `Size ${z}`, remove: () => toggleInList('size_type', sizes, z) })),
    ...conditions.map((c) => ({ label: c, remove: () => toggleInList('condition', conditions, c) })),
    ...(minPrice !== null || maxPrice !== null ? [{
      label: minPrice !== null && maxPrice !== null ? `₹${minPrice.toLocaleString('en-IN')} to ₹${maxPrice.toLocaleString('en-IN')}`
        : minPrice !== null ? `From ₹${minPrice.toLocaleString('en-IN')}` : `Up to ₹${maxPrice!.toLocaleString('en-IN')}`,
      remove: () => setPrice(null, null),
    }] : []),
  ];

  const sizeOptions = category ? CATEGORY_SIZES[category] ?? ALL_SIZES : ALL_SIZES;
  const sizeCounts = countBy('size', (r) => r.size_type);
  const brandCounts = countBy('brand', (r) => r.brand);
  const conditionCounts = countBy('condition', (r) => r.condition);
  // Whole shelf, unfiltered: a tab is shown when its category has stock at all.
  const allCategoryCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of facetRows) if (r.category) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [facetRows]);
  const genderCounts = countBy('gender', (r) => r.gender);
  const genderCount = (g: string) => g === 'Unisex'
    ? genderCounts.get('Unisex') ?? 0
    : (genderCounts.get(g) ?? 0) + (genderCounts.get('Unisex') ?? 0);

  // The filter column. The same panel is the desktop sidebar and the body of
  // the phone's sheet, so the two can never offer different filters.
  const filterPanel = (
    <div className="flex flex-col">
      <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 border-b border-black/10 py-3">
        <span className="flex flex-col">
          <span className="text-sm font-bold">Instant Ship</span>
          <span className="text-xs ink-mid">At our hub, dispatched next day</span>
        </span>
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={quick === 'verified'} onChange={() => toggleParam('q', 'verified')} className="h-4 w-4 accent-black" />
        </span>
      </label>

      <PanelSection title="Price" count={minPrice !== null || maxPrice !== null ? 1 : 0} defaultOpen>
        <PriceFilter min={minPrice} max={maxPrice} onApply={setPrice} />
      </PanelSection>

      <PanelSection title="Condition" count={conditions.length} fixed>
        {CONDITIONS.map((c) => (
          <CheckRow key={c.name} label={c.name} count={conditionCounts.get(c.name) ?? 0}
            checked={conditions.includes(c.name)} onChange={() => toggleInList('condition', conditions, c.name)} />
        ))}
      </PanelSection>

      <PanelSection title="Size" count={sizes.length}>
        <div className="grid grid-cols-4 gap-1.5">
          {sizeOptions.map((z) => {
            const n = sizeCounts.get(z) ?? 0;
            const on = sizes.includes(z);
            if (!n && !on) return null;
            return (
              <button key={z} type="button" aria-pressed={on} onClick={() => toggleInList('size_type', sizes, z)}
                className={cn('min-h-[40px] border px-1 text-xs transition-colors',
                  on ? 'border-black bg-black font-bold text-white' : 'border-black/15 hover:border-black')}>
                {z}
              </button>
            );
          })}
        </div>
        {sizeOptions.every((z) => !sizeCounts.get(z)) && !sizes.length && <p className="text-xs ink-mid">No sizes in this selection.</p>}
      </PanelSection>

      <PanelSection title="Brand" count={brands.length}>
        <BrandFilter counts={brandCounts} selected={brands} onToggle={(b) => toggleInList('brand', brands, b)} />
      </PanelSection>

      <PanelSection title="Gender" count={gender ? 1 : 0}>
        {GENDERS.map((g) => (
          <CheckRow key={g} label={g} count={genderCount(g)} radio
            checked={gender === g} onChange={() => toggleParam('gender', g)} />
        ))}
      </PanelSection>
    </div>
  );

  return (
    <div className="flex flex-col pt-20">
      {/* The pitch, above the controls, so a newcomer reads what zarketplace is
          before reaching the grid. */}
      {!isAdminHost && <HeroBanner />}

      {/* No promise ticker between the hero and the shop. The hero already
          says sold and shipped by us, prices upfront, checked; the striped
          tape said it again, louder, and pushed the products down. */}

      {/* The shop's controls, one strip: what you are looking at on the left
          as a row of words, and the tools on the right. It stays where it
          sits rather than following the scroll: pinned, it rode all the way
          down to the footer. The hero's "Shop now" scrolls here (#shop). */}
      <div id="shop" className="scroll-mt-20 border-b border-black/10 bg-white">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          {/* Category is the filter that earns a permanent place: most stock
              is menswear or unisex, so gender barely narrows it, while
              "show me jackets" is how people actually shop. Gender is in the
              filter column. A category with nothing in it is left out once
              the counts are in. Instant Ship sits beside them because "can I
              have it this week" is a question people arrive with. */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-6 overflow-x-auto scrollbar-hide">
            <Tab active={!category && !quick} onClick={() => setParams([['category', null], ['size_type', null], ['q', null]])}>All</Tab>
            {PRODUCT_TYPES.filter((c) => category === c || facetRows.length === 0 || (allCategoryCounts.get(c) ?? 0) > 0).map((c) => (
              <React.Fragment key={c}>
                <Tab active={category === c} onClick={() => selectCategory(category === c ? null : c)}>{c}</Tab>
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
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] w-full px-4 sm:px-6 lg:px-8 pb-16 pt-6 sm:pt-8 flex gap-10">

        <aside aria-label="Filters" className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 scrollbar-hide">
            <div className="flex items-baseline justify-between pb-2">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Filter</h2>
              {activeFilterCount > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-bold underline underline-offset-4">Clear all</button>
              )}
            </div>
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col gap-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={c.remove} aria-label={`Remove ${c.label}`}
                  className="flex min-h-[36px] items-center gap-1.5 border border-black/15 px-3 text-xs hover:border-black">
                  {c.label}<X className="h-3.5 w-3.5" />
                </button>
              ))}
              {chips.length > 1 && (
                <button type="button" onClick={clearAll} className="min-h-[36px] px-1 text-xs font-bold underline underline-offset-4">Clear all</button>
              )}
            </div>
          )}
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

      {/* On a phone the filters live in a sheet, reached from a pill that
          follows the scroll, the way most shopping apps do it. */}
      {!showFilters && (
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="lg:hidden fixed bottom-5 left-1/2 z-40 -translate-x-1/2 flex min-h-[48px] items-center gap-2 whitespace-nowrap bg-black px-6 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter · Sort{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      )}

      {/* Mobile filter sheet */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="relative h-[92dvh] sm:h-auto sm:max-h-[85vh] w-full sm:max-w-lg overflow-y-auto overscroll-contain bg-white border-t sm:border border-black/10 px-5 pt-4 sm:p-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Filters</h2>
              <button onClick={() => setShowFilters(false)} aria-label="Close filters" className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>


            <SheetGroup title="Sort by">
              {SORT_OPTIONS.map((o) => (
                <SheetChip key={o.value} active={sortBy === o.value}
                  onClick={() => setParam('sort', o.value === 'relevance' ? null : o.value)}>
                  {o.label}
                </SheetChip>
              ))}
            </SheetGroup>

            {filterPanel}

            <div className="mt-auto flex gap-3 sticky bottom-0 bg-white py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                Show results
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

// One folding section of the filter column. A count of what is chosen in it
// shows beside the title, so a folded section still says it is filtering.
function PanelSection({ title, count, defaultOpen = false, fixed = false, children }: {
  title: string; count: number; defaultOpen?: boolean; fixed?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen || count > 0);
  if (fixed) return (
    <div className="border-b border-black/10 py-3">
      <h3 className="flex min-h-[36px] items-center text-sm font-bold">{title}{count > 0 ? ` (${count})` : ''}</h3>
      <div className="flex flex-col gap-1 pt-1">{children}</div>
    </div>
  );
  return (
    <div className="border-b border-black/10 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex min-h-[36px] w-full items-center justify-between gap-2 text-left">
        <span className="text-sm font-bold">{title}{count > 0 ? ` (${count})` : ''}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="flex flex-col gap-1 pt-2">{children}</div>}
    </div>
  );
}

const CheckRow: React.FC<{
  label: string; count?: number; checked: boolean; onChange: () => void; radio?: boolean;
}> = ({ label, count, checked, onChange, radio = false }) => {
  return (
    <label className={cn('flex min-h-[36px] cursor-pointer items-center gap-2.5 text-sm', count === 0 && !checked && 'opacity-40')}>
      <input type="checkbox" checked={checked} onChange={onChange}
        className={cn('h-4 w-4 shrink-0 accent-black', radio && 'rounded-full')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs ink-mid">{count}</span>}
    </label>
  );
};

// Brands with a search box over them: the shelf carries dozens, so the list
// shows the biggest few and the search finds the rest.
function BrandFilter({ counts, selected, onToggle }: {
  counts: Map<string, number>; selected: string[]; onToggle: (b: string) => void;
}) {
  const [q, setQ] = React.useState('');
  const [all, setAll] = React.useState(false);
  const names = [...new Set([...counts.keys(), ...selected])]
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
  const needle = q.trim().toLowerCase();
  const matched = needle ? names.filter((n) => n.toLowerCase().includes(needle)) : names;
  // Chosen brands always stay in view, at the top.
  const ordered = [...matched.filter((n) => selected.includes(n)), ...matched.filter((n) => !selected.includes(n))];
  const shown = all || needle ? ordered : ordered.slice(0, Math.max(8, selected.length));
  return (
    <>
      <div className="relative mb-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brands" aria-label="Search brands"
          className="w-full min-h-[40px] border border-black/15 bg-white pl-8 pr-2 text-sm placeholder:text-black/40 focus:border-black focus:outline-none" />
      </div>
      <div className={cn('flex flex-col gap-1', (all || needle) && 'max-h-72 overflow-y-auto')}>
        {shown.map((b) => (
          <CheckRow key={b} label={b} count={counts.get(b) ?? 0} checked={selected.includes(b)} onChange={() => onToggle(b)} />
        ))}
        {needle && shown.length === 0 && <p className="py-2 text-xs ink-mid">No brand called that here.</p>}
      </div>
      {!needle && ordered.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="self-start py-1 text-xs font-bold underline underline-offset-4">
          See all {ordered.length}
        </button>
      )}
    </>
  );
}

// Typed bounds or a quick range. Typed values apply on Go or Enter, not per
// keystroke, so the grid does not reload on every digit.
function PriceFilter({ min, max, onApply }: {
  min: number | null; max: number | null; onApply: (min: number | null, max: number | null) => void;
}) {
  const [lo, setLo] = React.useState(min?.toString() ?? '');
  const [hi, setHi] = React.useState(max?.toString() ?? '');
  React.useEffect(() => { setLo(min?.toString() ?? ''); setHi(max?.toString() ?? ''); }, [min, max]);
  const parse = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
  const apply = (e?: React.FormEvent) => { e?.preventDefault(); onApply(parse(lo), parse(hi)); };
  return (
    <>
      <form onSubmit={apply} className="flex items-center gap-2">
        <input inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value.replace(/[^0-9]/g, ''))} placeholder="₹ Min" aria-label="Minimum price"
          className="min-h-[40px] w-full min-w-0 border border-black/15 px-2 text-sm focus:border-black focus:outline-none" />
        <span className="text-xs">to</span>
        <input inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value.replace(/[^0-9]/g, ''))} placeholder="₹ Max" aria-label="Maximum price"
          className="min-h-[40px] w-full min-w-0 border border-black/15 px-2 text-sm focus:border-black focus:outline-none" />
        <button type="submit" className="min-h-[40px] shrink-0 bg-black px-3 text-xs font-bold text-white">Go</button>
      </form>
      <div className="flex flex-col gap-1 pt-1">
        {PRICE_RANGES.map((r) => (
          <CheckRow key={r.label} label={r.label} radio
            checked={min === r.min && max === r.max}
            onChange={() => (min === r.min && max === r.max ? onApply(null, null) : onApply(r.min, r.max))} />
        ))}
      </div>
    </>
  );
}

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
