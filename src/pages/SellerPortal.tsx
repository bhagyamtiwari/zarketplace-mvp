// SellerPortal - seller-facing dashboard.
// Listings (active/sold) + sold orders. For each sold order, the seller can:
//   - View buyer's payment proof (UTR + receipt) via signed URL.
//   - Add tracking (URL required, courier/number/photo optional) to ship.
//   - Edit tracking after submission.
// No payouts panel: in the no-fees launch the buyer pays the seller directly.

import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing, Order, OrderStatus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import {
  Loader2, X, Eye, EyeOff, Copy, Check, Edit3, Upload, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { LaunchOfferBanner } from '../components/LaunchOfferBanner';
import { log } from '../lib/log';
import { sendEmail } from '../lib/email';

const splog = log('seller');

type Tab = 'listings' | 'orders';
const COURIERS = ['Delhivery', 'BlueDart', 'India Post', 'DTDC', 'Ekart', 'Other'];

export function SellerPortal() {
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
  const [error, setError] = React.useState<string | null>(null);

  const fetchAll = React.useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [{ data: l, error: le }, { data: o, error: oe }] = await Promise.all([
        supabase.from('listings').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
        supabase.from('orders').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (le) throw le; if (oe) throw oe;
      setListings((l as Listing[]) ?? []);
      setOrders((o as Order[]) ?? []);
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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Seller Portal</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Dashboard</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-black/40 mt-2">{user?.email}</p>
        </div>
        <LaunchOfferBanner variant="badge" className="self-start" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <StatCard label="Active Listings" value={activeListings.length.toString()} />
        <StatCard label="Items Sold" value={soldListings.length.toString()} />
        <StatCard label="Incoming Orders" value={incomingOrders.length.toString()} accent="amber" />
      </div>

      <div className="flex gap-1 border-b border-black/10 mb-4">
        {([
          ['listings', 'My Listings', listings.length],
          ['orders', 'Sales (Orders to fulfil)', incomingOrders.length],
        ] as const).map(([k, label, count]) => (
          <button key={k} onClick={() => setTab(k)} className={cn(
            'px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b-2 -mb-px inline-flex items-center gap-2',
            tab === k ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black',
          )}>
            <span>{label}</span>
            <span className={cn(
              'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[9px] font-black rounded-full',
              tab === k ? 'bg-black text-white' : 'bg-zinc-200 text-black/60',
            )}>{count}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-12 max-w-2xl leading-relaxed">
        {tab === 'listings'
          ? 'Items you have put up for sale on zarketplace. Active items appear on browse; sold items move below once a buyer purchases them.'
          : 'Orders for items YOU sold - buyers waiting on you to verify payment and ship. (For orders YOU placed as a buyer, see "My Orders" in your profile menu.)'}
      </p>

      {error && (
        <div className="border border-red-200 bg-red-50 p-4 mb-8 flex items-center gap-3">
          <X className="h-4 w-4 text-red-600" />
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>
      ) : tab === 'listings' ? (
        <div className="flex flex-col gap-12">
          <ListingsTable title="Active" subtitle="Live on browse" rows={activeListings} />
          <ListingsTable title="Sold" subtitle="Removed from browse, awaiting fulfilment or completed" rows={soldListings} />
        </div>
      ) : (
        <OrdersList rows={incomingOrders} onUpdated={fetchAll} />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'amber' | 'emerald' }) {
  return (
    <div className={cn('border p-6 flex flex-col gap-2',
      accent === 'amber' && 'bg-amber-50 border-amber-200',
      accent === 'emerald' && 'bg-emerald-50 border-emerald-200',
      !accent && 'bg-zinc-50 border-black/5')}>
      <span className="text-[9px] font-black uppercase tracking-widest text-black/50">{label}</span>
      <span className="text-2xl font-black tracking-tighter">{value}</span>
    </div>
  );
}

function ListingsTable({ title, subtitle, rows }: { title: string; subtitle?: string; rows: Listing[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">{title}</h3>
        <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[9px] font-black rounded-full bg-zinc-200 text-black/60">{rows.length}</span>
        {subtitle && <span className="text-[10px] font-bold uppercase tracking-widest text-black/30">{subtitle}</span>}
      </div>
      {rows.length === 0 ? (
        <div className="border border-black/5 bg-zinc-50 p-12 text-center text-xs font-bold uppercase tracking-widest text-black/30">No items.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="border-b border-black/10">
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Item</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">SKU</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Status</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Price</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Listed</th>
            </tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-black/5">
                  <td className="py-4 px-3"><Link to={`/product/${l.id}`} className="flex items-center gap-3 hover:underline">
                    <div className="h-12 w-9 bg-zinc-100 overflow-hidden flex-shrink-0"><img src={l.image_url} alt="" className="h-full w-full object-cover" /></div>
                    <span className="text-xs font-black uppercase tracking-tight">{l.title}</span>
                  </Link></td>
                  <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">{l.sku ?? '-'}</td>
                  <td className="py-4 px-3 text-[10px] font-black uppercase tracking-widest">{l.is_sold ? 'Sold' : l.status}</td>
                  <td className="py-4 px-3 text-xs font-black">{formatCurrency(Number(l.sale_price ?? l.price))}</td>
                  <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">
                    {new Date(l.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrdersList({ rows, onUpdated }: { rows: Order[]; onUpdated: () => void }) {
  if (rows.length === 0) {
    return <div className="border border-black/5 bg-zinc-50 p-12 text-center text-xs font-bold uppercase tracking-widest text-black/30">No orders yet.</div>;
  }
  return (
    <div className="flex flex-col gap-4">
      {rows.map((o) => <React.Fragment key={o.id}><OrderRow order={o} onUpdated={onUpdated} /></React.Fragment>)}
    </div>
  );
}

function OrderRow({ order, onUpdated }: { order: Order; onUpdated: () => void }) {
  const [showProof, setShowProof] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  return (
    <div className="border border-black/5 bg-white p-6 flex flex-col gap-4">
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
          <StatusPill status={order.status} />
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

      <div className="pt-4 border-t border-black/5 flex flex-col gap-3">
        <button onClick={() => setShowProof((v) => !v)}
          className="self-start inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest underline">
          {showProof ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          See Payment Details
        </button>
        {showProof && <PaymentDetails order={order} />}
      </div>

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

function PaymentDetails({ order }: { order: Order }) {
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!order.payment_receipt_url) return;
    let cancelled = false;
    supabase.storage.from('order-attachments').createSignedUrl(order.payment_receipt_url, 3600).then(({ data }) => {
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [order.payment_receipt_url]);

  const copyUtr = async () => {
    if (!order.payment_utr) return;
    try { await navigator.clipboard.writeText(order.payment_utr); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="bg-zinc-50 border border-black/10 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-black uppercase tracking-widest text-black/40">UTR</span>
        {order.payment_utr ? (
          <button onClick={copyUtr} className="font-mono text-xs font-bold inline-flex items-center gap-2 hover:text-black">
            {order.payment_utr} {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        ) : <span className="text-[10px] text-black/40">Not provided</span>}
      </div>
      {signedUrl ? (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
          <img src={signedUrl} alt="receipt" className="max-h-72 object-contain border border-black/10 bg-white" />
        </a>
      ) : order.payment_receipt_url ? (
        <span className="text-[10px] text-black/40">Loading receipt…</span>
      ) : null}
      {order.payment_submitted_at && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
          Submitted {new Date(order.payment_submitted_at).toLocaleString()}
        </span>
      )}
      <p className="text-[10px] font-bold uppercase tracking-widest text-black/60 leading-relaxed border-t border-black/5 pt-3">
        Verify the payment landed in your UPI app before you ship.
      </p>
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
        setErr('Tracking URL must point to the courier\u2019s website.'); return;
      }
    } catch {
      setErr('That doesn\u2019t look like a valid URL. Paste the full courier tracking link.'); return;
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
        className="self-start bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-zinc-800 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save & mark shipped'}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const map: Record<string, string> = {
    awaiting_payment: 'bg-zinc-100 text-zinc-600',
    awaiting_verification: 'bg-amber-100 text-amber-700',
    paid: 'bg-blue-100 text-blue-700',
    shipped: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-red-50 text-red-600',
  };
  return <span className={cn('px-3 py-1 text-[9px] font-black uppercase tracking-widest', map[status])}>{status.replace(/_/g, ' ')}</span>;
}
