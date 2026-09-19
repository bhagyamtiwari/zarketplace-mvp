import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { ProductGallery } from '../components/ProductGallery';
import { motion } from 'motion/react';
import { Loader2, RotateCcw, ArrowLeft, ArrowUpRight, ShoppingBag, Check, Share2, ShieldCheck, AlertTriangle, Truck, ChevronRight, Zap } from 'lucide-react';
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

// The column's text roles, named so every instance of a role is identical.
// Two faces only, the site's own: Inter at black weight for labels and
// values, Inter at regular weight for sentences. Nothing below 11px.
const LABEL = 'text-[11px] font-black uppercase tracking-[0.2em] ink-mid';
const LINK = 'text-[11px] font-black uppercase tracking-[0.2em] underline underline-offset-4 decoration-black/30 hover:decoration-black transition-colors';
const VALUE = 'text-lg sm:text-xl font-black tracking-tight leading-none';

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
  // 'copied' after a copied link; 'manual' when the browser refused both
  // copy methods and the link is shown to copy by hand.
  const [shared, setShared] = React.useState<null | 'copied' | 'manual'>(null);
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-28 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-6 sm:mb-10">
        <ArrowLeft className="h-3 w-3" /> Back to browse
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
        {/* Pinned on desktop, so the garment stays in view while the facts
            about it scroll past. */}
        <div className="lg:col-span-6 lg:sticky lg:top-28 lg:self-start">
          <ProductGallery images={images} alt={listing.title} />
        </div>

        {/* One typographic rule runs the column: facts about this garment are
            in the serif, everything of ours is in Inter. And one editing rule:
            only what a buyer needs to decide is on the page. What is the same
            on every item is one line each, linked to the page that has the
            rest. */}
        <div className="lg:col-span-6 flex flex-col lg:max-w-[32rem]">
          <header className="flex flex-col gap-4 pb-8">
            <div className="flex items-start justify-between gap-6">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.9]">{listing.title}</h1>
              <div className="relative mt-1 shrink-0">
                <button
                  type="button"
                  onClick={onShare}
                  aria-label="Share"
                  className="flex h-9 w-9 items-center justify-center border border-black/15 transition-colors hover:border-black"
                >
                  {shared === 'copied' ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                </button>
                {shared === 'copied' && (
                  <span role="status" className="absolute right-0 top-full mt-2 whitespace-nowrap text-[11px] font-black uppercase tracking-[0.2em] ink-mid">
                    Link copied
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline gap-4">
              {listing.sale_price ? (
                <>
                  <span className="text-2xl font-black text-red-600">{formatCurrency(listing.sale_price)}</span>
                  <span className="text-base ink-mid line-through font-bold">{formatCurrency(listing.price)}</span>
                </>
              ) : (
                <span className="text-2xl font-black">{formatCurrency(listing.price)}</span>
              )}
            </div>
            {shared === 'manual' && (
              <input
                readOnly
                autoFocus
                value={window.location.href}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => setShared(null)}
                aria-label="Link to this item"
                className="w-full border border-black/15 px-3 py-2 text-xs font-medium focus:border-black focus:outline-none"
              />
            )}
          </header>

          <dl className={cn('grid border-y border-black', fitsLike ? 'grid-cols-3' : 'grid-cols-2')}>
            {([
              ['Brand', listing.brand || 'Vintage'],
              ['Listed size', listing.size_type || 'One size'],
              ...(fitsLike ? [['Fits like', fitsLike]] : []),
            ] as Array<[string, string]>).map(([label, value], i) => (
              <div key={label} className={cn('flex min-w-0 flex-col gap-3 py-5', i > 0 && 'border-l border-black/10 pl-4 sm:pl-5')}>
                <dt className={LABEL}>{label}</dt>
                <dd className={cn(VALUE, 'break-words')}>{value}</dd>
              </div>
            ))}
          </dl>

          {/* The four grades as one scale, this item's filled. What a grade
              means is a hover (or a tap) away, not a sentence always there. */}
          <section className="flex flex-col gap-4 border-b border-black/10 py-6" aria-labelledby="condition-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="condition-heading" className={LABEL}>Condition</h2>
              {listing.authenticity_confirmed && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Authenticity confirmed
                </span>
              )}
            </div>
            <ol className="grid grid-cols-4 gap-1.5">
              {CONDITIONS.map((tier, i) => {
                const active = tier.name === condition?.name;
                return (
                  <li key={tier.name} className="group/tier relative">
                    <button
                      type="button"
                      aria-describedby={`tier-${i}`}
                      aria-current={active ? 'true' : undefined}
                      className="flex w-full flex-col gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4"
                    >
                      <span aria-hidden className={cn('block h-[3px] w-full transition-colors', active ? 'bg-black' : 'bg-black/10 group-hover/tier:bg-black/30')} />
                      <span className="flex h-6 items-end justify-between gap-1">
                        {active ? (
                          <span className="text-sm font-black uppercase tracking-[0.1em]">{tier.name}</span>
                        ) : (
                          <span className="text-[11px] font-black uppercase tracking-[0.15em] ink-mid">{tier.name}</span>
                        )}
                        {active && <span className="text-[11px] font-black tabular-nums">{tier.grade}</span>}
                      </span>
                    </button>
                    <span
                      id={`tier-${i}`}
                      role="tooltip"
                      className={cn(
                        'pointer-events-none absolute bottom-full z-30 mb-3 w-60 bg-black p-4 text-white opacity-0 transition-opacity duration-150',
                        'group-hover/tier:opacity-100 group-focus-within/tier:opacity-100',
                        i === 0 ? 'left-0' : i === CONDITIONS.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                      )}
                    >
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-white/70">
                        {tier.name} &middot; {tier.grade}
                      </span>
                      <span className="block text-sm leading-snug">{tier.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* MODEL.md §8: "it did not fit" is the biggest single reason used
              clothing comes back. Inches first; stored in centimetres. */}
          {measurements.length > 0 && (
            <section className="flex flex-col gap-4 border-b border-black/10 py-6" aria-labelledby="measurements-heading">
              <div className="flex items-center justify-between gap-4">
                <h2 id="measurements-heading" className={LABEL}>Measurements, flat</h2>
                <div className="flex items-center gap-4">
                  {guide && (
                    // The drawing the vendor measured from: on hover where a
                    // pointer exists, full size in a new tab on click or tap.
                    <div className="group/guide relative">
                      <a href={`/images/${guide}.png`} target="_blank" rel="noopener noreferrer" className={cn(LINK, 'inline-flex items-center gap-1')}>
                        Guide <ArrowUpRight className="h-3 w-3" />
                      </a>
                      <div
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-full z-30 mt-3 hidden w-72 border border-black bg-white p-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)] opacity-0 transition-opacity duration-150 [@media(hover:hover)]:block group-hover/guide:opacity-100 group-focus-within/guide:opacity-100"
                      >
                        <picture>
                          <source srcSet={`/images/${guide}.webp`} type="image/webp" />
                          <img src={`/images/${guide}.png`} alt="" width={720} height={1080} loading="lazy" decoding="async" className="block h-auto w-full" />
                        </picture>
                      </div>
                    </div>
                  )}
                  <div className="flex border border-black/15" role="group" aria-label="Measurement unit">
                    {(['in', 'cm'] as Unit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnit(u)}
                        aria-pressed={unit === u}
                        className={cn(
                          'px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] transition-colors',
                          unit === u ? 'bg-black text-white' : 'text-black hover:bg-black/5',
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-5">
                {measurements.map(([label, cm]) => (
                  <div key={label} className="flex flex-col gap-2">
                    <dt className={LABEL}>{label}</dt>
                    <dd className={cn(VALUE, 'tabular-nums')}>
                      {formatLength(cm, unit)}
                      <span className="ml-1 text-[11px] font-black uppercase ink-mid">{unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="flex flex-col gap-3 py-8">
            {listing.status !== 'approved' ? (
              <div className="w-full border border-amber-200 bg-amber-50 px-6 py-6 flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.4em] text-amber-700">
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
                {cartMsg && <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">{cartMsg}</p>}
              </>
            )}
          </div>

          {/* What is the same on every item: one line each, right under the
              button where a buyer checks it, linked to the page with the rest. */}
          <ul className="flex flex-col border-t border-black/10">
            {[
              listing.is_verified
                ? {
                  icon: Zap, title: 'Instant ship', to: '/shipping-policy',
                  body: listing.free_shipping
                    ? 'Already in our hub. Dispatched within 48 hours, free tracked delivery.'
                    : 'Already in our hub. Dispatched within 48 hours, tracked delivery.',
                }
                : {
                  icon: Truck, title: 'Sold & shipped by zarketplace', to: '/buyer-protection',
                  body: listing.free_shipping
                    ? 'Checked at our hub, then free tracked delivery to your door.'
                    : 'Checked at our hub, then tracked delivery to your door.',
                },
              { icon: ShieldCheck, title: 'Buyer protection', to: '/buyer-protection', body: 'Not as described? Tell us within 7 days for a full refund.' },
              { icon: RotateCcw, title: 'Returns & cancellations', to: '/returns', body: 'Cancel any time before it ships.' },
            ].map(({ icon: Icon, title, body, to }) => (
              <li key={title} className="border-b border-black/10">
                <Link to={to} className="group flex items-center gap-4 py-4">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">{title}</span>
                    <span className="text-[13px] leading-snug ink-mid">{body}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 ink-mid transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>

          {(listing.description || listing.has_flaws) && (
            <section id="flaws" className="flex scroll-mt-32 flex-col gap-4 py-8">
              <h2 className={LABEL}>Details</h2>
              {listing.description && (
                <p className="text-[15px] leading-relaxed whitespace-pre-line">{listing.description}</p>
              )}
              {listing.has_flaws && listing.flaws_description && (
                <p className="flex gap-2 text-sm leading-relaxed">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><span className="font-black">Flaw:</span> {listing.flaws_description}</span>
                </p>
              )}
            </section>
          )}

          <div ref={stickyStopRef} />

          <p className={cn(LABEL, 'pt-2')}>
            Product code {listing.sku || `ZV-${listing.id.slice(0, 8).toUpperCase()}`}
          </p>

          <div className="flex flex-col">

            {listing.is_mine === true && (
              <div className="mt-4 pt-6 border-t border-black/5 flex flex-col gap-3">
                <span className="text-[11px] font-black uppercase tracking-[0.4em] ink-mid">Your listing</span>
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="self-start inline-flex items-center gap-3 border border-black px-6 py-3 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" /> Generate Instagram image
                </button>
                <p className="text-[11px] font-bold uppercase tracking-widest ink-mid leading-relaxed max-w-md">
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
            <p className="text-[11px] font-black uppercase tracking-widest ink-mid truncate">{listing.title}</p>
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

