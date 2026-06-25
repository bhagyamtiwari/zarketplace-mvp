// SellerPortal - seller-facing dashboard.
// Listings (active/sold) + sold orders. For each sold order, the seller can:
//   - Add tracking (URL required, courier/number/photo optional) to ship.
//   - Edit tracking after submission.
// MVP: buyer pays admin UPI; admin verifies and pays seller after shipping.

import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing, Order, OrderStatus, SellerPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import {
  Loader2, Edit3, Upload, ExternalLink, Trash2,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { StatusBadge } from '../components/StatusBadge';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { sendEmail } from '../lib/email';

const splog = log('seller');

type Tab = 'listings' | 'orders' | 'payouts';
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
  const [tab, setTab] = React.useState<Tab>('listings');
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
    o.status === 'awaiting_verification' || o.status === 'paid' || o.status === 'shipped',
  );
  const awaitingPayouts = payouts.filter((p) => p.status === 'awaiting_payout');

  const NAV: Array<{ key: Tab; label: string; count: number; needsAction: boolean }> = [
    { key: 'listings', label: 'My Listings', count: listings.length, needsAction: false },
    { key: 'orders', label: 'Sales', count: orders.length, needsAction: incomingOrders.length > 0 },
    { key: 'payouts', label: 'Payouts', count: payouts.length, needsAction: awaitingPayouts.length > 0 },
  ];

  const TAB_META: Record<Tab, { title: string; description: string }> = {
    listings: { title: 'My Listings', description: 'Items you have put up for sale. Active items appear on browse; sold items move below once a buyer purchases them.' },
    orders: { title: 'Sales', description: 'Orders for items you sold. Add tracking once a buyer pays, and your payout is released once it ships.' },
    payouts: { title: 'Payouts', description: 'What you’re owed and what you’ve already been paid.' },
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
          ) : tab === 'orders' ? (
            <OrdersList rows={incomingOrders} onUpdated={fetchAll} />
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
                    <span className="text-[9px] font-black uppercase tracking-widest text-black/50">{l.is_sold ? 'Sold' : l.status}</span>
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
                    <td className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">{l.is_sold ? 'Sold' : l.status}</td>
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

function OrdersList({ rows, onUpdated }: { rows: Order[]; onUpdated: () => void }) {
  if (rows.length === 0) {
    return <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">No sales yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {rows.map((o) => <React.Fragment key={o.id}><OrderRow order={o} onUpdated={onUpdated} /></React.Fragment>)}
    </div>
  );
}

function OrderRow({ order, onUpdated }: { order: Order; onUpdated: () => void }) {
  const [editing, setEditing] = React.useState(false);
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

      {order.status === 'awaiting_verification' && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/60 leading-relaxed border-t border-black/5 pt-4">
          Payment is being verified by zarketplace. Add tracking and ship the item; your payout is released once shipping is confirmed.
        </p>
      )}

      <div className="pt-4 border-t border-black/5">
        {order.status === 'awaiting_verification' || order.status === 'paid' || (order.status === 'shipped' && editing) ? (
          <TrackingForm order={order} onSaved={() => { setEditing(false); onUpdated(); }} />
        ) : order.status === 'shipped' && order.tracking_url ? (
          <div className="flex flex-col gap-2 text-[10px] font-bold uppercase tracking-widest text-black/60">
            <div className="flex items-center justify-between gap-3">
              <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-black underline">
                <ExternalLink className="h-3 w-3" /> {order.courier ?? 'Tracking link'}
              </a>
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-black/60 hover:text-black">
                <Edit3 className="h-3 w-3" /> Edit
              </button>
            </div>
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

function TrackingForm({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const [trackingUrl, setTrackingUrl] = React.useState(order.tracking_url ?? '');
  const [trackingNumber, setTrackingNumber] = React.useState(order.tracking_number ?? '');
  const [courier, setCourier] = React.useState(order.courier ?? '');
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async () => {
    setErr(null);
    const url = trackingUrl.trim();
    if (!url) { setErr('Tracking URL is required.'); return; }
    // Must be a valid http(s) URL with a real host (not localhost / bare strings).
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setErr('Tracking URL must start with http:// or https://'); return;
      }
      if (!parsed.hostname.includes('.') || parsed.hostname === 'localhost') {
        setErr('Tracking URL must point to the courier’s website.'); return;
      }
    } catch {
      setErr('That doesn’t look like a valid URL. Paste the full courier tracking link.'); return;
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
        tracking_url: trackingUrl.trim(),
        tracking_number: trackingNumber.trim() || null,
        courier: courier.trim() || null,
        package_image_url: pkgPath,
      };
      if (order.status !== 'shipped') {
        update.status = 'shipped';
        update.shipped_at = new Date().toISOString();
      }
      const { error } = await supabase.from('orders').update(update).eq('id', order.id);
      if (error) throw error;

      // Notify buyer that their item has shipped (best effort).
      const justShipped = update.status === 'shipped';
      if (justShipped) {
        void sendEmail({ template: 'tracking_update_buyer', order_id: order.id });
        // Create the payout ledger row the moment the item ships. Best
        // effort: a failure here shouldn't block the seller from having
        // marked the order shipped, but it would mean no payout record
        // exists, so we surface it loudly in the console for now.
        if (order.seller_id) {
          const { error: payoutErr } = await supabase.from('seller_payouts').insert({
            seller_id: order.seller_id,
            order_id: order.id,
            amount: Number(order.total_amount),
          });
          if (payoutErr) splog.error('seller_payouts insert failed', payoutErr);
        }
      }

      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest">Tracking URL *</label>
        <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="https://www.delhivery.com/track/AWB123"
          className="border-b border-black/10 py-2 text-sm font-bold focus:border-black outline-none" />
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40">
          Paste the courier's tracking link (Delhivery, BlueDart, India Post, etc.).
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest">Courier</label>
          <select value={courier} onChange={(e) => setCourier(e.target.value)}
            className="border-b border-black/10 py-2 text-sm font-bold bg-white">
            <option value="">Select courier</option>
            {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest">Tracking Number</label>
          <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="AWB123" className="border-b border-black/10 py-2 text-sm font-bold focus:border-black outline-none" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest">Package Photo (recommended)</label>
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
          Upload a photo of the packed item before handing it to the courier - protects you and the buyer.
        </p>
        {photo ? (
          <div className="text-[10px] font-bold flex items-center gap-3">
            {photo.name} <button onClick={() => setPhoto(null)} className="underline text-red-600">Remove</button>
          </div>
        ) : (
          <label className="border border-dashed border-black/20 p-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:border-black self-start">
            <Upload className="h-3 w-3" /> Choose photo
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>
      {err && <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{err}</p>}
      <button onClick={save} disabled={saving}
        className="self-start border border-black px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white disabled:opacity-50">
        {saving ? 'Saving…' : 'Save & mark shipped'}
      </button>
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
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Shipped</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Paid On</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const order = orderById.get(p.order_id);
                return (
                  <tr key={p.id} className="border-b border-black/5">
                    <td className="py-3 px-3 text-xs font-black uppercase tracking-tight">{order?.listing_title ?? order?.order_number ?? p.order_id.slice(0, 8)}</td>
                    <td className="py-3 px-3 text-xs font-black">{formatCurrency(p.amount)}</td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60 text-right">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '-'}
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
