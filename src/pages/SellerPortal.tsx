// SellerPortal - seller-facing dashboard.
// Listings (active/sold) + sold orders. What a seller does with a sold order
// depends entirely on how the listing was fulfilled (docs/SHIPPING_V2_PLAN.md):
//   - fulfillment_method 'zarketplace': nothing to enter. We book the courier
//     and buy the label; the seller packs and waits. Showing them a tracking
//     form here would invite them to post it separately, leaving us paying for
//     a pickup that never happens.
//   - fulfillment_method 'self': the seller books their own courier and must
//     submit courier + tracking number + a photo of the packed parcel before
//     the order can be marked shipped. All three are also required by the DB
//     (orders_require_self_ship_evidence), and freeze once shipped.
// MVP: buyer pays admin UPI; admin verifies, and once the order is marked
// delivered, a payout row is created automatically (48-hour review window,
// see docs/REALIGNMENT_PLAN.md). Sellers no longer create their own payout
// row by marking shipped - that used to release money before the buyer had
// even confirmed the item arrived.

import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { scrollToTop } from '../lib/scrollToTop';
import { supabase } from '../lib/supabase';
import { Listing, Order, OrderStatus, SellerPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import {
  Loader2, Edit3, Upload, ExternalLink, Trash2, Share2,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { StatusBadge } from '../components/StatusBadge';
import { listingStatusLabel } from '../lib/orderStatus';
import { OrderTimeline } from '../components/OrderTimeline';
import { ShareInstagramModal } from '../components/ShareInstagramModal';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { sendEmail } from '../lib/email';

const splog = log('seller');

type Tab = 'listings' | 'tools' | 'orders' | 'payouts';
const COURIERS = ['Delhivery', 'BlueDart', 'India Post', 'DTDC', 'Ekart', 'Other'];

export function SellerPortal() {
  useDocumentTitle('Seller Portal');

  return (
    <RequireAuth message="Sign in to access the seller portal.">
      <SellerInner />
    </RequireAuth>
  );
}

function SellerInner() {
  const { user } = useAuth();
  // Deep-linkable: /seller-portal?tab=tools lands straight on Seller Tools, which
  // is where the post-publish screen sends a seller to share their new listing.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: Tab = (['listings', 'tools', 'orders', 'payouts'] as const)
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
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [payouts, setPayouts] = React.useState<SellerPayout[]>([]);
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
      const [{ data: l, error: le }, { data: o, error: oe }, { data: p, error: pe }] = await Promise.all([
        supabase.from('listings').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
        supabase.from('orders').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
        supabase.from('seller_payouts').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (le) throw le; if (oe) throw oe; if (pe) throw pe;
      setListings((l as Listing[]) ?? []);
      setOrders((o as Order[]) ?? []);
      setPayouts((p as SellerPayout[]) ?? []);
    } catch (err: any) {
      splog.error('fetchAll', err);
      setError(err?.message ?? 'Failed to load seller data');
    } finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  const activeListings = listings.filter((l) => !l.is_sold);
  const soldListings = listings.filter((l) => l.is_sold);
  const incomingOrders = orders.filter((o) =>
    o.status === 'awaiting_verification' || o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered',
  );
  const awaitingPayouts = payouts.filter((p) => p.status === 'awaiting_payout');

  const NAV: Array<{ key: Tab; label: string; count: number; needsAction: boolean }> = [
    { key: 'listings', label: 'My Listings', count: listings.length, needsAction: false },
    { key: 'tools', label: 'Seller Tools', count: listings.length, needsAction: false },
    { key: 'orders', label: 'Sales', count: orders.length, needsAction: incomingOrders.length > 0 },
    { key: 'payouts', label: 'Payouts', count: payouts.length, needsAction: awaitingPayouts.length > 0 },
  ];

  const TAB_META: Record<Tab, { title: string; description: string }> = {
    listings: { title: 'My Listings', description: 'Items you have put up for sale. Active items appear on browse; sold items move below once a buyer purchases them.' },
    tools: { title: 'Seller Tools', description: 'Generate a branded Instagram post or story image for any of your listings in one click.' },
    orders: { title: 'Sales', description: 'Orders for items you sold. If you chose to ship it yourself, add the courier, tracking number and parcel photo once the buyer pays. Otherwise we book the courier and you just pack it. Your payout is released after delivery is confirmed and the 48-hour buyer review window closes.' },
    payouts: { title: 'Payouts', description: 'What you’re owed and what you’ve already been paid. Payouts are held until 48 hours after delivery.' },
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
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-black/30">Listings</span>
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
            List an item
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
            <div className="flex flex-col gap-10">
              <ListingsTable title="Active" rows={activeListings} onDelete={deleteListing} deletingId={deletingId} />
              <ListingsTable title="Sold" rows={soldListings} onDelete={deleteListing} deletingId={deletingId} />
            </div>
          ) : tab === 'tools' ? (
            <SellerToolsPanel listings={listings} />
          ) : tab === 'orders' ? (
            <OrdersList rows={incomingOrders} payouts={payouts} onUpdated={fetchAll} />
          ) : (
            <PayoutsView payouts={payouts} orders={orders} />
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
                <img src={l.image_url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-xs font-black uppercase tracking-tight truncate">{l.title}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">{listingStatusLabel(l.status, l.is_sold)} · {formatCurrency(Number(l.sale_price ?? l.price))}</span>
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

function ListingsTable({ title, rows, onDelete, deletingId }: {
  title: string; rows: Listing[];
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
                  <img src={l.image_url} alt="" className="h-full w-full object-cover" />
                </Link>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <Link to={`/product/${l.id}`} className="text-xs font-black uppercase tracking-tight truncate hover:underline">{l.title}</Link>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">SKU {l.sku ?? '-'} · {new Date(l.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-black">{formatCurrency(Number(l.sale_price ?? l.price))}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-black/50">{listingStatusLabel(l.status, l.is_sold)}</span>
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
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Price</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Listed</th>
                <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right"></th>
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-black/5">
                    <td className="py-3 px-3"><Link to={`/product/${l.id}`} className="flex items-center gap-3 hover:underline">
                      <div className="h-12 w-9 bg-zinc-100 overflow-hidden flex-shrink-0"><img src={l.image_url} alt="" className="h-full w-full object-cover" /></div>
                      <span className="text-xs font-black uppercase tracking-tight">{l.title}</span>
                    </Link></td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">{l.sku ?? '-'}</td>
                    <td className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">{listingStatusLabel(l.status, l.is_sold)}</td>
                    <td className="py-3 px-3 text-xs font-black">{formatCurrency(Number(l.sale_price ?? l.price))}</td>
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

function OrdersList({ rows, payouts, onUpdated }: { rows: Order[]; payouts: SellerPayout[]; onUpdated: () => void }) {
  const payoutByOrder = React.useMemo(() => new Map(payouts.map((p) => [p.order_id, p])), [payouts]);
  if (rows.length === 0) {
    return <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">No sales yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {rows.map((o) => <React.Fragment key={o.id}><OrderRow order={o} payout={payoutByOrder.get(o.id) ?? null} onUpdated={onUpdated} /></React.Fragment>)}
    </div>
  );
}

function OrderRow({ order, payout, onUpdated }: { order: Order; payout: SellerPayout | null; onUpdated: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const shippedOrDelivered = order.status === 'shipped' || order.status === 'delivered';
  // Self-ship evidence is locked by the DB once the order is shipped
  // (orders_lock_self_ship_evidence), so the form is only offered before that.
  const selfShipAwaiting = order.status === 'awaiting_verification' || order.status === 'paid';
  return (
    <div className="bg-zinc-50 border border-black/5 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {order.listing_image_url && (
            <div className="h-16 w-12 bg-zinc-100 overflow-hidden border border-black/5">
              <img src={order.listing_image_url} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-tight">{order.listing_title}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">#{order.order_number} · {order.buyer_name}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">SKU {order.listing_sku}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-sm font-black">{formatCurrency(Number(order.total_amount))}</span>
          <StatusBadge status={order.status} audience="seller" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-black/5 text-[10px] font-bold uppercase tracking-widest text-black/60">
        <div>
          <span className="block text-black/40 mb-1">Ship to</span>
          {order.shipping_address?.fullName ?? ''}, {order.shipping_address?.address ?? ''}, {order.shipping_address?.city ?? ''} {order.shipping_address?.pincode ?? ''}
        </div>
        <div>
          <span className="block text-black/40 mb-1">Buyer contact</span>
          {order.buyer_email} · {order.buyer_phone}
        </div>
      </div>

      <OrderTimeline order={order} payout={payout} audience="seller" />

      {/* The seller's job is completely different on the two fulfillment
          paths, so the panel is split rather than showing one form that only
          sometimes applies. On a zarketplace order the seller must NOT ship it
          themselves: we buy the label, and a seller who couriers it separately
          leaves us paying for a pickup that never happens. */}
      <div className="pt-4 border-t border-black/5">
        {order.fulfillment_method === 'self' ? (
          selfShipAwaiting ? (
            <SelfShipForm order={order} onSaved={() => { setEditing(false); onUpdated(); }} />
          ) : shippedOrDelivered ? (
            <SelfShipEvidence order={order} />
          ) : null
        ) : order.status === 'paid' && order.shiprocket_order_id ? (
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
            Pickup booked with Shiprocket - waiting on courier assignment. We'll notify you once it's on its way; pack the item in the meantime.
          </p>
        ) : order.status === 'awaiting_verification' || order.status === 'paid' ? (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest">We're arranging the courier</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-black/50 leading-relaxed max-w-lg">
              Pack the item and keep it ready. We book the pickup and send you the label, so there's
              nothing to enter here. Don't post it yourself: we've already paid for this shipment.
            </p>
          </div>
        ) : shippedOrDelivered && order.tracking_url ? (
          <div className="flex flex-col gap-2 text-[10px] font-bold uppercase tracking-widest text-black/60">
            <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-black underline self-start">
              <ExternalLink className="h-3 w-3" /> {order.courier ?? 'Tracking link'}
            </a>
            {order.tracking_number && <span className="font-mono">{order.tracking_number}</span>}
            {order.package_image_url && <PackagePhoto path={order.package_image_url} />}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PackagePhoto({ path }: { path: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    supabase.storage.from('order-attachments').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return null;
  return <img src={url} alt="package" className="h-24 w-24 object-cover border border-black/10" />;
}

// Self-ship only. On this path the seller books and pays for their own
// courier, so the evidence they submit here is the ONLY record we have that
// the parcel exists. All three fields are required by the DB as well
// (orders_require_self_ship_evidence), so a bypass of this form fails too.
//
// The photo is not fraud prevention: the escrow gate already covers the
// empty-envelope case, since payout waits for delivery plus the review window.
// It is what makes a contested claim adjudicable, which is why the label has
// to be in frame.
function SelfShipForm({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const [trackingUrl, setTrackingUrl] = React.useState(order.tracking_url ?? '');
  const [trackingNumber, setTrackingNumber] = React.useState(order.tracking_number ?? '');
  const [courier, setCourier] = React.useState(order.courier ?? '');
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const photoPreview = React.useMemo(
    () => (photo ? URL.createObjectURL(photo) : null), [photo]);
  React.useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const hasPhoto = !!photo || !!order.package_image_url;
  const ready = !!courier && !!trackingNumber.trim() && hasPhoto;

  const save = async () => {
    setErr(null);
    if (!courier) { setErr('Choose the courier you shipped with.'); return; }
    if (!trackingNumber.trim()) { setErr('Enter the tracking number.'); return; }
    if (!hasPhoto) { setErr('Upload a photo of the packed parcel with the label visible.'); return; }
    // Optional, but if given it has to be a real courier link the buyer can
    // open. India Post has no per-consignment URL, which is why this is not
    // required: that is the courier most self-shipping sellers use.
    const url = trackingUrl.trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setErr('Tracking link must start with http:// or https://'); return;
        }
        if (!parsed.hostname.includes('.') || parsed.hostname === 'localhost') {
          setErr('Tracking link must point to the courier\u2019s website.'); return;
        }
      } catch {
        setErr('That doesn\u2019t look like a valid link. Paste the full courier tracking URL, or leave it blank.'); return;
      }
    }
    setSaving(true);
    try {
      let pkgPath: string | null = order.package_image_url;
      if (photo) {
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `shipments/${order.order_number}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('order-attachments')
          .upload(path, photo, { contentType: photo.type });
        if (upErr) throw upErr;
        pkgPath = path;
      }
      const update: Record<string, unknown> = {
        tracking_url: url || null,
        tracking_number: trackingNumber.trim(),
        courier,
        package_image_url: pkgPath,
        status: 'shipped',
        shipped_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('orders').update(update).eq('id', order.id);
      if (error) throw error;
      void sendEmail({ template: 'tracking_update_buyer', order_id: order.id });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest">You're shipping this one yourself</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/50 leading-relaxed max-w-lg">
          Book any courier you like and pay for it yourself. You keep your full asking price.
          We need all three of the details below before your payout can be released.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest">Courier *</label>
          <select value={courier} onChange={(e) => setCourier(e.target.value)}
            className="border-b border-black/10 py-2 text-sm font-bold bg-white focus:border-black outline-none">
            <option value="">Select courier</option>
            {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest">Tracking number *</label>
          <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="EA123456789IN"
            className="border-b border-black/10 py-2 text-sm font-bold focus:border-black outline-none" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest">Tracking link (optional)</label>
        <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="https://www.indiapost.gov.in/..."
          className="border-b border-black/10 py-2 text-sm font-bold focus:border-black outline-none" />
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40">
          Leave blank if your courier has no per-parcel link. India Post doesn't.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest">Photo of the packed parcel *</label>
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40 leading-relaxed max-w-lg">
          The shipping label and the parcel have to be in the same frame. If the buyer says the item
          never arrived, this photo is what we use to settle it in your favour.
        </p>
        {photoPreview ? (
          <div className="flex items-center gap-3">
            <img src={photoPreview} alt="Packed parcel" className="h-24 w-24 object-cover border border-black/10" />
            <button onClick={() => setPhoto(null)} className="text-[10px] font-bold uppercase tracking-widest underline text-red-600">Remove</button>
          </div>
        ) : order.package_image_url ? (
          <div className="flex items-center gap-3">
            <PackagePhoto path={order.package_image_url} />
            <label className="text-[10px] font-bold uppercase tracking-widest underline cursor-pointer">
              Replace
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        ) : (
          <label className="border border-dashed border-black/20 p-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:border-black self-start">
            <Upload className="h-3 w-3" /> Choose photo
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>

      {err && <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 leading-relaxed">{err}</p>}
      <div className="flex flex-col gap-2 items-start">
        <button onClick={save} disabled={saving || !ready}
          className="border border-black px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-black">
          {saving ? 'Saving\u2026' : 'Save & mark shipped'}
        </button>
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40">
          These details lock once you mark it shipped. Contact us if something needs correcting.
        </p>
      </div>
    </div>
  );
}

// Locked view, after orders_lock_self_ship_evidence has frozen the record.
function SelfShipEvidence({ order }: { order: Order }) {
  return (
    <div className="flex flex-col gap-3 text-[10px] font-bold uppercase tracking-widest text-black/60">
      <span className="text-black/40">You shipped this one yourself</span>
      <div className="flex items-center gap-3">
        {order.tracking_url ? (
          <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-black underline">
            <ExternalLink className="h-3 w-3" /> {order.courier ?? 'Tracking link'}
          </a>
        ) : (
          <span className="text-black">{order.courier}</span>
        )}
        {order.tracking_number && <span className="font-mono normal-case tracking-normal">{order.tracking_number}</span>}
      </div>
      {order.package_image_url && <PackagePhoto path={order.package_image_url} />}
    </div>
  );
}

function PayoutsView({ payouts, orders }: { payouts: SellerPayout[]; orders: Order[] }) {
  const orderById = React.useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const awaiting = payouts.filter((p) => p.status === 'awaiting_payout');
  const paidOut = payouts.filter((p) => p.status === 'paid_out');

  return (
    <div className="flex flex-col gap-10">
      <PayoutTable title="Awaiting Payout" rows={awaiting} orderById={orderById} />
      <PayoutTable title="Paid Out" rows={paidOut} orderById={orderById} />
    </div>
  );
}

function PayoutTable({ title, rows, orderById }: {
  title: string; rows: SellerPayout[]; orderById: Map<string, Order>;
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 pb-4">No payouts.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="border-b border-black/10">
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Order</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Amount</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Delivered</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const order = orderById.get(p.order_id);
                const held = p.status === 'awaiting_payout' && p.releasable_at && new Date(p.releasable_at) > new Date();
                return (
                  <tr key={p.id} className="border-b border-black/5">
                    <td className="py-3 px-3 text-xs font-black uppercase tracking-tight">{order?.listing_title ?? order?.order_number ?? p.order_id.slice(0, 8)}</td>
                    <td className="py-3 px-3 text-xs font-black">{formatCurrency(p.amount)}</td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60 text-right">
                      {p.status === 'paid_out'
                        ? (p.paid_at ? `Paid ${new Date(p.paid_at).toLocaleDateString()}` : 'Paid')
                        : held
                          ? `Held until ${new Date(p.releasable_at as string).toLocaleDateString()}`
                          : 'Ready for payout'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
