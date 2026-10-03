// Your Items: the selling side of an account.
//
// One account both buys and sells, so the two sides live on two pages that
// say which is which: My Orders is what you bought from us, Your Items is
// what you have asked us to buy from you. This page is only the second.
//
// One column, the site's reading width, two tabs:
//   Items    your payouts at the top, then what needs you, what is in your
//            home, what is moving, what sold
//   Share    a branded Instagram image of anything live, if you want one
//
// Payouts have their own tab again (/account/payouts): the estimate counted
// up, a bar of how much is secured, and every item with its own number and
// time left. Your items keeps a one-line summary that links there.
//
// It used to be a sidebar (your email, counts, a nav in tracked caps, an
// "Other" group holding one link) beside uppercase tables. The sidebar said
// nothing the page did not, and the tables were the old admin register.
//
// Nothing here reads an order, a buyer or a resale price. A vendor sees one
// number per item: their own payout.

import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { scrollToTop } from '../lib/scrollToTop';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { AccountLayout } from '../components/AccountLayout';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { log } from '../lib/log';
import { usePageMeta, META, isDemoTitle } from '../lib/pageMeta';
import { ui } from '../lib/ui';
import {
  getVendorOffers, vendorStatus, withdrawItem, canWithdraw, canDelete, getInboundShipments, pickedUp, cancelSoldItem,
  type VendorOffer, type VendorStatusView, type InboundShipment,
} from '../lib/acquisition';
import { Loading } from '../components/Loading';

const splog = log('seller');

export type PortalTab = 'listings' | 'tools';

export type PortalView = 'items' | 'payouts';

export function SellerPortal({ view = 'items' }: { view?: PortalView }) {
  usePageMeta(view === 'payouts' ? META.vendorPayouts : META.vendorPortal);

  return (
    <RequireAuth message={view === 'payouts' ? 'Sign in to see your payouts.' : 'Sign in to see your items.'}>
      <SellerInner view={view} />
    </RequireAuth>
  );
}

function SellerInner({ view }: { view: PortalView }) {
  const { user } = useAuth();
  // Deep-linkable: /vendor-portal?tab=tools lands straight on Share. The old
  // ?tab=payouts lands on Items, which is where payouts are now.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: PortalTab = searchParams.get('tab') === 'tools' ? 'tools' : 'listings';
  const [tab, setTabState] = React.useState<PortalTab>(initialTab);
  const setTab = React.useCallback((next: PortalTab) => {
    setTabState(next);
    scrollToTop();
    const p = new URLSearchParams(searchParams);
    if (next === 'listings') p.delete('tab');
    else p.set('tab', next);
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  const [loading, setLoading] = React.useState(false);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [offers, setOffers] = React.useState<Map<string, VendorOffer>>(new Map());
  const [shipments, setShipments] = React.useState<Map<string, InboundShipment>>(new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const deleteListing = async (l: Listing) => {
    const warn = l.is_sold
      ? `"${l.title}" has already been sold. Deleting removes it from this page but keeps the order record. Continue?`
      : `Delete "${l.title}"? This permanently removes it and cannot be undone.`;
    if (!window.confirm(warn)) return;
    setDeletingId(l.id);
    setError(null);
    try {
      const { error: delErr } = await supabase.from('listings').delete().eq('id', l.id);
      if (delErr) throw delErr;
      setListings((prev) => prev.filter((x) => x.id !== l.id));
    } catch (err: any) {
      splog.error('deleteListing', err);
      setError(err?.message ?? 'Failed to delete this item');
    } finally {
      setDeletingId(null);
    }
  };

  const fetchAll = React.useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      // The vendor's items and their own offers. Orders are deliberately not
      // fetched: this page has no buyer-side data to show, so it asks for none.
      const [{ data: l, error: le }, offerRows] = await Promise.all([
        supabase.from('listings').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
        getVendorOffers(),
      ]);
      if (le) throw le;
      // Demo items (titles ending in "(Demo)") were never real submissions:
      // they are left out so Your Items shows only what was actually sent.
      const mine = ((l as Listing[]) ?? []).filter((x) => !isDemoTitle(x.title));
      setListings(mine);
      setOffers(new Map(offerRows.map((o) => [o.listing_id, o])));
      // The courier leg for anything sold: its label, and whether it has been
      // collected. Missing it only costs the label link, so it never fails the page.
      try {
        const legs = await getInboundShipments(mine.filter((x) => x.is_sold).map((x) => x.id));
        setShipments(new Map(legs.map((sh) => [sh.listing_id, sh])));
      } catch (shipErr) {
        splog.warn('shipments', shipErr);
      }
    } catch (err: any) {
      splog.error('fetchAll', err);
      setError(err?.message ?? 'Failed to load your items');
    } finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <VendorPortalView
      view={view}
      tab={tab}
      onTab={setTab}
      listings={listings}
      offers={offers}
      shipments={shipments}
      loading={loading}
      error={error}
      onDelete={deleteListing}
      deletingId={deletingId}
      onChanged={fetchAll}
    />
  );
}

const NO_SHIPMENTS = new Map<string, InboundShipment>();

/**
 * What a sold item's row says, from what we know after the sale: the offer's
 * intake status, and the courier leg if one is booked. vendorStatus reads the
 * offer alone, so it cannot tell collected from waiting, or checked from
 * accepted, and it does not know an Instant Ship item never leaves our shelf.
 */
function afterSale(l: Listing, offer: VendorOffer | undefined, ship: InboundShipment | undefined, base: VendorStatusView): VendorStatusView {
  if (!l.is_sold) return base;
  // Instant Ship is stock already with us: the sale asks nothing of the vendor.
  if (l.is_verified && (base.key === 'sold' || base.key === 'awaiting_pickup')) {
    return { key: 'sold', label: 'Sold', detail: 'It is already with us, so there is nothing to send. We pay you once we have checked it.', needsAction: false };
  }
  if (base.key === 'awaiting_pickup' && pickedUp(ship)) {
    return { key: 'in_transit', label: 'On its way to us', detail: 'We pay you once it arrives and passes our check.', needsAction: false };
  }
  if (offer?.intake_status === 'accepted_into_inventory') {
    return { ...base, label: 'Accepted', detail: 'Checked and accepted. Your payout is on its way.' };
  }
  if (base.key === 'paid' && offer?.paid_at) {
    return { ...base, detail: `Sent to your UPI ID on ${formatDate(offer.paid_at)}.` };
  }
  return base;
}

/** The page, from data. Kept apart from the fetching so it can be looked at. */
export function VendorPortalView({ view = 'items', tab, onTab, listings, offers, shipments = NO_SHIPMENTS, loading, error, onDelete, deletingId, onChanged }: {
  view?: PortalView;
  tab: PortalTab;
  onTab: (t: PortalTab) => void;
  listings: Listing[];
  offers: Map<string, VendorOffer>;
  shipments?: Map<string, InboundShipment>;
  loading: boolean;
  error: string | null;
  onDelete: (l: Listing) => void;
  deletingId: string | null;
  onChanged: () => void;
}) {
  const statusOf = React.useCallback(
    (l: Listing) => afterSale(l, offers.get(l.id), shipments.get(l.id), vendorStatus(l.status, !!l.is_sold, offers.get(l.id))),
    [offers, shipments],
  );

  // The patient lane's defining fact, given its own shelf: these are the items
  // physically in the vendor's home right now, on sale, waiting for a buyer.
  const withYou = listings.filter((l) => {
    const k = statusOf(l).key;
    return k === 'live' || k === 'live_check_due';
  });
  // Bought and not yet handed over: the one time a vendor has a deadline, so
  // it has its own section at the top rather than sharing "Needs you".
  const shipNow = listings.filter((l) => {
    const k = statusOf(l).key;
    return k === 'awaiting_pickup' || (k === 'sold' && !l.is_verified);
  });
  const needsYou = listings.filter((l) => statusOf(l).needsAction && !withYou.includes(l) && !shipNow.includes(l));
  const sold = listings.filter((l) => l.is_sold && !needsYou.includes(l) && !shipNow.includes(l));
  const inProgress = listings.filter((l) => !l.is_sold && !withYou.includes(l) && !needsYou.includes(l) && !shipNow.includes(l));

  if (view === 'payouts') {
    return (
      <AccountLayout tab="payouts">
        {error && <p className={ui.error}>{error}</p>}
        {loading ? <Loading className="h-64" /> : <PayoutsView listings={listings} offers={offers} statusOf={statusOf} />}
      </AccountLayout>
    );
  }

  return (
    <AccountLayout tab="items">
      <div className="flex flex-col gap-8">
        {/* Sending another item is the thing to do most often from here, so
            it is the one button on the page, beside the item tabs. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex items-center gap-6" aria-label="Your items">
          <TabButton active={tab === 'listings'} onClick={() => onTab('listings')}>
            Items{listings.length > 0 ? ` (${listings.length})` : ''}
          </TabButton>
          <TabButton active={tab === 'tools'} onClick={() => onTab('tools')}>Share</TabButton>
        </nav>
          <Link to="/sell" className={cn(ui.btnPrimary, 'shrink-0')}>Sell another item</Link>
        </div>

        {error && <p className={ui.error}>{error}</p>}

        {loading ? (
          <Loading className="h-64" />
        ) : tab === 'listings' ? (
          listings.length === 0 ? (
            <div className="flex flex-col items-start gap-6">
              <p className={ui.help}>Nothing here yet. Tell us about something you want to sell and we will make you an offer, usually within 24 hours.</p>
              <Link to="/sell" className={ui.btnPrimary}>Get an offer</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-14">
              <PayoutStrip listings={listings} offers={offers} statusOf={statusOf} />
              {shipNow.length > 0 && <ShipNow rows={shipNow} offers={offers} shipments={shipments} onChanged={onChanged} />}
              {needsYou.length > 0 && <NeedsYou rows={needsYou} offers={offers} statusOf={statusOf} onDelete={onDelete} deletingId={deletingId} />}
              {withYou.length > 0 && <WithYou rows={withYou} offers={offers} statusOf={statusOf} onChanged={onChanged} />}
              {inProgress.length > 0 && (
                <ItemSection title="In progress">
                  {inProgress.map((l) => (
                    <React.Fragment key={l.id}>
                      <ItemRow listing={l} offer={offers.get(l.id)} status={statusOf(l)}>
                        {canDelete(offers.get(l.id), !!l.is_sold) && (
                          <button
                            type="button"
                            onClick={() => onDelete(l)}
                            disabled={deletingId === l.id}
                            className={cn(ui.link, 'disabled:opacity-50')}
                          >
                            {deletingId === l.id ? 'Deleting' : 'Delete'}
                          </button>
                        )}
                      </ItemRow>
                    </React.Fragment>
                  ))}
                </ItemSection>
              )}
              {sold.length > 0 && (
                <ItemSection title="Sold">
                  {sold.map((l) => (
                    <React.Fragment key={l.id}>
                      <ItemRow listing={l} offer={offers.get(l.id)} status={statusOf(l)} />
                    </React.Fragment>
                  ))}
                </ItemSection>
              )}
            </div>
          )
        ) : (
          <ShareTab listings={listings.filter((l) => withYou.includes(l))} />
        )}
      </div>
    </AccountLayout>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px min-h-[44px] border-b-2 text-sm font-bold transition-colors',
        active ? 'border-black' : 'border-transparent hover:border-black/30',
      )}
    >
      {children}
    </button>
  );
}

function ItemSection({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className={ui.sectionTitle}>{title}</h2>
        {intro && <p className={ui.help}>{intro}</p>}
      </div>
      <ul className="flex flex-col border-b border-black/10">{children}</ul>
    </section>
  );
}

/** The vendor's own number, or an honest placeholder while there isn't one. */
function payoutLabel(offer: VendorOffer | undefined): string | null {
  if (!offer) return null;
  if (offer.offer_amount == null) return offer.offer_status === 'pending_pricing' ? 'Offer pending' : null;
  return formatCurrency(Number(offer.offer_amount));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// One item, one row: the photo, what it is, where it stands in a sentence,
// and the one number that is the vendor's (their payout) on the right.
function ItemRow({ listing, offer, status, aside, children, showStatus = true }: {
  listing: Listing;
  offer: VendorOffer | undefined;
  status: VendorStatusView;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  /** Off where the section heading already says it ("With you now"). */
  showStatus?: boolean;
}) {
  const payout = payoutLabel(offer);
  return (
    <li className="flex gap-4 border-t border-black/10 py-5">
      <Link to={`/product/${listing.id}`} className="h-20 w-[60px] shrink-0 overflow-hidden bg-zinc-100">
        <img src={variantUrl(listing.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <Link to={`/product/${listing.id}`} className="text-[15px] font-bold leading-snug hover:underline underline-offset-4">
          {listing.title}
        </Link>
        {showStatus && <span className="font-bold">{status.label}</span>}
        {showStatus && status.detail && <span className="leading-relaxed">{status.detail}</span>}
        {/* Each half kept whole, so a narrow screen breaks between them
            rather than leaving the year on a line of its own. */}
        <span>
          {listing.sku && <><span className="whitespace-nowrap">{listing.sku}</span> · </>}
          <span className="whitespace-nowrap">Added {formatDate(listing.created_at)}</span>
        </span>
        {children && <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{children}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {payout && <span className="text-xl sm:text-2xl font-black tracking-tight tabular-nums">{payout}</span>}
        {/* Always captioned, so the number is never read as a sale price. */}
        {payout && offer?.offer_amount != null && (
          <span className="text-sm">{status.key === 'paid' ? 'Paid to you' : 'Your payout'}</span>
        )}
        {aside}
      </div>
    </li>
  );
}

// Bought and waiting on the vendor: the one time they have a deadline. A card
// each, like an open offer, because each has its own date and its own label.
function ShipNow({ rows, offers, shipments, onChanged }: {
  rows: Listing[];
  offers: Map<string, VendorOffer>;
  shipments: Map<string, InboundShipment>;
  onChanged: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className={ui.sectionTitle}>Ship now</h2>
      <div className="flex flex-col gap-6">
        {rows.map((l) => (
          <ShipNowCard key={l.id} listing={l} offer={offers.get(l.id)} shipment={shipments.get(l.id)} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function handOverDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Everything a vendor needs once their item is bought, and nothing else: the
 * date, three steps, their payout, and the consequence of missing the date
 * (MODEL.md §5; the seller terms on How selling works say the same).
 */
export function ShipNowCard({ listing, offer, shipment, onChanged }: {
  key?: string;
  listing: Listing;
  offer: VendorOffer | undefined;
  shipment: InboundShipment | undefined;
  onChanged: () => void;
}) {
  const by = offer?.ship_by_deadline ?? null;
  const overdue = !!by && new Date(by).getTime() < Date.now();
  const label = shipment?.label_url ?? null;
  const payout = offer?.offer_amount != null ? formatCurrency(Number(offer.offer_amount)) : null;

  return (
    <article className="flex flex-col gap-6 border-2 border-black p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <Link to={`/product/${listing.id}`} className="h-24 w-[72px] shrink-0 overflow-hidden bg-zinc-100">
          <img src={variantUrl(listing.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
        </Link>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-bold">Sold</span>
          <span className="text-[15px] font-bold leading-snug">{listing.title}</span>
          {listing.sku && <span>{listing.sku}</span>}
        </div>
      </div>

      {by && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold">{overdue ? 'This was due' : 'Hand it over by'}</span>
          <p className={cn('text-3xl sm:text-4xl font-black tracking-tighter leading-none', overdue && 'text-red-700')}>{handOverDate(by)}</p>
          {overdue && <p className="text-sm">Hand it over today, or tell us below.</p>}
        </div>
      )}

      <ol className="flex flex-col gap-3 text-sm leading-relaxed">
        <Step n={1}>Pack it, exactly as in your photos.</Step>
        <Step n={2}>
          {label ? (
            <span className="flex flex-col items-start gap-2">
              <span>Your prepaid label is ready. Print it and stick it on the parcel.</span>
              <a href={label} target="_blank" rel="noopener noreferrer" className={cn(ui.link, 'font-bold')}>Download label</a>
              {(shipment?.courier || shipment?.awb) && (
                <span className="text-xs">{[shipment?.courier, shipment?.awb && `Tracking ${shipment.awb}`].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          ) : (
            <>Look out for your prepaid label by email or WhatsApp.</>
          )}
        </Step>
        <Step n={3}>A courier collects it from your door, usually within 48 hours.</Step>
      </ol>

      {payout && (
        <p className="text-sm">Your payout: <span className="font-bold">{payout}</span>, paid once it reaches us and passes our check.</p>
      )}

      <p className="text-xs leading-relaxed">
        We will contact you if we need anything.{' '}
        {overdue
          ? 'The date has passed, so we may cancel the order at any time, and it counts against your account.'
          : by
            ? `If it is not handed over by ${handOverDate(by)}, we cancel the order and it counts against your account.`
            : 'If it is not handed over in time, we cancel the order and it counts against your account.'}
      </p>

      <CantSend listing={listing} onChanged={onChanged} />
    </article>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black leading-none text-white">{n}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

// The honest way out, which the reminder email already points here for. It
// costs the vendor less than letting the date pass, and it lets us refund the
// buyer today instead of on the deadline.
function CantSend({ listing, onChanged }: { listing: Listing; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(ui.link, 'self-start text-sm')}>
        Can't send it?
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || busy) return;
    if (!window.confirm(`Cancel the sale of "${listing.title}"? The buyer is refunded, and it counts against your account, though less than missing the date.`)) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSoldItem(listing.id, reason.trim());
      onChanged();
    } catch (err: any) {
      setError(err?.message ?? 'That did not work. Try again, or get in touch.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-black/10 pt-5">
      <label htmlFor={id} className={ui.label}>What happened?</label>
      <textarea
        id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required
        className="w-full border border-black/20 px-3 py-2.5 text-sm focus:border-black focus:outline-none"
      />
      {error && <p role="alert" className={ui.error}>{error}</p>}
      <div className="flex flex-wrap items-center gap-5">
        <button type="submit" disabled={busy || !reason.trim()} className={cn(ui.btnPrimary, 'disabled:opacity-50')}>
          {busy ? 'Cancelling' : 'Cancel this sale'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className={cn(ui.link, 'text-sm')}>Keep it</button>
      </div>
    </form>
  );
}

// An open offer is the one thing a vendor is actually waiting for, so it is
// the loudest thing on the page: the number at display size, and what
// accepting does said outright (people did not know accepting is what puts
// the item on sale). Anything else that needs them is a row with a way in.
function NeedsYou({ rows, offers, statusOf, onDelete, deletingId }: {
  rows: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
  onDelete: (l: Listing) => void;
  deletingId: string | null;
}) {
  const withOffer = rows.filter((l) => statusOf(l).key === 'offer_ready');
  const others = rows.filter((l) => statusOf(l).key !== 'offer_ready');

  return (
    <div className="flex flex-col gap-4">
      {withOffer.map((l) => (
        <OfferReadyCard key={l.id} listing={l} amount={offers.get(l.id)?.offer_amount ?? null} expiresAt={offers.get(l.id)?.offer_expires_at ?? null} />
      ))}

      {others.length > 0 && (
        <ItemSection title="Needs you">
          {others.map((l) => (
            <React.Fragment key={l.id}>
              <ItemRow listing={l} offer={offers.get(l.id)} status={statusOf(l)}>
                <Link to={`/offer/${l.id}`} className={cn(ui.link, 'font-bold')}>Open</Link>
                {canDelete(offers.get(l.id), !!l.is_sold) && (
                  <button
                    type="button"
                    onClick={() => onDelete(l)}
                    disabled={deletingId === l.id}
                    className={cn(ui.link, 'disabled:opacity-50')}
                  >
                    {deletingId === l.id ? 'Deleting' : 'Delete'}
                  </button>
                )}
              </ItemRow>
            </React.Fragment>
          ))}
        </ItemSection>
      )}
    </div>
  );
}

/**
 * An open offer: the photo they sent (an offer lands days later, and the
 * number means nothing until the item is recognised), the number, how long
 * it stands, and the way in. One compact row, not a poster: it should be
 * the first thing seen, not the only thing on the screen.
 */
export function OfferReadyCard({ listing, amount, expiresAt }: { key?: string; listing: Listing; amount: number | null; expiresAt?: string | null }) {
  const left = daysUntil(expiresAt);
  return (
    <Link to={`/offer/${listing.id}`}
      className="group flex items-center gap-4 border-2 border-black bg-white p-3 sm:gap-5 sm:p-4 hover:bg-amber-50 transition-colors">
      <div className="relative h-20 w-[60px] shrink-0 overflow-hidden bg-zinc-100">
        <img src={variantUrl(listing.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]">
          <span aria-hidden className="h-2 w-2 rounded-full bg-amber-400 ring-4 ring-amber-400/30" />
          Offer ready
        </span>
        <span className="truncate text-[15px] font-bold leading-snug">{listing.title}</span>
        {expiresAt && (
          <span className={cn('text-xs', left != null && left <= 2 && 'font-bold text-red-700')}>
            {left === 0 ? 'Last day to accept' : `Accept by ${formatDay(expiresAt)}${left != null ? `, ${left} day${left === 1 ? '' : 's'} left` : ''}`}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {amount != null && (
          <span className="text-2xl sm:text-3xl font-black tracking-tighter leading-none tabular-nums">{formatCurrency(Number(amount))}</span>
        )}
        <span className="bg-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white group-hover:bg-zinc-800">Review</span>
      </div>
    </Link>
  );
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// The items physically in the vendor's home. Days left rather than a date:
// "12 days left" is a fact about now; a date makes someone do arithmetic.
function WithYou({ rows, offers, statusOf, onChanged }: {
  rows: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
  onChanged: () => void;
}) {
  const [withdrawingId, setWithdrawingId] = React.useState<string | null>(null);
  const [withdrawError, setWithdrawError] = React.useState<{ id: string; message: string } | null>(null);

  // A vendor can change their mind until someone buys the item. The server
  // decides whether it still can; if a buyer got there first, its sentence
  // is shown as it is.
  const withdraw = async (l: Listing) => {
    if (!window.confirm(
      `Withdraw "${l.title}"? It comes off the site straight away and this offer ends. You can send it to us again later for a fresh offer.`,
    )) return;
    setWithdrawingId(l.id);
    setWithdrawError(null);
    try {
      await withdrawItem(l.id);
      onChanged();
    } catch (err: any) {
      splog.error('withdraw', err);
      setWithdrawError({ id: l.id, message: err?.message ?? 'That did not work. Try again, or get in touch.' });
    } finally {
      setWithdrawingId(null);
    }
  };

  const daysLeft = (iso: string | null | undefined) => {
    if (!iso) return null;
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  };

  const one = rows.length === 1;
  return (
    <ItemSection
      title="Keep packed, ready to ship"
      intro={
        <>
          On sale now. Keep {one ? 'it' : 'them'} unworn and do not sell {one ? 'it' : 'them'} anywhere else.
          When {one ? 'it is' : 'one is'} bought, we send you a prepaid label by email or WhatsApp.
        </>
      }
    >
      {rows.map((l) => {
        const offer = offers.get(l.id);
        const left = daysLeft(offer?.listing_expires_at);
        return (
          <React.Fragment key={l.id}>
            <ItemRow
              listing={l}
              offer={offer}
              status={statusOf(l)}
              showStatus={statusOf(l).key !== 'live'}
              aside={left != null && (
                <span className="text-sm tabular-nums">{left === 0 ? 'Last day on sale' : `${left} day${left === 1 ? '' : 's'} left`}</span>
              )}
            >
              {canWithdraw(offer, !!l.is_sold) && (
                <button
                  type="button"
                  onClick={() => withdraw(l)}
                  disabled={withdrawingId === l.id}
                  className={cn(ui.link, 'disabled:opacity-50')}
                >
                  {withdrawingId === l.id ? 'Withdrawing' : 'Withdraw this item'}
                </button>
              )}
              {withdrawError?.id === l.id && (
                <span role="alert" className="text-red-700">{withdrawError.message}</span>
              )}
            </ItemRow>
          </React.Fragment>
        );
      })}
    </ItemSection>
  );
}

// Where each item's payout stands. Held apart because they are not the same
// promise: an item on sale pays only if it sells within 30 days, a sold one
// pays once it reaches us and passes our check, a paid one is done.
const ON_SALE = new Set(['live', 'live_check_due']);
const ON_ITS_WAY = new Set(['sold', 'awaiting_pickup', 'in_transit', 'received']);
const WAITING_OFFER = new Set(['offer_ready']);
const ENDED = new Set(['declined', 'offer_rejected', 'offer_expired', 'not_accepted', 'expired', 'delisted', 'withdrawn']);

type PayoutGroup = 'offers' | 'on_sale' | 'on_its_way' | 'paid' | 'reviewing' | 'ended';

function groupOf(key: string): PayoutGroup {
  if (WAITING_OFFER.has(key)) return 'offers';
  if (ON_SALE.has(key)) return 'on_sale';
  if (ON_ITS_WAY.has(key)) return 'on_its_way';
  if (key === 'paid') return 'paid';
  if (ENDED.has(key)) return 'ended';
  return 'reviewing';
}

interface PayoutTotals { onSale: number; onItsWay: number; paid: number; offers: number; onSaleCount: number; offerCount: number }

function totalsOf(listings: Listing[], offers: Map<string, VendorOffer>, statusOf: (l: Listing) => VendorStatusView): PayoutTotals {
  const t: PayoutTotals = { onSale: 0, onItsWay: 0, paid: 0, offers: 0, onSaleCount: 0, offerCount: 0 };
  for (const l of listings) {
    const amount = Number(offers.get(l.id)?.offer_amount ?? 0);
    const g = groupOf(statusOf(l).key);
    if (g === 'on_sale') { t.onSale += amount; t.onSaleCount += 1; }
    else if (g === 'on_its_way') t.onItsWay += amount;
    else if (g === 'paid') t.paid += amount;
    else if (g === 'offers') { t.offers += amount; t.offerCount += 1; }
  }
  return t;
}

/** The payouts in one line at the top of Your items, with the way to the full picture. */
function PayoutStrip({ listings, offers, statusOf }: {
  listings: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
}) {
  const t = totalsOf(listings, offers, statusOf);
  const estimate = t.onSale + t.onItsWay;
  if (estimate + t.paid === 0) return null;
  return (
    <Link to="/account/payouts" className="group flex flex-wrap items-center justify-between gap-x-8 gap-y-3 bg-black px-5 py-4 text-white sm:px-6">
      <span className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <span className="flex flex-col">
          <span className="text-xs font-bold text-white/70">Your estimated payout</span>
          <span className="text-2xl sm:text-3xl font-black tracking-tighter tabular-nums">{formatCurrency(estimate)}</span>
        </span>
        {t.onItsWay > 0 && (
          <span className="flex flex-col">
            <span className="text-xs font-bold text-white/70">On its way to you</span>
            <span className="text-lg font-black tracking-tight tabular-nums">{formatCurrency(t.onItsWay)}</span>
          </span>
        )}
        {t.paid > 0 && (
          <span className="flex flex-col">
            <span className="text-xs font-bold text-white/70">Paid to you</span>
            <span className="text-lg font-black tracking-tight tabular-nums">{formatCurrency(t.paid)}</span>
          </span>
        )}
      </span>
      <span className="text-[11px] font-black uppercase tracking-[0.2em] group-hover:underline underline-offset-4">See your payouts</span>
    </Link>
  );
}

/** Counts up to a number once, so a payout lands rather than sits there. */
function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = React.useState(target);
  const from = React.useRef(0);
  React.useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(target); return; }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(begin + (target - begin) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

const FILTERS: Array<{ key: 'all' | PayoutGroup; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'offers', label: 'Offers' },
  { key: 'on_sale', label: 'On sale' },
  { key: 'on_its_way', label: 'Sold' },
  { key: 'paid', label: 'Paid' },
  { key: 'reviewing', label: 'With us' },
  { key: 'ended', label: 'Ended' },
];

const GROUP_ORDER: PayoutGroup[] = ['offers', 'on_its_way', 'on_sale', 'paid', 'reviewing', 'ended'];

/**
 * Your payouts: everything we are paying you, and where each item stands.
 * The headline is the money in play (on sale plus sold), counted up, with a
 * bar of how much of it is already secured. Then every item, filterable,
 * with its own number and how long it has left. Built only from the vendor's
 * own offers: a payout follows us accepting the item at our hub, never a
 * buyer's payment, and no resale price is read or shown.
 */
function PayoutsView({ listings, offers, statusOf }: {
  listings: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
}) {
  const t = totalsOf(listings, offers, statusOf);
  const estimate = t.onSale + t.onItsWay;
  const shown = useCountUp(estimate);
  const [filter, setFilter] = React.useState<'all' | PayoutGroup>('all');

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-start gap-6">
        <p className={ui.help}>No payouts yet. Tell us about something you want to sell and we will make you an offer, usually within 24 hours.</p>
        <Link to="/sell" className={ui.btnPrimary}>Get an offer</Link>
      </div>
    );
  }

  const rows = listings
    .map((l) => ({ l, status: statusOf(l), offer: offers.get(l.id) }))
    .map((r) => ({ ...r, group: groupOf(r.status.key) }));
  const counts = rows.reduce<Record<string, number>>((acc, r) => { acc[r.group] = (acc[r.group] ?? 0) + 1; return acc; }, {});
  const sortKey = (r: typeof rows[number]) => {
    const g = GROUP_ORDER.indexOf(r.group) * 1e13;
    const o = r.offer;
    if (r.group === 'offers') return g + new Date(o?.offer_expires_at ?? 0).getTime() / 1e3;
    if (r.group === 'on_sale') return g + new Date(o?.listing_expires_at ?? 0).getTime() / 1e3;
    if (r.group === 'paid') return g - new Date(o?.paid_at ?? 0).getTime() / 1e3;
    return g;
  };
  const visible = rows.filter((r) => filter === 'all' || r.group === filter).sort((a, b) => sortKey(a) - sortKey(b));

  const barTotal = t.paid + t.onItsWay + t.onSale + t.offers;
  const pct = (n: number) => `${barTotal > 0 ? (n / barTotal) * 100 : 0}%`;
  const soonest = rows
    .filter((r) => r.group === 'on_sale' && r.offer?.listing_expires_at)
    .map((r) => daysUntil(r.offer!.listing_expires_at))
    .reduce<number | null>((m, d) => (d == null ? m : m == null ? d : Math.min(m, d)), null);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="estimate-heading" className="relative overflow-hidden bg-black text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-10">
          <div className="flex flex-col gap-2">
            <h2 id="estimate-heading" className="text-sm font-bold text-white/80">Your estimated payout</h2>
            <p className="text-5xl sm:text-7xl font-black tracking-tighter leading-none tabular-nums" aria-label={formatCurrency(estimate)}>
              {formatCurrency(shown)}
            </p>
            <p className="max-w-xl text-sm text-white/80">
              {estimate === 0
                ? 'Accept an offer and your items start counting here.'
                : <>Across {t.onSaleCount + rows.filter((r) => r.group === 'on_its_way').length} items.{' '}
                  {t.onItsWay > 0 && <><span className="font-bold text-white">{formatCurrency(t.onItsWay)}</span> is sold and on its way to you. </>}
                  {t.onSale > 0 && <><span className="font-bold text-white">{formatCurrency(t.onSale)}</span> more if {t.onSaleCount === 1 ? 'your item sells' : 'each item sells'} within 30 days.</>}</>}
            </p>
          </div>

          {barTotal > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex h-3 w-full overflow-hidden bg-white/10" role="img"
                aria-label={`Paid ${formatCurrency(t.paid)}, on its way ${formatCurrency(t.onItsWay)}, on sale ${formatCurrency(t.onSale)}, offers waiting ${formatCurrency(t.offers)}`}>
                <span className="h-full bg-emerald-400 transition-[width] duration-700" style={{ width: pct(t.paid) }} />
                <span className="h-full bg-white transition-[width] duration-700" style={{ width: pct(t.onItsWay) }} />
                <span className="h-full bg-white/45 transition-[width] duration-700" style={{ width: pct(t.onSale) }} />
                <span className="h-full bg-[repeating-linear-gradient(45deg,#fbbf24_0_6px,#f59e0b_6px_12px)] transition-[width] duration-700" style={{ width: pct(t.offers) }} />
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
                {t.paid > 0 && <Legend swatch="bg-emerald-400" label="Paid" amount={t.paid} />}
                {t.onItsWay > 0 && <Legend swatch="bg-white" label="On its way" amount={t.onItsWay} />}
                {t.onSale > 0 && <Legend swatch="bg-white/45" label="On sale" amount={t.onSale} />}
                {t.offers > 0 && <Legend swatch="bg-amber-400" label="Offers waiting" amount={t.offers} />}
              </ul>
            </div>
          )}

          {t.offerCount > 0 && (
            <button type="button" onClick={() => setFilter('offers')}
              className="self-start bg-amber-400 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-300 transition-colors">
              +{formatCurrency(t.offers)} if you accept {t.offerCount === 1 ? 'your waiting offer' : `your ${t.offerCount} waiting offers`}
            </button>
          )}
        </div>
      </section>

      <dl className="grid grid-cols-1 gap-px border border-black/10 bg-black/10 sm:grid-cols-3">
        <Stat label="On its way to you" amount={t.onItsWay} note="Sold. Paid once it reaches us and passes our check." />
        <Stat label="Paid to you" amount={t.paid} note="Sent to your UPI ID." />
        <Stat label="On sale now" amount={t.onSale}
          note={t.onSaleCount === 0 ? 'Nothing on sale right now.' : `${t.onSaleCount} ${t.onSaleCount === 1 ? 'item' : 'items'}${soonest != null ? `, the next one has ${soonest} day${soonest === 1 ? '' : 's'} left` : ''}.`} />
      </dl>

      <section className="flex flex-col gap-4" aria-labelledby="breakdown-heading">
        <div className="flex flex-col gap-1">
          <h2 id="breakdown-heading" className={ui.sectionTitle}>Every item</h2>
          <p className={ui.help}>Each amount was fixed when you accepted our offer and does not change.</p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.filter((f) => f.key === 'all' || counts[f.key]).map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={cn('shrink-0 min-h-[40px] border px-4 text-sm transition-colors',
                filter === f.key ? 'border-black bg-black font-bold text-white' : 'border-black/15 hover:border-black')}>
              {f.label} <span className={cn('tabular-nums', filter === f.key ? 'text-white/70' : 'text-black/50')}>{f.key === 'all' ? rows.length : counts[f.key]}</span>
            </button>
          ))}
        </div>
        <ul className="flex flex-col border-b border-black/10">
          {visible.map(({ l, status, offer, group }) => (
            <React.Fragment key={l.id}>
              <PayoutRow listing={l} status={status} offer={offer} group={group} />
            </React.Fragment>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Legend({ swatch, label, amount }: { swatch: string; label: string; amount: number }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={cn('h-2.5 w-2.5', swatch)} />
      <span className="text-white/80">{label}</span>
      <span className="font-bold tabular-nums">{formatCurrency(amount)}</span>
    </li>
  );
}

function Stat({ label, amount, note }: { label: string; amount: number; note: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 bg-white px-4 py-4 sm:flex sm:flex-col sm:gap-1 sm:p-5">
      <dt className="text-sm font-bold">{label}</dt>
      <dd className="row-span-2 text-2xl sm:text-3xl font-black tracking-tighter leading-none tabular-nums">{formatCurrency(amount)}</dd>
      <dd className="text-xs leading-relaxed">{note}</dd>
    </div>
  );
}

const GROUP_TAG: Record<PayoutGroup, { label: string; className: string }> = {
  offers: { label: 'Offer ready', className: 'bg-amber-400 text-black' },
  on_sale: { label: 'On sale', className: 'bg-black text-white' },
  on_its_way: { label: 'Sold', className: 'border border-black text-black' },
  paid: { label: 'Paid', className: 'bg-emerald-600 text-white' },
  reviewing: { label: 'With us', className: 'bg-zinc-200 text-black' },
  ended: { label: 'Ended', className: 'bg-zinc-100 text-black/60' },
};

function PayoutRow({ listing, status, offer, group }: { listing: Listing; status: VendorStatusView; offer: VendorOffer | undefined; group: PayoutGroup }) {
  const amount = offer?.offer_amount != null ? Number(offer.offer_amount) : null;
  const tag = GROUP_TAG[group];
  let when: string | null = null;
  if (group === 'offers' && offer?.offer_expires_at) {
    const d = daysUntil(offer.offer_expires_at);
    when = d === 0 ? 'Last day to accept' : `Accept by ${formatDay(offer.offer_expires_at)}, ${d} day${d === 1 ? '' : 's'} left`;
  } else if (group === 'on_sale' && offer?.listing_expires_at) {
    const d = daysUntil(offer.listing_expires_at);
    when = d === 0 ? 'Last day on sale' : `${d} day${d === 1 ? '' : 's'} left on sale`;
  } else if (group === 'paid' && offer?.paid_at) {
    when = `Paid on ${formatDate(offer.paid_at)}`;
  } else {
    when = status.label;
  }
  const href = group === 'offers' ? `/offer/${listing.id}` : `/product/${listing.id}`;
  const urgent = group === 'offers' && daysUntil(offer?.offer_expires_at) != null && daysUntil(offer?.offer_expires_at)! <= 2;

  return (
    <li className="border-t border-black/10">
      <Link to={href} className={cn('flex items-center gap-4 py-4 hover:bg-zinc-50', group === 'ended' && 'opacity-60')}>
        <span className="h-16 w-12 shrink-0 overflow-hidden bg-zinc-100">
          <img src={variantUrl(listing.image_url, 'thumb')} alt="" className={cn('h-full w-full object-cover', group === 'ended' && 'grayscale')} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-bold">{listing.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className={cn('px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest', tag.className)}>{tag.label}</span>
            <span className={cn(urgent && 'font-bold text-red-700')}>{when}</span>
            {listing.sku && <span className="hidden sm:inline text-black/50">{listing.sku}</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {amount != null ? (
            <span className={cn('text-lg sm:text-xl font-black tracking-tight tabular-nums', group === 'ended' && 'line-through decoration-2')}>
              {formatCurrency(amount)}
            </span>
          ) : (
            <span className="text-sm">{group === 'reviewing' ? 'Offer coming' : '-'}</span>
          )}
        </span>
      </Link>
    </li>
  );
}

// A branded Instagram post or story for anything on sale. Optional, and it
// does not change how fast something sells.
function ShareTab({ listings }: { listings: Listing[] }) {
  const [shareTarget, setShareTarget] = React.useState<Listing | null>(null);

  if (listings.length === 0) {
    return <p className={ui.help}>Once one of your items is on sale, you can make an Instagram post or story for it here.</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <p className={ui.help}>A post or story image of anything you have on sale, ready to share. Optional, and it does not change how fast something sells.</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 border-b border-black/10">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center gap-4 border-t border-black/10 py-4">
              <div className="h-16 w-12 shrink-0 overflow-hidden bg-zinc-100">
                <img src={variantUrl(l.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{l.title}</span>
              <button type="button" onClick={() => setShareTarget(l)} className={cn(ui.link, 'shrink-0 text-sm font-bold')}>
                Make image
              </button>
            </li>
          ))}
        </ul>
      </div>

      {shareTarget && (
        <ShareInstagramModal open={!!shareTarget} onClose={() => setShareTarget(null)} listing={shareTarget} />
      )}
    </>
  );
}
