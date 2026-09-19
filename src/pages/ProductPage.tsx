import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { ProductGallery } from '../components/ProductGallery';
import { motion } from 'motion/react';
import { Loader2, RotateCcw, ArrowLeft, ArrowUpRight, ShoppingBag, Check, Share2, Link as LinkIcon, ShieldCheck, AlertTriangle } from 'lucide-react';
import { log } from '../lib/log';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { ListingCard } from '../components/ListingCard';
import { formatCurrency as fmt } from '../lib/utils';
import { getShippingCategories, shippingRateFor, type ShippingCategory } from '../lib/pricing';
import { CONDITIONS, conditionByName } from '../lib/condition';

const plog = log('product');

const WEAR_LABELS: Record<string, string> = {
  never: 'Never', '1_2_times': '1-2 Times', occasionally: 'Occasionally', frequently: 'Frequently',
};

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
function fitsLikeFor(listing: Listing): { value: string; note?: string } | null {
  const note = listing.size?.replace(/^\s*fits\s+like\s*:?\s*/i, '').trim();
  if (note) return { value: note };
  if (listing.category === 'Bottoms' && listing.waist_cm) {
    // Flat waist doubled is the waistband all the way round.
    const waist = Math.round((listing.waist_cm * 2) / CM_PER_INCH);
    return { value: `${waist} in waist`, note: 'From the measured waistband' };
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
  const slug = (params.sku || params.id || '').trim();
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
  const [copied, setCopied] = React.useState(false);
  const [unit, setUnit] = React.useState<Unit>('in');
  const [stickyBarVisible, setStickyBarVisible] = React.useState(true);
  const stickyStopRef = React.useRef<HTMLDivElement>(null);

  // The sticky mobile buy bar should only follow the user down to the end of
  // the item description, not all the way to the footer.
  React.useEffect(() => {
    const el = stickyStopRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyBarVisible(entry.boundingClientRect.top > 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [listing?.id]);

  // Swipe state for the mobile carousel. Declared here (not below the
  // loading/not-found early returns) so the hook order stays identical
  // across renders — hooks after a conditional return crash React (#310).





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
      <div className="mx-auto max-w-7xl min-h-[220vh] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32" aria-busy="true">
        <div className="flex justify-center pt-24">
          <Loader2 className="h-8 w-8 animate-spin ink-low" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-24 sm:pt-28 pb-14 sm:pb-20 text-center">
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




  const purchasable = listing.status === 'approved' && !listing.is_sold;

  const handleBuyNow = () => {
    if (!user) {
      setAuthModal({ redirectTo: `/checkout/${listing.id}`, message: 'Sign in to buy.' });
      return;
    }
    navigate(`/checkout/${listing.id}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-28 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-6 sm:mb-10">
        <ArrowLeft className="h-3 w-3" /> Back to browse
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
        {/* One component owns the carousel, the thumbnails and zoom. They
            used to be three behaviours that had grown separately: hover-only
            arrows, a swipe that only moved on release, and a zoom that closed
            on the same tap that opened it. */}
        <div className="lg:col-span-5">
          <ProductGallery images={images} alt={listing.title} />
        </div>

        {/* Product info, in the order a buyer decides in: what it is and what
            it costs, whether it fits, what state it is in, then buy. Who we
            are and how we ship comes last - it is the same on every item, so
            it should not sit between a buyer and the answers that are not. */}
        <div className="lg:col-span-7 flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-[0.95]">{listing.title}</h1>
            <div className="flex items-baseline gap-4">
              {listing.sale_price ? (
                <>
                  <span className="text-3xl font-black text-red-600">{formatCurrency(listing.sale_price)}</span>
                  <span className="text-xl ink-mid line-through font-bold">{formatCurrency(listing.price)}</span>
                </>
              ) : (
                <span className="text-3xl font-black">{formatCurrency(listing.price)}</span>
              )}
            </div>
          </div>

          {/* The three answers a buyer is scanning for, as label and value.
              One row each, so the eye runs straight down the right column. */}
          <dl className="border-t border-black">
            <SpecRow label="Brand">{listing.brand}</SpecRow>
            <SpecRow label="Size">
              {listing.size_type || 'One size'}
            </SpecRow>
            {fitsLike && (
              <SpecRow label="Fits like">
                {fitsLike.value}
                {fitsLike.note && (
                  <span className="ml-3 text-sm font-medium normal-case tracking-normal ink-mid">{fitsLike.note}</span>
                )}
              </SpecRow>
            )}
          </dl>

          {/* All four grades, with this one filled. A grade on its own means
              nothing until you can see where it sits on the scale. */}
          <section className="flex flex-col gap-4" aria-labelledby="condition-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="condition-heading" className="text-[11px] font-black uppercase tracking-[0.2em]">Condition</h2>
              <Link to="/conditions-guide" className="text-[11px] font-black uppercase tracking-[0.2em] underline underline-offset-4 decoration-black/30 hover:decoration-black">
                Condition guide
              </Link>
            </div>
            <ol className="grid grid-cols-4 gap-1">
              {CONDITIONS.map((tier) => {
                const active = tier.name === condition?.name;
                return (
                  <li
                    key={tier.name}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 px-1 border text-center',
                      active ? 'bg-black border-black text-white' : 'border-black/15 ink-mid',
                    )}
                  >
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em]">{tier.name}</span>
                    <span className="text-[10px] font-bold tabular-nums">{tier.grade}</span>
                  </li>
                );
              })}
            </ol>
            {condition && (
              <p className="text-sm leading-relaxed">
                <span className="font-black">{condition.name}.</span> {condition.desc}
              </p>
            )}
            <ul className="flex flex-col gap-2">
              <li className="flex items-center gap-3">
                {listing.has_flaws
                  ? <AlertTriangle className="h-4 w-4 shrink-0" />
                  : <Check className="h-4 w-4 shrink-0" />}
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                  {listing.has_flaws ? 'Flaws disclosed below' : 'No flaws disclosed'}
                </span>
              </li>
              {listing.authenticity_confirmed && (
                <li className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">Authenticity confirmed</span>
                </li>
              )}
            </ul>
          </section>

          {/* MODEL.md §8. Tag size is not enough on used clothing, and "it did
              not fit" is the biggest single reason things come back. Inches
              first, because that is what most people here measure their own
              clothes in; stored in centimetres either way. */}
          {measurements.length > 0 && (
            <section className="flex flex-col gap-4" aria-labelledby="measurements-heading">
              <div className="flex items-center justify-between gap-4">
                <h2 id="measurements-heading" className="text-[11px] font-black uppercase tracking-[0.2em]">Measurements</h2>
                <div className="flex border border-black/15" role="group" aria-label="Measurement unit">
                  {(['in', 'cm'] as Unit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      aria-pressed={unit === u}
                      className={cn(
                        'px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] transition-colors',
                        unit === u ? 'bg-black text-white' : 'text-black hover:bg-black/5',
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <dl className="grid grid-cols-3 border-t border-black/10">
                {measurements.map(([label, cm]) => (
                  <div key={label} className="flex flex-col gap-1 pt-4">
                    <dt className="text-[10px] font-black uppercase tracking-[0.2em] ink-mid">{label}</dt>
                    <dd className="text-xl font-black tracking-tight tabular-nums">
                      {formatLength(cm, unit)}
                      <span className="ml-1 text-xs font-black uppercase">{unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-[13px] leading-relaxed ink-mid">
                Measured flat, by hand. Compare them with something you already own rather than
                going by the tag.
              </p>
              {guide && (
                // The same drawing the vendor measured from. Hover or focus shows
                // it in place on a pointer device; a tap opens it full size in a
                // new tab, which is the only version legible on a phone anyway.
                <div className="group relative self-start">
                  <a
                    href={`/images/${guide}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] underline underline-offset-4 decoration-black/30 hover:decoration-black"
                  >
                    How we measure <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 bottom-full z-30 mb-3 hidden w-72 border border-black bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)] opacity-0 transition-opacity [@media(hover:hover)]:block group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <picture>
                      <source srcSet={`/images/${guide}.webp`} type="image/webp" />
                      <img src={`/images/${guide}.png`} alt="" width={720} height={1080} loading="lazy" decoding="async" className="block h-auto w-full" />
                    </picture>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Flaws, in their own words. Every flaw written down and
              photographed is the thing that actually prevents a return. */}
          {listing.has_flaws && (
            <section className="flex flex-col gap-3 border-l-2 border-black pl-5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">Flaws, stated plainly</h2>
              <p className="text-sm leading-relaxed">{listing.flaws_description}</p>
              <p className="text-[13px] leading-relaxed ink-mid">
                This is a used item and we would rather tell you than have you find out. The flaw
                is in the photos too.
              </p>
            </section>
          )}

          <div className="flex flex-col gap-4">
            {listing.status !== 'approved' ? (
              <div className="w-full border border-amber-200 bg-amber-50 px-6 py-6 flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-700">
                  {listing.status === 'pending' ? 'Pending admin approval' : 'Listing not available'}
                </span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700/80 leading-relaxed">
                  {listing.is_mine === true
                    ? 'Your listing is awaiting admin approval. It will be visible on browse and purchasable once approved. Until then, no one (including you) can buy or add it to cart.'
                    : 'This listing is not yet available to purchase.'}
                </p>
              </div>
            ) : listing.is_sold ? (
              <div className="w-full bg-zinc-100 py-6 text-center text-xs font-black uppercase tracking-[0.3em] ink-mid cursor-not-allowed border border-black/5">
                Sold Out
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="w-full bg-black py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
                >
                  Buy it now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (has(listing.id)) { navigate('/cart'); return; }
                    setCartMsg(null);
                    if (!user) {
                      const target = listing;
                      setAuthModal({
                        redirectTo: `/product/${listing.id}`,
                        message: 'Sign in to add to cart.',
                        onSuccess: async () => {
                          await add(target);
                          setCartMsg('Added to cart');
                        },
                      });
                      return;
                    }
                    await add(listing);
                    setCartMsg('Added to cart');
                  }}
                  className="w-full border border-black py-6 text-center text-xs font-black uppercase tracking-[0.3em] text-black transition-all hover:bg-black hover:text-white flex items-center justify-center gap-3"
                >
                  {has(listing.id) ? (
                    <><Check className="h-4 w-4" /> In cart - view cart</>
                  ) : (
                    <><ShoppingBag className="h-4 w-4" /> Add to cart</>
                  )}
                </button>
                {cartMsg && <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{cartMsg}</p>}
              </>
            )}
          </div>

          <div className="flex flex-col gap-10">
            {listing.description && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">About this piece</h2>
                <p className="text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
              </section>
            )}

            {(listing.original_tags_attached !== null || listing.original_packaging !== null || listing.item_altered !== null || listing.wear_frequency) && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">Item details</h2>
                <dl className="border-t border-black/10">
                  {listing.original_tags_attached !== null && (
                    <SpecRow label="Original tags" quiet>{listing.original_tags_attached ? 'Attached' : 'Not attached'}</SpecRow>
                  )}
                  {listing.original_packaging !== null && (
                    <SpecRow label="Packaging" quiet>{listing.original_packaging ? 'Included' : 'Not included'}</SpecRow>
                  )}
                  {listing.item_altered !== null && (
                    <SpecRow label="Altered" quiet>{listing.item_altered ? 'Yes' : 'No'}</SpecRow>
                  )}
                  {listing.wear_frequency && (
                    <SpecRow label="Worn" quiet>{WEAR_LABELS[listing.wear_frequency] ?? listing.wear_frequency}</SpecRow>
                  )}
                </dl>
              </section>
            )}

            <div ref={stickyStopRef} />

            {/* The same on every item, so it comes last. Sentence case at a
                readable size: this is the part people check before paying, and
                it used to be 9px grey capitals. */}
            <section className="flex flex-col gap-6 border-t border-black pt-8">
              <div className="flex flex-col gap-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em]">Sold &amp; shipped by zarketplace</h2>
                <ul className="flex flex-col gap-2">
                  {[
                    'Bought and owned by us, not listed by someone else.',
                    'Checked against this listing before it ships.',
                    'Dispatched from our own hub, in our own packaging.',
                  ].map((line) => (
                    <li key={line} className="flex gap-3 text-sm leading-relaxed ink-mid">
                      <span aria-hidden>-</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="border-t border-black/10">
                <SpecRow label="Shipping" quiet>
                  {listing.free_shipping
                    ? 'Free'
                    : shippingCategories.length === 0
                      ? 'Calculating...'
                      : fmt(shippingRateFor(listing.shipping_category, shippingCategories))}
                </SpecRow>
                <SpecRow label="Product code" quiet>{listing.sku || `ZV-${listing.id.slice(0, 8).toUpperCase()}`}</SpecRow>
              </dl>

              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-4">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <Link to="/buyer-protection" className="self-start text-[11px] font-black uppercase tracking-[0.2em] underline underline-offset-4">Buyer protection</Link>
                    <p className="text-[13px] leading-relaxed ink-mid">
                      Your payment is held until you confirm delivery, and refunded if the item is
                      significantly not as described.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  <Link to="/returns" className="text-[11px] font-black uppercase tracking-[0.2em] underline underline-offset-4">Returns &amp; cancellations</Link>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCartMsg(null);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="self-start flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.2em] hover:text-black/60 transition-colors"
                >
                  <LinkIcon className="h-4 w-4" />
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
              </div>
            </section>

            {listing.is_mine === true && (
              <div className="mt-4 pt-6 border-t border-black/5 flex flex-col gap-3">
                <span className="text-[9px] font-black uppercase tracking-[0.4em] ink-low">Your listing</span>
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="self-start inline-flex items-center gap-3 border border-black px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" /> Generate Instagram image
                </button>
                <p className="text-[10px] font-bold uppercase tracking-widest ink-low leading-relaxed max-w-md">
                  Download a branded post or story image of your listing in one click.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {youMayLike.length > 0 && (
        <section className="mt-16 sm:mt-24 pt-10 sm:pt-12 border-t border-black/5">
          <div className="flex items-end justify-between gap-4 mb-8">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-none">You might like</h2>
            <Link to="/browse" className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">
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
            <p className="text-[8px] font-black uppercase tracking-widest ink-low truncate">{listing.title}</p>
            <p className="text-lg font-black tracking-tight">
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

function SpecRow({ label, quiet, children }: { label: string; quiet?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-[7.5rem_1fr] items-baseline gap-4 border-b border-black/10', quiet ? 'py-3' : 'py-4')}>
      <dt className="text-[10px] font-black uppercase tracking-[0.2em] ink-mid">{label}</dt>
      <dd className={cn('font-black uppercase tracking-tight', quiet ? 'text-sm' : 'text-base')}>{children}</dd>
    </div>
  );
}
