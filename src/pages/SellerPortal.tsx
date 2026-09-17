// The vendor portal - vendor-facing dashboard.
// Listings (active/sold) + sold orders. For each sold order, the vendor can:
//   - Add tracking (URL required, courier/number/photo optional) to ship.
//   - Edit tracking after submission.
// MVP: buyer pays admin UPI; admin verifies, and once the order is marked
// delivered, a payout row is created automatically (48-hour review window,
// see COPY_RULES.md). Vendors no longer create their own payout
// row by marking shipped - that used to release money before the buyer had
// even confirmed the item arrived.

import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { scrollToTop } from '../lib/scrollToTop';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { ChevronRight, Loader2, Share2, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { log } from '../lib/log';
import { usePageMeta, META } from '../lib/pageMeta';

import { getVendorOffers, vendorStatus, withdrawItem, canWithdraw, canDelete, type VendorOffer, type VendorStatusView } from '../lib/acquisition';

const splog = log('seller');

// No orders tab. What a buyer paid, who they are and when their order moved
// is the buyer side of a separate transaction, and none of it belongs to the
// vendor. They see their own items and their own payouts.
type Tab = 'listings' | 'tools' | 'payouts';
const COURIERS = ['Delhivery', 'BlueDart', 'India Post', 'DTDC', 'Ekart', 'Other'];

export function SellerPortal() {
  usePageMeta(META.vendorPortal);

  return (
    <RequireAuth message="Sign in to access the vendor portal.">
      <SellerInner />
    </RequireAuth>
  );
}

function SellerInner() {
  const { user } = useAuth();
  // Deep-linkable: /vendor-portal?tab=tools lands straight on the tools tab, which
  // is where the post-publish screen sends a vendor to share their new listing.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: Tab = (['listings', 'tools', 'payouts'] as const)
    .includes(tabParam as Tab) ? (tabParam as Tab) : 'listings';
  const [tab, setTabState] = React.useState<Tab>(initialTab);
  const setTab = React.useCallback((next: Tab) => {
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
      ? `"${l.title}" has already been sold. Deleting removes the listing from your portal but keeps the order record. Continue?`
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
      setError(err?.message ?? 'Failed to delete listing');
    } finally {
      setDeletingId(null);
    }
  };

  const fetchAll = React.useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      // Listings and the vendor's own offers. Orders are deliberately not
      // fetched here: this page has no buyer-side data to show, so it does not
      // ask for any.
      const [{ data: l, error: le }, offerRows] = await Promise.all([
        supabase.from('listings').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
        getVendorOffers(),
      ]);
      if (le) throw le;
      setListings((l as Listing[]) ?? []);
      setOffers(new Map(offerRows.map((o) => [o.listing_id, o])));
    } catch (err: any) {
      splog.error('fetchAll', err);
      setError(err?.message ?? 'Failed to load your data');
    } finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  const statusOf = React.useCallback(
    (l: Listing) => vendorStatus(l.status, !!l.is_sold, offers.get(l.id)),
    [offers],
  );

  // The patient lane's defining fact, given its own shelf: these are the items
  // physically in the vendor's home right now, listed, waiting for a buyer.
  // Everything else on this page is history or admin.
  const withYou = listings.filter((l) => {
    const k = statusOf(l).key;
    return k === 'live' || k === 'live_check_due';
  });
  const activeListings = listings.filter((l) => !l.is_sold && !withYou.includes(l));
  const soldListings = listings.filter((l) => l.is_sold);
  const needsVendor = listings.filter((l) => statusOf(l).needsAction);
  const unpaid = listings.filter((l) => {
    const o = offers.get(l.id);
    return o?.offer_status === 'accepted' && o.intake_status !== 'paid';
  });

  const NAV: Array<{ key: Tab; label: string; count: number; needsAction: boolean }> = [
    { key: 'listings', label: 'My Items', count: listings.length, needsAction: needsVendor.length > 0 },
    { key: 'payouts', label: 'Payouts', count: listings.length, needsAction: unpaid.length > 0 },
  ];

  // Everything that is not the two things above.
  const EXTRAS: Array<{ key: Tab; label: string }> = [
    { key: 'tools', label: 'Share tools' },
  ];

  const TAB_META: Record<Tab, { title: string; description: string }> = {
    listings: { title: 'My Items', description: 'Anything listed is still in your home. We will tell you the day it sells, send a prepaid label, and book a courier to your door.' },
    tools: { title: 'Share tools', description: 'Make a branded Instagram post or story for anything you have listed. Optional, and it will not change how fast something sells.' },
    payouts: { title: 'Payouts', description: 'What we have agreed to pay you, and what we have already sent. Each amount was fixed when you accepted it and does not change.' },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-14 sm:pb-20">
      <div className="flex flex-col md:flex-row gap-10 md:gap-14">
        {/* Sidebar */}
        <aside className="md:w-[220px] md:shrink-0 md:border-r md:border-black/10 md:pr-10 flex flex-col gap-8">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-black uppercase tracking-tight truncate">{user?.email?.split('@')[0]}</span>
            <span className="text-[11px] font-normal ink-mid truncate">{user?.email}</span>
          </div>

          <nav className="flex flex-col">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  'flex items-center justify-between py-3 text-[11px] font-black uppercase tracking-widest border-b border-black/5 text-left transition-colors',
                  tab === item.key ? 'text-black' : 'ink-mid hover:text-black',
                )}
              >
                <span>{item.label}</span>
                <span className={cn(item.needsAction && 'font-black underline')}>{item.count}</span>
              </button>
            ))}
          </nav>

          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] ink-mid pb-2">Other</span>
            {EXTRAS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  'py-3 text-[11px] font-black uppercase tracking-widest border-b border-black/5 text-left transition-colors',
                  tab === item.key ? 'text-black' : 'ink-mid hover:text-black',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] ink-mid">Items</span>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="ink-mid">With you</span>
              <span>{withYou.length}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="ink-mid">Sold</span>
              <span>{soldListings.length}</span>
            </div>
          </div>

          <Link
            to="/sell"
            className="border border-black py-3 text-center text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-colors"
          >
            Get an offer
          </Link>
        </aside>

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1.5 mb-10">
            <h1 className="text-3xl font-black tracking-tighter uppercase">{TAB_META[tab].title}</h1>
            <p className="text-sm font-normal leading-relaxed text-black measure">
              {TAB_META[tab].description}
            </p>
          </div>

          {error && (
            <p className="text-xs font-bold uppercase tracking-widest text-red-700 border-b border-red-200 pb-4 mb-8">{error}</p>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin ink-low" /></div>
          ) : tab === 'listings' ? (
            <div className="flex flex-col gap-14">
              {needsVendor.length > 0 && <ActionCallout rows={needsVendor} offers={offers} statusOf={statusOf} />}
              {withYou.length > 0 && <WithYouPanel rows={withYou} offers={offers} statusOf={statusOf} onChanged={fetchAll} />}
              <ListingsTable title="Everything else" rows={activeListings} offers={offers} statusOf={statusOf} onDelete={deleteListing} deletingId={deletingId} />
              <ListingsTable title="Sold" rows={soldListings} offers={offers} statusOf={statusOf} onDelete={deleteListing} deletingId={deletingId} />
            </div>
          ) : tab === 'tools' ? (
            <SellerToolsPanel listings={listings} />
          ) : (
            <VendorPayouts listings={listings} offers={offers} statusOf={statusOf} />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-black uppercase tracking-[0.2em] ink-mid mb-4">{children}</h3>;
}

function SellerToolsPanel({ listings }: { listings: Listing[] }) {
  const [shareTarget, setShareTarget] = React.useState<Listing | null>(null);

  if (listings.length === 0) {
    return <p className="text-[11px] font-bold uppercase tracking-widest ink-mid">List an item first to generate Instagram images for it.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map((l) => (
          <div key={l.id} className="border border-black/5 bg-white p-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="h-16 w-12 bg-zinc-100 overflow-hidden flex-shrink-0">
                <img src={variantUrl(l.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-xs font-black uppercase tracking-tight truncate">{l.title}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest ink-mid">{l.sku ?? '-'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShareTarget(l)}
              className="inline-flex items-center justify-center gap-2 border border-black px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" /> Generate Instagram image
            </button>
          </div>
        ))}
      </div>

      {shareTarget && (
        <ShareInstagramModal open={!!shareTarget} onClose={() => setShareTarget(null)} listing={shareTarget} />
      )}
    </>
  );
}

// The money column is the vendor's own payout, never the price the item is
// listed at. A vendor agreed to one number and that is the only one they see;
// showing what we resell it for would hand them the other side of the deal.
function ListingsTable({ title, rows, offers, statusOf, onDelete, deletingId }: {
  title: string; rows: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
  onDelete: (l: Listing) => void; deletingId: string | null;
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-[11px] font-bold uppercase tracking-widest ink-mid pb-4">No items.</p>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="flex flex-col sm:hidden">
            {rows.map((l) => (
              <div key={l.id} className="py-4 border-b border-black/5 flex gap-3">
                <Link to={`/product/${l.id}`} className="h-16 w-12 bg-zinc-100 overflow-hidden flex-shrink-0">
                  <img src={variantUrl(l.image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
                </Link>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <Link to={`/product/${l.id}`} className="text-xs font-black uppercase tracking-tight truncate hover:underline">{l.title}</Link>
                  <span className="text-[11px] font-bold uppercase tracking-widest ink-mid">SKU {l.sku ?? '-'} · {new Date(l.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-black">{payoutLabel(offers.get(l.id))}</span>
                    <span className="text-[11px] font-black uppercase tracking-widest ink-mid">{statusOf(l).label}</span>
                  </div>
                </div>
                {canDelete(offers.get(l.id), !!l.is_sold) && (
                  <button
                    onClick={() => onDelete(l)}
                    disabled={deletingId === l.id}
                    title="Delete item"
                    aria-label={`Delete ${l.title}`}
                    className="self-start ink-mid hover:text-black disabled:opacity-50 shrink-0"
                  >
                    {deletingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-black/10">
                <th className="py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid">Item</th>
                <th className="py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid">SKU</th>
                <th className="py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid">Status</th>
                <th className="py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid">Your payout</th>
                <th className="py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid text-right">Added</th>
                <th className="py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid text-right"></th>
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-black/5">
                    <td className="py-3 px-3"><Link to={`/product/${l.id}`} className="flex items-center gap-3 hover:underline">
                      <div className="h-12 w-9 bg-zinc-100 overflow-hidden flex-shrink-0"><img src={variantUrl(l.image_url, 'thumb')} alt="" className="h-full w-full object-cover" /></div>
                      <span className="text-xs font-black uppercase tracking-tight">{l.title}</span>
                    </Link></td>
                    <td className="py-3 px-3 text-[11px] font-bold uppercase tracking-widest ink-mid">{l.sku ?? '-'}</td>
                    <td className="py-3 px-3 text-[11px] font-black uppercase tracking-widest">{statusOf(l).label}</td>
                    <td className="py-3 px-3 text-xs font-black">{payoutLabel(offers.get(l.id))}</td>
                    <td className="py-3 px-3 text-[11px] font-bold uppercase tracking-widest ink-mid text-right">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {canDelete(offers.get(l.id), !!l.is_sold) && (
                        <button
                          onClick={() => onDelete(l)}
                          disabled={deletingId === l.id}
                          title="Delete item"
                          aria-label={`Delete ${l.title}`}
                          className="ink-mid hover:text-black disabled:opacity-50"
                        >
                          {deletingId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** The vendor's own number, or an honest placeholder while there isn't one. */
function payoutLabel(offer: VendorOffer | undefined): string {
  if (!offer) return '-';
  if (offer.offer_amount == null) {
    return offer.offer_status === 'pending_pricing' ? 'Pending' : '-';
  }
  return formatCurrency(Number(offer.offer_amount));
}

/**
 * Sits above the table when anything is waiting on the vendor: an open offer,
 * a request for better photos, or a number they turned down and could rework.
 */
// The items physically in the vendor's home. Given a shelf of its own, ahead
// of everything else, because the patient lane only works if the seller
// remembers they are holding stock and can be reached when it sells.
//
// Shows days left rather than a date: "31 days left" is a fact about now, and
// a date makes someone do arithmetic to find out whether it matters.
function WithYouPanel({ rows, offers, statusOf, onChanged }: {
  rows: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => ReturnType<typeof vendorStatus>;
  onChanged: () => void;
}) {
  const [withdrawingId, setWithdrawingId] = React.useState<string | null>(null);
  const [withdrawError, setWithdrawError] = React.useState<{ id: string; message: string } | null>(null);

  // The form promises a vendor can change their mind until someone buys the
  // item. This is where they do it. The server decides whether it is still
  // allowed; if a buyer got there first, its sentence is shown as it is.
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
    const ms = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black uppercase tracking-tight">In your home right now</h2>
        <p className="text-sm font-normal leading-relaxed ink-mid max-w-[60ch]">
          On the site and waiting for a buyer. Keep {rows.length === 1 ? 'it' : 'them'} packed
          and unworn, do not sell {rows.length === 1 ? 'it' : 'them'} anywhere else, and watch
          your email. The day {rows.length === 1 ? 'it is' : 'one is'} bought we send a prepaid
          label and a courier comes to your door.
        </p>
      </div>

      <div className="flex flex-col">
        {rows.map((l) => {
          const offer = offers.get(l.id);
          const status = statusOf(l);
          const left = daysLeft(offer?.listing_expires_at);
          return (
            <div key={l.id} className="flex items-start justify-between gap-4 border-t border-black/10 py-5 last:border-b">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-black uppercase tracking-tight truncate">{l.title}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest ink-mid">
                  {status.label}
                </span>
                {status.key === 'live_check_due' && (
                  <span className="text-sm font-normal leading-relaxed ink-mid measure">
                    Check your email for our message and tap yes or no. It takes a second.
                  </span>
                )}
                {canWithdraw(offer, !!l.is_sold) && (
                  <button
                    type="button"
                    onClick={() => withdraw(l)}
                    disabled={withdrawingId === l.id}
                    className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-normal text-black underline underline-offset-4 hover:no-underline disabled:opacity-50"
                  >
                    {withdrawingId === l.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {withdrawingId === l.id ? 'Withdrawing' : 'Withdraw this item'}
                  </button>
                )}
                {withdrawError?.id === l.id && (
                  <span role="alert" className="text-sm font-normal leading-relaxed text-red-700 measure">
                    {withdrawError.message}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-right flex flex-col gap-1">
                {offer?.offer_amount != null && (
                  <span className="text-lg font-black tracking-tighter tabular-nums">
                    {formatCurrency(Number(offer.offer_amount))}
                  </span>
                )}
                {left != null && (
                  <span className="text-[11px] font-black uppercase tracking-widest ink-mid">
                    {left === 0 ? 'Last day' : `${left} day${left === 1 ? '' : 's'} left`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionCallout({ rows, offers, statusOf }: {
  rows: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
}) {
  // An open offer is the one thing a vendor is actually waiting for, and it
  // used to be a 10px line of tracked caps inside a list. It is now the
  // loudest thing on the page, with the number at display size and the
  // consequence of accepting stated rather than implied: people did not know
  // that accepting is what puts the item on sale.
  const withOffer = rows.filter((l) => statusOf(l).key === 'offer_ready');
  const others = rows.filter((l) => statusOf(l).key !== 'offer_ready');

  return (
    <div className="flex flex-col gap-6">
      {withOffer.map((l) => {
        const amount = offers.get(l.id)?.offer_amount;
        return (
          <div key={l.id} className="border-2 border-black bg-white">
            <div className="flex flex-col gap-6 px-6 py-8 sm:px-10 sm:py-10">
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter leading-none">
                  Your offer is ready
                </h2>
                <p className="text-sm font-normal leading-relaxed ink-mid max-w-[46ch]">
                  For {l.title}. This is what we will pay you for it.
                </p>
              </div>

              {amount != null && (
                <p className="text-4xl sm:text-5xl font-black tracking-tighter leading-none tabular-nums">
                  {formatCurrency(Number(amount))}
                </p>
              )}

              <p className="text-sm font-normal leading-relaxed max-w-[52ch]">
                Accept it and the amount is locked. The item stays with you and goes live at
                our price. When it sells we send a prepaid label, collect from your door, and
                pay you once we have checked it in.
              </p>

              <Link
                to={`/offer/${l.id}`}
                className="self-start inline-flex items-center gap-3 bg-black px-10 py-5 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800 transition-colors"
              >
                Review and accept <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        );
      })}

      {others.length > 0 && (
        <div className="border border-black">
          <div className="border-b border-black px-6 py-4 sm:px-8">
            <span className="text-[11px] font-black uppercase tracking-[0.4em]">
              {others.length === 1 ? 'One item needs you' : `${others.length} items need you`}
            </span>
          </div>
          <ul className="flex flex-col">
            {others.map((l) => {
              const status = statusOf(l);
              return (
                <li key={l.id} className="border-b border-black/10 last:border-b-0">
                  <Link
                    to={`/offer/${l.id}`}
                    className="group flex items-center justify-between gap-5 px-6 py-5 sm:px-8 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-xs font-black uppercase tracking-tight truncate">{l.title}</span>
                      <span className="text-[11px] font-normal leading-relaxed ink-mid">
                        {status.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1 group-hover:text-black/60">
                      Open
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Payouts, built entirely from the vendor's own offers. Nothing here reads an
 * order: whether the buyer has paid, and what they paid, is not the vendor's
 * side of this. Their payout follows us accepting the item, nothing else.
 */
function VendorPayouts({ listings, offers, statusOf }: {
  listings: Listing[];
  offers: Map<string, VendorOffer>;
  statusOf: (l: Listing) => VendorStatusView;
}) {
  const rows = listings
    .map((l) => ({ listing: l, offer: offers.get(l.id) }))
    .filter((r) => r.offer?.offer_status === 'accepted');

  if (rows.length === 0) {
    return (
      <p className="text-[11px] font-bold uppercase tracking-widest ink-mid">
        Nothing yet. A payout is agreed the moment you accept an offer.
      </p>
    );
  }

  const paid = rows.filter((r) => r.offer?.intake_status === 'paid');
  const agreed = rows.filter((r) => r.offer?.intake_status !== 'paid');
  const total = (list: typeof rows) =>
    list.reduce((sum, r) => sum + Number(r.offer?.offer_amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-14">
      <div className="grid grid-cols-1 sm:grid-cols-2 border border-black divide-y sm:divide-y-0 sm:divide-x divide-black">
        <Figure label="Agreed, not yet paid" value={total(agreed)} />
        <Figure label="Paid to you" value={total(paid)} />
      </div>
      <PayoutRows title="Agreed" rows={agreed} statusOf={statusOf} />
      <PayoutRows title="Paid" rows={paid} statusOf={statusOf} />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-8 py-7 flex flex-col gap-3">
      <span className="text-[11px] font-black uppercase tracking-[0.4em] ink-mid">{label}</span>
      <span className="text-3xl sm:text-4xl font-black tracking-tighter leading-none">{formatCurrency(value)}</span>
    </div>
  );
}

function PayoutRows({ title, rows, statusOf }: {
  title: string;
  rows: Array<{ listing: Listing; offer: VendorOffer | undefined }>;
  statusOf: (l: Listing) => VendorStatusView;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <ul className="flex flex-col">
        {rows.map(({ listing, offer }) => {
          const status = statusOf(listing);
          return (
            <li key={listing.id} className="flex items-start justify-between gap-5 border-b border-black/5 py-5">
              <span className="flex flex-col gap-1.5 min-w-0">
                <span className="text-xs font-black uppercase tracking-tight truncate">{listing.title}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest ink-mid">
                  {status.label} · {status.detail}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black">
                {formatCurrency(Number(offer?.offer_amount ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
