import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { ProductGallery } from '../components/ProductGallery';
import { motion } from 'motion/react';
import { Loader2, ArrowLeft, Zap, Heart } from 'lucide-react';
import { log } from '../lib/log';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { ListingCard } from '../components/ListingCard';
import { formatCurrency as fmt } from '../lib/utils';
import { getShippingCategories, shippingRateFor, type ShippingCategory } from '../lib/pricing';
import { conditionByName } from '../lib/condition';
import { usePageMeta, itemName, itemMetaTitle, itemMetaDescription, isDemoTitle, itemPath, skuFromItemParam } from '../lib/pageMeta';
import { toggleFavorite, useFavorites } from '../lib/favorites';

const plog = log('product');

type Unit = 'in' | 'cm';
const CM_PER_INCH = 2.54;

// Inches to the nearest quarter, as a tape reads; centimetres to the nearest
// half. Stored in cm to a millimetre, which is more precision than a hand
// measurement has.
function formatLength(cm: number, unit: Unit): string {
  const v = unit === 'in' ? Math.round((cm / CM_PER_INCH) * 4) / 4 : Math.round(cm * 2) / 2;
  return String(v);
}

// The drawing the vendor measured from, per category (see MEASURE_GUIDES in
// Sell.tsx). Shown to the buyer so both sides mean the same thing by "length".
const MEASURE_GUIDE_BY_CATEGORY: Record<string, string> = {
  Tops: 'measure-tops',
  Outerwear: 'measure-tops',
  Bottoms: 'measure-bottoms',
};

// "Fits like" is the vendor's own size note (the size detail field, where they
// write things like "Fits like XL" or "Oversized"), with the prefix trimmed so
// the row does not read "Fits like: fits like XL". A size read off a chart
// from the measurements was tried and dropped: a tape measured the wrong way
// makes it contradict both the tag and the vendor, and the measurements below
// already give the buyer the real numbers. The one exception is a trouser
// waist, which is arithmetic rather than a guess.
function fitsLikeFor(listing: Listing): string | null {
  const note = listing.size?.replace(/^\s*fits\s+like\s*:?\s*/i, '').trim();
  if (note) return note;
  if (listing.category === 'Bottoms' && listing.waist_cm) {
    // Flat waist doubled is the waistband all the way round.
    return `${Math.round((listing.waist_cm * 2) / CM_PER_INCH)} in waist`;
  }
  return null;
}

// UUIDv4-ish detector. We accept either /product/:id (UUID) or /item/:sku.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buyer-safe columns for the owner/admin fallback read on the base `listings`
// table. Never selects any vendor identity: not seller_email, seller_upi_vpa or
// pickup_address, and not seller_display_name or seller_instagram either. A
// The buyer's copy of a listing carries nothing about who we bought it from.
// It used to carry seller_id so the page could recognise a vendor looking at
// their own item; the view now answers that as an is_mine boolean instead, so
// the key itself never leaves the database.
const SAFE_LISTING_COLUMNS =
  'id, sku, title, brand, description, price, sale_price, category, gender, size_type, size, pit_to_pit_cm, length_cm, sleeve_cm, waist_cm, inseam_cm, outseam_cm, condition, image_url, image_urls, shipping_category, free_shipping, has_flaws, flaws_description, original_tags_attached, original_packaging, item_altered, wear_frequency, authenticity_confirmed, status, is_sold, created_at, updated_at, shipping_mode, is_mine';

export function ProductPage() {
  const params = useParams();
  // /item/zv-83374-levis-501-jeans: only the code finds the item, so a link
  // made before a title change still lands.
  const slug = params.sku ? skuFromItemParam(params.sku) : (params.id || '').trim();
  const navigate = useNavigate();
  const { add, has } = useCart();
  const { user } = useAuth();
  const [authModal, setAuthModal] = React.useState<null | { redirectTo: string; onSuccess?: () => void; message?: string }>(null);
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  React.useEffect(() => { getShippingCategories().then(setShippingCategories); }, []);
  const [loading, setLoading] = React.useState(true);
  const [cartMsg, setCartMsg] = React.useState<string | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  // 'copied' after a copied link; 'manual' when the browser refused both
  // copy methods and the link is shown to copy by hand.
  const [shared, setShared] = React.useState<null | 'copied' | 'manual'>(null);
  const [unit, setUnit] = React.useState<Unit>('in');
  const [showGuide, setShowGuide] = React.useState(false);
  const favorites = useFavorites();
  const [stickyBarVisible, setStickyBarVisible] = React.useState(true);
  const stickyStopRef = React.useRef<HTMLDivElement>(null);

  // The sticky mobile buy bar follows the buyer through the item and leaves
  // as soon as the end of it comes into view, rather than riding over the
  // recommendations and the footer below.
  //
  // Measured on scroll rather than with an IntersectionObserver: an observer
  // only fires when the marker's visibility changes, and a fast fling (or a
  // jump to the bottom) can carry the marker from below the screen to above
  // it without it ever being visible, which left the bar showing over the
  // footer.
  React.useEffect(() => {
    const el = stickyStopRef.current;
    if (!el) return;
    // One rect read per scroll event, and React skips the render when the
    // value has not changed, so this stays cheap without a frame scheduler.
    const update = () => setStickyBarVisible(el.getBoundingClientRect().top > window.innerHeight);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [listing?.id]);

  // The details column stays in view on desktop while the photos scroll past
  // it. When it is taller than the screen, it scrolls with the page until its
  // last line is showing and pins from there, so nothing in it is ever out of
  // reach. Declared above the early returns: hooks after a conditional return
  // crash React (#310).
  const infoRef = React.useRef<HTMLDivElement>(null);
  const [infoTop, setInfoTop] = React.useState(112);
  React.useEffect(() => {
    const el = infoRef.current;
    if (!el) return;
    const update = () => setInfoTop(Math.min(112, window.innerHeight - el.offsetHeight - 32));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [listing?.id]);

  React.useEffect(() => {
    async function fetchListing() {
      if (!slug) return;
      const t = plog.time(`fetch ${slug}`);
      setLoading(true);
      try {
        // SKU lookup is case-insensitive; UUID lookup uses .eq on id.
        const isUuid = UUID_RE.test(slug);
        // Public catalogue read from the safe view first.
        const pub = supabase.from('public_listings').select('*');
        const { data: pubData, error: pubError } = isUuid
          ? await pub.eq('id', slug).maybeSingle()
          : await pub.ilike('sku', slug).maybeSingle();
        if (pubError) throw pubError;

        let data = pubData as Listing | null;
        // The view only exposes approved+unsold rows. Owner/admin arriving from
        // The vendor portal or Admin may be viewing their own pending/sold listing;
        // fall back to the base table (RLS lets owner/admin read it) with safe
        // columns only.
        if (!data && user) {
          const base = supabase.from('listings').select(SAFE_LISTING_COLUMNS);
          const { data: baseData, error: baseError } = isUuid
            ? await base.eq('id', slug).maybeSingle()
            : await base.ilike('sku', slug).maybeSingle();
          if (baseError) throw baseError;
          data = baseData as Listing | null;
        }
        t.end({ found: !!data });
        setListing(data);
      } catch (err) {
        plog.error('fetch THREW', err);
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [slug, user]);

  // A link with no name in it (every link made before names were added), or
  // an old name, moves the address bar to the item's current address without
  // a reload. The code in it is unchanged, so nothing is fetched again.
  React.useEffect(() => {
    if (!listing?.sku) return;
    const want = itemPath(listing);
    if (window.location.pathname !== want) {
      navigate({ pathname: want, search: window.location.search, hash: window.location.hash }, { replace: true });
    }
  }, [listing, navigate]);

  // "You might like": same category first, backfilled with newest listings
  // so the section is never empty while supply is thin.
  const [youMayLike, setYouMayLike] = React.useState<Listing[]>([]);
  React.useEffect(() => {
    if (!listing) return;
    let cancelled = false;
    (async () => {
      const { data: sameCategory } = await supabase
        .from('public_listings')
        .select('*')
        .eq('category', listing.category ?? '')
        .neq('id', listing.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (cancelled) return;
      const picks = (sameCategory as Listing[] | null) ?? [];
      if (picks.length >= 4) { setYouMayLike(picks.slice(0, 4)); return; }

      const { data: fallback } = await supabase
        .from('public_listings')
        .select('*')
        .neq('id', listing.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (cancelled) return;
      const seen = new Set(picks.map((l) => l.id));
      const merged = [...picks, ...((fallback as Listing[] | null) ?? []).filter((l) => !seen.has(l.id))];
      setYouMayLike(merged.slice(0, 4));
    })();
    return () => { cancelled = true; };
  }, [listing]);

  // The tab title, description and canonical for this item, the same ones
  // api/item.ts writes into the first response, so a visit that arrives by
  // clicking through the shop gets them too. Demo items and missing ones are
  // never indexed.
  const metaName = listing ? itemName(listing.title, listing.brand) : 'Pre-owned clothing';
  const metaSize = listing ? (listing.size_type || listing.size) : null;
  usePageMeta({
    title: listing ? itemMetaTitle(metaName, metaSize) : 'Pre-owned clothing',
    description: listing
      ? itemMetaDescription(metaName, metaSize, listing.condition, !!listing.free_shipping)
      : 'Pre-owned clothing, sold and shipped by zarketplace.',
    path: listing ? itemPath(listing) : window.location.pathname,
    noIndex: listing ? isDemoTitle(listing.title) : !loading,
  });

  // The loaded page is several screens tall. A short loading state put the
  // footer on screen, and it then jumped when the listing arrived - a 0.20
  // layout shift, the worst on the site. Trying to skeleton the real layout
  // made it worse (0.42): the guessed heights never match, so the mismatch
  // shifts too.
  //
  // Reserving more than two viewports instead keeps the footer below the fold
  // in both states. A shift that happens off screen is not a shift the buyer
  // sees, and is not counted.
  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] min-h-[220vh] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32" aria-busy="true">
        <div className="flex justify-center pt-24">
          <Loader2 className="h-8 w-8 animate-spin ink-low" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-24 sm:pt-32 pb-16 sm:pb-20 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Listing not found</h1>
        <button onClick={() => navigate('/browse')} className="mt-8 text-xs font-bold uppercase tracking-widest underline">
          Back to browsing
        </button>
      </div>
    );
  }

  const images = listing.image_urls && listing.image_urls.length > 0 
    ? listing.image_urls 
    : [listing.image_url];

  const condition = conditionByName(listing.condition ?? '');
  const fitsLike = fitsLikeFor(listing);
  const guide = MEASURE_GUIDE_BY_CATEGORY[listing.category ?? ''] ?? null;
  const measurements = ([
    ['Pit to pit', listing.pit_to_pit_cm],
    ['Length', listing.length_cm],
    ['Sleeve', listing.sleeve_cm],
    ['Waist (flat)', listing.waist_cm],
    ['Inseam', listing.inseam_cm],
    ['Outseam', listing.outseam_cm],
  ] as Array<[string, number | null | undefined]>)
    .filter((m): m is [string, number] => m[1] != null);




  // Demo items fill the shop for previews and are marked "(Demo)" at the end
  // of the title. They are never for sale; the database refuses the order too.
  const isDemo = /\(demo\)\s*$/i.test(listing.title);
  const purchasable = listing.status === 'approved' && !listing.is_sold && !isDemo;

  // The phone's own share sheet (WhatsApp, Instagram, Messages...) with the
  // cover photo attached where the browser allows files, the link alone where
  // it does not, and a copied link where there is no share sheet at all.
  const onShare = async () => {
    const url = window.location.href;
    const text = `${listing.title} on zarketplace`;
    if (navigator.share) {
      try {
        let files: File[] | undefined;
        try {
          const blob = await fetch(variantUrl(images[0], 'grid')).then((r) => r.blob());
          const file = new File([blob], `${listing.sku || 'zarketplace'}.webp`, { type: blob.type || 'image/webp' });
          if (navigator.canShare?.({ files: [file] })) files = [file];
        } catch { /* share the link alone */ }
        await navigator.share(files ? { files, title: listing.title, text: `${text}\n${url}` } : { title: listing.title, text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    // No share sheet (most desktops): copy the link instead. The async
    // clipboard is refused in some embedded and older browsers, so the
    // selection-based copy is the backstop.
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      copied = document.execCommand('copy');
      field.remove();
    }
    setShared(copied ? 'copied' : 'manual');
    if (copied) setTimeout(() => setShared(null), 2000);
  };

  const handleBuyNow = () => {
    if (!user) {
      setAuthModal({ redirectTo: `/checkout/${listing.id}`, message: 'Sign in to buy.' });
      return;
    }
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-28 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-6 sm:mb-10">
        <ArrowLeft className="h-4 w-4" /> Back to browse
      </Link>

      {/* Photos take the smaller share (about 40/60). They are the vendor's
          own, from a phone, and shown at half a laptop screen wide they looked
          worse than they are. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div className="lg:col-span-5">
          <ProductGallery images={images} alt={listing.title} />
        </div>

        {/* One column, one rhythm. The brand, the name and the price; then the
            facts as a short list; then the buttons; then the detail. Four
            type styles and no icons: a small tracked label for the brand, bold
            for what matters, regular for everything else, and the buttons. */}
        <div
          ref={infoRef}
          className="lg:col-span-7 lg:max-w-[38rem] lg:sticky lg:self-start flex flex-col"
          style={{ top: infoTop }}
        >
          {/* Instant Ship first, as a sign: it is the one thing that differs
              between two otherwise identical items, and it answers "can I have
              it this week" before anything else is read. Only on something
              that can actually be bought. */}
          {purchasable && listing.is_verified && (
            <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5 bg-black px-2.5 py-1 text-xs font-bold text-white">
                <Zap aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                Instant Ship
              </span>
              <span>Dispatched within 48 hours.</span>
            </p>
          )}

          {/* The item by its name, then its price. The brand is a fact about
              it, listed below with the size, not a label over the top: led by
              the brand, a page reads as a wall of logos. */}
          {/* The heart sits beside the name, the same as on every card, so an
              item can be kept from wherever it is seen. */}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{listing.title}</h1>
            {!listing.is_sold && (
              <button
                type="button"
                onClick={() => toggleFavorite(listing)}
                aria-pressed={favorites.has(listing.id)}
                aria-label={favorites.has(listing.id) ? 'Remove from favorites' : 'Add to favorites'}
                className="-mr-3 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <Heart className={cn('h-5 w-5', favorites.has(listing.id) && 'fill-black')} strokeWidth={1.75} />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              {listing.sale_price ? (
                <>
                  <span className="text-xl font-black tabular-nums text-red-600">{formatCurrency(listing.sale_price)}</span>
                  <span className="text-base line-through tabular-nums">{formatCurrency(listing.price)}</span>
                </>
              ) : (
                <span className="text-xl font-black tabular-nums">{formatCurrency(listing.price)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onShare}
              className="shrink-0 text-sm underline underline-offset-4 decoration-black/30 hover:decoration-black"
            >
              {shared === 'copied' ? 'Link copied' : 'Share'}
            </button>
          </div>
          {shared === 'manual' && (
            <input
              readOnly
              autoFocus
              value={window.location.href}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setShared(null)}
              aria-label="Link to this item"
              className="mt-4 w-full border border-black/15 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          )}

          {/* The facts, as a spec list: label, then value, no rules between. */}
          <dl className="mt-8 grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-sm">
            {listing.brand && (
              <>
                <dt>Brand</dt>
                <dd className="font-bold">{listing.brand}</dd>
              </>
            )}
            <dt>Size</dt>
            <dd className="font-bold">{listing.size_type || 'One size'}</dd>
            {fitsLike && (
              <>
                <dt>Fits like</dt>
                <dd className="font-bold">{fitsLike}</dd>
              </>
            )}
            {condition && (
              <>
                <dt>Condition</dt>
                <dd>
                  <Link to="/conditions-guide" className="font-bold underline underline-offset-4 decoration-black/30 hover:decoration-black">
                    {condition.name}
                  </Link>
                  <span className="block leading-relaxed">{condition.desc}</span>
                </dd>
              </>
            )}
            {/* Only ever a positive: an item without the confirmation simply
                has no Authenticity row, never a "not confirmed" one. */}
            {listing.authenticity_confirmed && (
              <>
                <dt>Authenticity</dt>
                <dd className="font-bold">Confirmed</dd>
              </>
            )}
            {listing.free_shipping && (
              <>
                <dt>Delivery</dt>
                <dd className="font-bold">Free</dd>
              </>
            )}
            <dt>Item</dt>
            <dd className="font-bold">{listing.sku || `ZV-${listing.id.slice(0, 8).toUpperCase()}`}</dd>
          </dl>

          <div className="mt-8 flex flex-col gap-3">
            {listing.status !== 'approved' ? (
              <div className="flex flex-col gap-1 border-t border-black pt-4">
                <span className="text-[15px] font-bold">
                  {listing.status === 'pending' ? 'Not on sale yet' : 'Not available'}
                </span>
                <p className="text-sm leading-relaxed">
                  {listing.is_mine === true
                    ? 'We are looking at this item. It goes on sale once you accept our offer, and nobody can buy it before then.'
                    : 'This item is not on sale yet.'}
                </p>
              </div>
            ) : isDemo ? (
              <div className="flex flex-col gap-1 border-t border-black pt-4">
                <span className="text-[15px] font-bold">Demo item, not for sale</span>
                <span className="text-sm">It shows how pieces look on zarketplace. Real stock is on its way.</span>
              </div>
            ) : listing.is_sold ? (
              <div className="w-full border border-black py-5 text-center text-xs font-black uppercase tracking-[0.3em]">
                Sold
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="w-full bg-black py-5 text-center text-xs font-black uppercase tracking-[0.3em] text-white transition-colors hover:bg-zinc-800"
                >
                  Buy it now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (has(listing.id)) { navigate('/cart'); return; }
                    setCartMsg(null);
                    // No account needed to fill a cart: it is kept on this
                    // device and moves to the account at sign-in, which is
                    // asked for at checkout.
                    await add(listing);
                    setCartMsg('Added to cart');
                  }}
                  className="w-full border border-black py-5 text-center text-xs font-black uppercase tracking-[0.3em] text-black transition-colors hover:bg-black hover:text-white"
                >
                  {has(listing.id) ? 'In cart, view cart' : 'Add to cart'}
                </button>
                {cartMsg && <p className="text-sm font-bold">{cartMsg}</p>}
              </>
            )}
          </div>

          {/* One line under the buttons. What the protection covers is one
              click away; spelling it out here pulled the eye off the item. */}
          <p className="mt-5 text-sm leading-relaxed">
            Your order is protected by{' '}
            <Link to="/buyer-protection" className="font-bold underline underline-offset-4 decoration-black/30 hover:decoration-black">Buyer Protection</Link>.
          </p>

          {/* MODEL.md §8: "it did not fit" is the biggest single reason used
              clothing comes back. Inches first; stored in centimetres. */}
          {measurements.length > 0 && (
            <section className="mt-12 flex flex-col gap-4" aria-labelledby="measurements-heading">
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2 id="measurements-heading" className="text-[15px] font-bold">Measurements</h2>
                  {/* How the numbers were taken. On a computer, hover the link
                      and the drawing appears above it (click opens it full
                      size). On a phone there is no hover, so a tap shows it in
                      place, under this line. */}
                  {guide && (
                    <span className="text-sm">
                      (<span className="group/guide relative inline-block">
                        <a
                          href={`/images/${guide}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-expanded={showGuide}
                          onClick={(e) => {
                            if (window.matchMedia('(hover: hover)').matches) return;
                            e.preventDefault();
                            setShowGuide((v) => !v);
                          }}
                          className="underline underline-offset-4 decoration-black/30 hover:decoration-black"
                        >
                          See how we measure
                        </a>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 hidden w-60 border border-black bg-white p-2 opacity-0 transition-opacity duration-150 [@media(hover:hover)]:block group-hover/guide:opacity-100"
                        >
                          <picture>
                            <source srcSet={`/images/${guide}.webp`} type="image/webp" />
                            <img src={`/images/${guide}.png`} alt="" width={720} height={1080} loading="lazy" decoding="async" className="block h-auto w-full" />
                          </picture>
                        </span>
                      </span>)
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-4 text-sm">
                  {/* Two words, the chosen one bold: a unit switch does not
                      need to be a control that looks like a control. */}
                  <span role="group" aria-label="Measurement unit" className="flex items-baseline gap-1.5">
                    {(['in', 'cm'] as Unit[]).map((u, i) => (
                      <React.Fragment key={u}>
                        {i > 0 && <span aria-hidden>/</span>}
                        <button
                          type="button"
                          onClick={() => setUnit(u)}
                          aria-pressed={unit === u}
                          className={cn(unit === u ? 'font-bold' : 'underline underline-offset-4 decoration-black/30 hover:decoration-black')}
                        >
                          {u}
                        </button>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              </div>
              {guide && showGuide && (
                <picture className="[@media(hover:hover)]:hidden">
                  <source srcSet={`/images/${guide}.webp`} type="image/webp" />
                  <img
                    src={`/images/${guide}.png`}
                    alt="How each measurement is taken, drawn on the garment"
                    width={720}
                    height={1080}
                    loading="lazy"
                    decoding="async"
                    className="block h-auto w-full max-w-[16rem] border border-black/10"
                  />
                </picture>
              )}
              <dl className="grid grid-cols-3 gap-x-4 gap-y-5">
                {measurements.map(([label, cm]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <dt className="text-sm">{label}</dt>
                    <dd className="text-lg font-bold tracking-tight tabular-nums">
                      {formatLength(cm, unit)}
                      <span className="ml-1 text-sm font-normal tracking-normal">{unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {(listing.description || listing.has_flaws) && (
            <section id="flaws" className="mt-12 flex scroll-mt-32 flex-col gap-3">
              <h2 className="text-[15px] font-bold">Description</h2>
              {listing.description && (
                <p className="text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
              )}
              {listing.has_flaws && listing.flaws_description && (
                <p className="text-sm leading-relaxed">
                  <span className="font-bold">Flaw:</span> {listing.flaws_description}
                </p>
              )}
            </section>
          )}

          <div ref={stickyStopRef} />

          {listing.is_mine === true && (
            <div className="mt-12 flex flex-col gap-3 border-t border-black pt-4">
              <span className="text-[15px] font-bold">Your item</span>
              <p className="text-sm leading-relaxed">
                Download a post or story image of this item in one click.
              </p>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="self-start border border-black px-6 py-3 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
              >
                Generate Instagram image
              </button>
            </div>
          )}
        </div>
      </div>

      {youMayLike.length > 0 && (
        <section className="mt-16 sm:mt-24 pt-10 sm:pt-12 border-t border-black/5">
          <div className="flex items-end justify-between gap-4 mb-8">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-none">You might like</h2>
            <Link to="/browse" className="shrink-0 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {youMayLike.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {purchasable && stickyBarVisible && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-black/10 px-4 py-3 flex items-center gap-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{listing.title}</p>
            <p className="text-base font-black tabular-nums">
              {formatCurrency(listing.sale_price ?? listing.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuyNow}
            className="shrink-0 bg-black text-white px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] active:scale-[0.98] transition-transform"
          >
            Buy Now
          </button>
        </div>
      )}

      

      <AuthModal
        open={!!authModal}
        onClose={() => setAuthModal(null)}
        redirectTo={authModal?.redirectTo}
        onSuccess={authModal?.onSuccess}
        message={authModal?.message}
      />
      {listing.is_mine === true && (
        <ShareInstagramModal open={shareOpen} onClose={() => setShareOpen(false)} listing={listing} />
      )}
    </div>
  );
}

