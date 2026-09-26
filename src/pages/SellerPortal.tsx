// Your Items: the selling side of an account.
//
// One account both buys and sells, so the two sides live on two pages that
// say which is which: My Orders is what you bought from us, Your Items is
// what you have asked us to buy from you. This page is only the second.
//
// One column, the site's reading width, three tabs:
//   Items    what needs you, what is in your home, what is moving, what sold
//   Payouts  what we have agreed to pay you, and what we have paid
//   Share    a branded Instagram image of anything live, if you want one
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
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { log } from '../lib/log';
import { usePageMeta, META, isDemoTitle } from '../lib/pageMeta';
import { ui } from '../lib/ui';
import { getVendorOffers, vendorStatus, withdrawItem, canWithdraw, canDelete, type VendorOffer, type VendorStatusView } from '../lib/acquisition';

const splog = log('seller');

export type PortalTab = 'listings' | 'payouts' | 'tools';

export function SellerPortal() {
  usePageMeta(META.vendorPortal);

  return (
    <RequireAuth message="Sign in to see your items.">
      <SellerInner />
    </RequireAuth>
  );
}

function SellerInner() {
  const { user } = useAuth();
  // Deep-linkable: /vendor-portal?tab=tools lands straight on Share.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: PortalTab = (['listings', 'tools', 'payouts'] as const)
    .includes(tabParam as PortalTab) ? (tabParam as PortalTab) : 'listings';
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
      setListings(((l as Listing[]) ?? []).filter((x) => !isDemoTitle(x.title)));
      setOffers(new Map(offerRows.map((o) => [o.listing_id, o])));
    } catch (err: any) {
      splog.error('fetchAll', err);
      setError(err?.message ?? 'Failed to load your items');
    } finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <VendorPortalView
      tab={tab}
      onTab={setTab}
      listings={listings}
      offers={offers}
      loading={loading}
      error={error}
      onDelete={deleteListing}
      deletingId={deletingId}
      onChanged={fetchAll}
    />
  );
}

/** The page, from data. Kept apart from the fetching so it can be looked at. */
export function VendorPortalView({ tab, onTab, listings, offers, loading, error, onDelete, deletingId, onChanged }: {
  tab: PortalTab;
  onTab: (t: PortalTab) => void;
  listings: Listing[];
  offers: Map<string, VendorOffer>;
  loading: boolean;
  error: string | null;
  onDelete: (l: Listing) => void;
  deletingId: string | null;
  onChanged: () => void;
}) {
  const statusOf = React.useCallback(
    (l: Listing) => vendorStatus(l.status, !!l.is_sold, offers.get(l.id)),
    [offers],
  );

  // The patient lane's defining fact, given its own shelf: these are the items
  // physically in the vendor's home right now, on sale, waiting for a buyer.
  const withYou = listings.filter((l) => {
    const k = statusOf(l).key;
    return k === 'live' || k === 'live_check_due';
  });
  const needsYou = listings.filter((l) => statusOf(l).needsAction && !withYou.includes(l));
  const sold = listings.filter((l) => l.is_sold && !needsYou.includes(l));
  const inProgress = listings.filter((l) => !l.is_sold && !withYou.includes(l) && !needsYou.includes(l));

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4">
            <h1 className={ui.pageTitle}>Your Items</h1>
            <p className={ui.help}>What you have asked us to buy, and what we are paying you.</p>
          </div>
          <Link to="/sell" className={cn(ui.btnPrimary, 'shrink-0 self-start sm:self-auto')}>Get an offer</Link>
        </div>

        <nav className="flex items-center gap-6 border-b border-black/10" aria-label="Your items">
          <TabButton active={tab === 'listings'} onClick={() => onTab('listings')}>
            Items{listings.length > 0 ? ` (${listings.length})` : ''}
          </TabButton>
          <TabButton active={tab === 'payouts'} onClick={() => onTab('payouts')}>Payouts</TabButton>
          <TabButton active={tab === 'tools'} onClick={() => onTab('tools')}>Share</TabButton>
        </nav>

        {error && <p className={ui.error}>{error}</p>}

        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : tab === 'listings' ? (
          listings.length === 0 ? (
            <div className="flex flex-col items-start gap-6">
              <p className={ui.help}>Nothing here yet. Tell us about something you want to sell and we will make you an offer, usually within 24 hours.</p>
              <Link to="/sell" className={ui.btnPrimary}>Get an offer</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-14">
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
        ) : tab === 'payouts' ? (
          <Payouts listings={listings} offers={offers} statusOf={statusOf} />
        ) : (
          <ShareTab listings={listings.filter((l) => withYou.includes(l))} />
        )}
      </div>
    </div>
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
function ItemRow({ listing, offer, status, aside, children, captioned = true, showStatus = true }: {
  listing: Listing;
  offer: VendorOffer | undefined;
  status: VendorStatusView;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  /** Off where the section heading already says it ("With you now"). */
  showStatus?: boolean;
  /** "Your payout" under the amount, so it is never read as a sale price.
      Off on the Payouts tab, where every number on the page is one. */
  captioned?: boolean;
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
        {payout && <span className="text-base font-black tabular-nums">{payout}</span>}
        {captioned && payout && offer?.offer_amount != null && <span className="text-sm">Your payout</span>}
        {aside}
      </div>
    </li>
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
    <div className="flex flex-col gap-8">
      {withOffer.map((l) => (
        <OfferReadyCard key={l.id} listing={l} amount={offers.get(l.id)?.offer_amount ?? null} />
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
 * The open offer, as its own black-bordered card: the photo they sent, the
 * number, and what accepting does. The photo is here because an offer lands
 * days after the item was sent, and the number means nothing until the vendor
 * has recognised which item it is for.
 */
export function OfferReadyCard({ listing, amount }: { key?: string; listing: Listing; amount: number | null }) {
  return (
    <div className="flex flex-col gap-6 border-2 border-black p-6 sm:p-10">
      <div className="flex items-start gap-5">
        <div className="h-24 w-[72px] shrink-0 overflow-hidden bg-zinc-100 sm:h-28 sm:w-[84px]">
          <img src={variantUrl(listing.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter leading-none">Your offer is ready</h2>
          <p className={ui.help}>
            For <span className="font-bold">{listing.title}</span>. This is what we will pay you for it.
          </p>
        </div>
      </div>
      {amount != null && (
        <p className="text-4xl sm:text-5xl font-black tracking-tighter leading-none tabular-nums">
          {formatCurrency(Number(amount))}
        </p>
      )}
      <p className={ui.help}>
        Accept it and the amount is locked. The item stays with you and goes on sale. When someone
        buys it we send a prepaid label, collect from your door, and pay you once we have checked it in.
      </p>
      <Link to={`/offer/${listing.id}`} className={cn(ui.btnPrimary, 'self-start')}>Review and accept</Link>
    </div>
  );
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
      title="With you now"
      intro={
        <>
          On the site and waiting for a buyer. Keep {one ? 'it' : 'them'} packed and unworn, do not sell{' '}
          {one ? 'it' : 'them'} anywhere else, and watch your email. The day {one ? 'it is' : 'one is'} bought
          we send a prepaid label and a courier comes to your door.
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

/**
 * Payouts, built entirely from the vendor's own offers. Nothing here reads an
 * order: their payout follows us accepting the item, nothing else.
 */
function Payouts({ listings, offers, statusOf }: {
  listings: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
}) {
  const rows = listings.filter((l) => offers.get(l.id)?.offer_status === 'accepted');

  if (rows.length === 0) {
    return <p className={ui.help}>Nothing yet. A payout is agreed the moment you accept an offer.</p>;
  }

  const paid = rows.filter((l) => offers.get(l.id)?.intake_status === 'paid');
  const agreed = rows.filter((l) => offers.get(l.id)?.intake_status !== 'paid');
  const total = (list: Listing[]) => list.reduce((sum, l) => sum + Number(offers.get(l.id)?.offer_amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-6">
        <p className={ui.help}>
          Each amount was fixed when you accepted our offer and does not change. It is paid once your item
          reaches our hub and we have checked it.
        </p>
        <dl className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-1">
            <dt className="text-sm">Agreed, not yet paid</dt>
            <dd className="text-3xl sm:text-4xl font-black tracking-tighter tabular-nums">{formatCurrency(total(agreed))}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm">Paid to you</dt>
            <dd className="text-3xl sm:text-4xl font-black tracking-tighter tabular-nums">{formatCurrency(total(paid))}</dd>
          </div>
        </dl>
      </div>
      {agreed.length > 0 && (
        <ItemSection title="Agreed">
          {agreed.map((l) => (
            <React.Fragment key={l.id}><ItemRow listing={l} offer={offers.get(l.id)} status={statusOf(l)} captioned={false} /></React.Fragment>
          ))}
        </ItemSection>
      )}
      {paid.length > 0 && (
        <ItemSection title="Paid">
          {paid.map((l) => (
            <React.Fragment key={l.id}><ItemRow listing={l} offer={offers.get(l.id)} status={statusOf(l)} captioned={false} /></React.Fragment>
          ))}
        </ItemSection>
      )}
    </div>
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
