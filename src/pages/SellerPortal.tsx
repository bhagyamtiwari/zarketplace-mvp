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
import {
  Loader2, Trash2, Share2,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';

import { getVendorOffers, vendorStatus, type VendorOffer, type VendorStatusView } from '../lib/acquisition';

const splog = log('seller');

// No orders tab. What a buyer paid, who they are and when their order moved
// is the buyer side of a separate transaction, and none of it belongs to the
// vendor. They see their own items and their own payouts.
type Tab = 'listings' | 'tools' | 'payouts';
const COURIERS = ['Delhivery', 'BlueDart', 'India Post', 'DTDC', 'Ekart', 'Other'];

export function SellerPortal() {
  useDocumentTitle('Vendor Portal');

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
      : `Delete "${l.title}"? This permanently removes the listing and cannot be undone.`;
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

  const activeListings = listings.filter((l) => !l.is_sold);
  const soldListings = listings.filter((l) => l.is_sold);
  const openOffers = listings.filter((l) => offers.get(l.id)?.offer_status === 'offered');
  const unpaid = listings.filter((l) => {
    const o = offers.get(l.id);
    return o?.offer_status === 'accepted' && o.intake_status !== 'paid';
  });

  const NAV: Array<{ key: Tab; label: string; count: number; needsAction: boolean }> = [
    { key: 'listings', label: 'My Items', count: listings.length, needsAction: openOffers.length > 0 },
    { key: 'tools', label: 'Share Tools', count: listings.length, needsAction: false },
    { key: 'payouts', label: 'Payouts', count: listings.length, needsAction: unpaid.length > 0 },
  ];

  const TAB_META: Record<Tab, { title: string; description: string }> = {
    listings: { title: 'My Items', description: 'Everything you have sent us. An item goes live only once you have seen what we will pay and accepted it.' },
    tools: { title: 'Share Tools', description: 'Generate a branded Instagram post or story image for any of your items in one click.' },
    payouts: { title: 'Payouts', description: 'What we have agreed to pay you, and what we have already sent. Each amount was fixed when you accepted it and does not change.' },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-14 sm:pb-20">
      <div className="flex flex-col md:flex-row gap-10 md:gap-14">
        {/* Sidebar */}
        <aside className="md:w-[220px] md:shrink-0 md:border-r md:border-black/10 md:pr-10 flex flex-col gap-8">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-black uppercase tracking-tight truncate">{user?.email?.split('@')[0]}</span>
            <span className="text-[10px] font-bold text-black/40 truncate">{user?.email}</span>
          </div>

          <nav className="flex flex-col">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  'flex items-center justify-between py-3 text-[11px] font-black uppercase tracking-widest border-b border-black/5 text-left transition-colors',
                  tab === item.key ? 'text-black' : 'text-black/40 hover:text-black',
                )}
              >
                <span>{item.label}</span>
                <span className={cn(item.needsAction && 'font-black underline')}>{item.count}</span>
              </button>
            ))}
          </nav>

          <div className="flex flex-col gap-2.5">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-black/30">Items</span>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-black/60">Active</span>
              <span>{activeListings.length}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
              <span className="text-black/60">Sold</span>
              <span>{soldListings.length}</span>
            </div>
          </div>

          <Link
            to="/sell"
            className="border border-black py-3 text-center text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
          >
            Sell an item
          </Link>
        </aside>

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1.5 mb-10">
            <h1 className="text-3xl font-black tracking-tighter uppercase">{TAB_META[tab].title}</h1>
            <p className="text-[11px] font-bold uppercase tracking-widest text-black/40 max-w-xl leading-relaxed">
              {TAB_META[tab].description}
            </p>
          </div>

          {error && (
            <p className="text-xs font-bold uppercase tracking-widest text-red-700 border-b border-red-200 pb-4 mb-8">{error}</p>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>
          ) : tab === 'listings' ? (
            <div className="flex flex-col gap-14">
              {openOffers.length > 0 && <OfferCallout rows={openOffers} offers={offers} />}
              <ListingsTable title="Active" rows={activeListings} offers={offers} statusOf={statusOf} onDelete={deleteListing} deletingId={deletingId} />
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
  return <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 mb-4">{children}</h3>;
}

function SellerToolsPanel({ listings }: { listings: Listing[] }) {
  const [shareTarget, setShareTarget] = React.useState<Listing | null>(null);

  if (listings.length === 0) {
    return <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">List an item first to generate Instagram images for it.</p>;
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
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">{l.sku ?? '-'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShareTarget(l)}
              className="inline-flex items-center justify-center gap-2 border border-black px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-colors"
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
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 pb-4">No items.</p>
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
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">SKU {l.sku ?? '-'} · {new Date(l.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-black">{payoutLabel(offers.get(l.id))}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-black/50">{statusOf(l).label}</span>
                  </div>
                </div>
                <button
                  onClick={() => onDelete(l)}
                  disabled={deletingId === l.id}
                  title="Delete listing"
                  className="self-start text-black/30 hover:text-black disabled:opacity-50 shrink-0"
                >
                  {deletingId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-black/10">
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Item</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">SKU</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Status</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Your payout</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Added</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right"></th>
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-black/5">
                    <td className="py-3 px-3"><Link to={`/product/${l.id}`} className="flex items-center gap-3 hover:underline">
                      <div className="h-12 w-9 bg-zinc-100 overflow-hidden flex-shrink-0"><img src={variantUrl(l.image_url, 'thumb')} alt="" className="h-full w-full object-cover" /></div>
                      <span className="text-xs font-black uppercase tracking-tight">{l.title}</span>
                    </Link></td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">{l.sku ?? '-'}</td>
                    <td className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">{statusOf(l).label}</td>
                    <td className="py-3 px-3 text-xs font-black">{payoutLabel(offers.get(l.id))}</td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onDelete(l)}
                        disabled={deletingId === l.id}
                        title="Delete listing"
                        className="text-black/30 hover:text-black disabled:opacity-50"
                      >
                        {deletingId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
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

/** Sits above the table when something is waiting on the vendor. */
function OfferCallout({ rows, offers }: { rows: Listing[]; offers: Map<string, VendorOffer> }) {
  return (
    <div className="border border-black">
      <div className="border-b border-black px-6 py-4 sm:px-8">
        <span className="text-[9px] font-black uppercase tracking-[0.4em]">
          {rows.length === 1 ? 'An offer is waiting for you' : `${rows.length} offers are waiting for you`}
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((l) => (
          <li key={l.id} className="border-b border-black/10 last:border-b-0">
            <Link
              to={`/offer/${l.id}`}
              className="group flex items-center justify-between gap-5 px-6 py-5 sm:px-8 hover:bg-zinc-50 transition-colors"
            >
              <span className="flex flex-col gap-1.5 min-w-0">
                <span className="text-xs font-black uppercase tracking-tight truncate">{l.title}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-black/40">
                  We will pay you {formatCurrency(Number(offers.get(l.id)?.offer_amount ?? 0))}
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.25em] border-b-2 border-black pb-1 group-hover:text-black/60">
                Review
              </span>
            </Link>
          </li>
        ))}
      </ul>
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
      <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">
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
      <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/50">{label}</span>
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
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
