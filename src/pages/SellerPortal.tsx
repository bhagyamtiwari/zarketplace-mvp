// SellerPortal.tsx
//
// Seller-facing dashboard (no auth — email-gated for MVP).
// Sellers enter their email and see:
//   - Active listings (approved + not sold)
//   - Sold listings + matching orders
//   - Pending payouts (post-sale, awaiting admin release)
//   - Released payouts
// Sellers can update tracking on paid orders.
//
// Route: /seller-portal (also accepts ?email= for deep-links from emails).

import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing, Order, SellerPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, Package, Truck, Clock, CheckCircle2, X, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { log } from '../lib/log';

const splog = log('seller');

type Tab = 'listings' | 'orders' | 'payouts';

export function SellerPortal() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = React.useState<Tab>('listings');
  const [loading, setLoading] = React.useState(false);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [payouts, setPayouts] = React.useState<SellerPayout[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [showAuth, setShowAuth] = React.useState(false);

  const fetchAll = React.useCallback(async (sellerEmail: string, sellerId?: string) => {
    const t = splog.time('fetchAll');
    setLoading(true);
    setError(null);
    try {
      // Match by seller_id when available; fall back to email for legacy records.
      const orFilter = sellerId
        ? `seller_id.eq.${sellerId},seller_email.ilike.${sellerEmail}`
        : `seller_email.ilike.${sellerEmail}`;
      const [{ data: l }, { data: o }, { data: p }] = await Promise.all([
        supabase.from('listings').select('*').or(orFilter).order('created_at', { ascending: false }),
        supabase.from('orders').select('*').or(orFilter).order('created_at', { ascending: false }),
        supabase.from('seller_payouts').select('*').ilike('seller_email', sellerEmail).order('created_at', { ascending: false }),
      ]);
      t.end({ listings: l?.length, orders: o?.length, payouts: p?.length });
      setListings((l as Listing[]) ?? []);
      setOrders((o as Order[]) ?? []);
      setPayouts((p as SellerPayout[]) ?? []);
    } catch (err: any) {
      splog.error('fetchAll THREW', err);
      setError(err?.message ?? 'Failed to load seller data');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (user?.email) fetchAll(user.email.toLowerCase(), user.id);
  }, [user, fetchAll]);

  if (authLoading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-black/30" /></div>;
  }

  if (!user) {
    return (
      <>
        <div className="mx-auto max-w-md px-4 py-32 flex flex-col items-center gap-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black text-white">
            <Lock className="h-8 w-8" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Seller Portal</span>
          <h1 className="text-4xl font-black uppercase tracking-tighter">Sign in</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-black/40">Sign in to view your listings, orders, and payouts.</p>
          <button onClick={() => setShowAuth(true)} className="bg-black px-12 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800">
            Sign In
          </button>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} message="Sign in to access the seller portal." />
      </>
    );
  }

  const submittedEmail = user.email!.toLowerCase();

  const activeListings = listings.filter((l) => !l.is_sold && l.status === 'approved');
  const soldListings = listings.filter((l) => l.is_sold);
  const pendingOrders = orders.filter((o) => o.status === 'paid');
  const shippedOrders = orders.filter((o) => o.status === 'shipped' || o.status === 'delivered');
  const pendingPayouts = payouts.filter((p) => p.status === 'pending' || p.status === 'held');
  const releasedPayouts = payouts.filter((p) => p.status === 'released');
  const pendingTotal = pendingPayouts.reduce((s, p) => s + Number(p.amount), 0);
  const releasedTotal = releasedPayouts.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Seller Portal</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Dashboard</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-black/40 mt-2">{submittedEmail}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        <StatCard label="Active Listings" value={activeListings.length.toString()} />
        <StatCard label="Items Sold" value={soldListings.length.toString()} />
        <StatCard label="Pending Payout" value={formatCurrency(pendingTotal)} accent="amber" />
        <StatCard label="Released Payout" value={formatCurrency(releasedTotal)} accent="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-black/10 mb-12">
        {([['listings', 'Listings'], ['orders', 'Orders'], ['payouts', 'Payouts']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b-2 -mb-px',
              tab === k ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 p-4 mb-8 flex items-center gap-3">
          <X className="h-4 w-4 text-red-600" />
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>
      ) : (
        <>
          {tab === 'listings' && (
            <div className="flex flex-col gap-12">
              <ListingsTable title="Active Listings" rows={activeListings} />
              <ListingsTable title="Sold Listings" rows={soldListings} />
            </div>
          )}
          {tab === 'orders' && (
            <div className="flex flex-col gap-12">
              <OrdersTable
                title="Awaiting Shipment"
                rows={pendingOrders}
                onUpdated={() => fetchAll(submittedEmail!)}
                allowTracking
              />
              <OrdersTable title="Shipped / Delivered" rows={shippedOrders} onUpdated={() => fetchAll(submittedEmail!)} />
            </div>
          )}
          {tab === 'payouts' && (
            <PayoutsTable rows={payouts} orders={orders} />
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'amber' | 'emerald' }) {
  return (
    <div className={cn(
      'border p-6 flex flex-col gap-2',
      accent === 'amber' && 'bg-amber-50 border-amber-200',
      accent === 'emerald' && 'bg-emerald-50 border-emerald-200',
      !accent && 'bg-zinc-50 border-black/5',
    )}>
      <span className="text-[9px] font-black uppercase tracking-widest text-black/50">{label}</span>
      <span className="text-2xl font-black tracking-tighter">{value}</span>
    </div>
  );
}

function ListingsTable({ title, rows }: { title: string; rows: Listing[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">{title} ({rows.length})</h3>
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
                  <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">{l.sku ?? '—'}</td>
                  <td className="py-4 px-3 text-[10px] font-black uppercase tracking-widest">
                    {l.is_sold ? 'Sold' : l.status}
                  </td>
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

function OrdersTable({ title, rows, onUpdated, allowTracking }: { title: string; rows: Order[]; onUpdated: () => void; allowTracking?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">{title} ({rows.length})</h3>
      {rows.length === 0 ? (
        <div className="border border-black/5 bg-zinc-50 p-12 text-center text-xs font-bold uppercase tracking-widest text-black/30">No orders.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((o) => <OrderRow key={o.id} order={o} onUpdated={onUpdated} allowTracking={!!allowTracking} />)}
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, onUpdated, allowTracking }: { order: Order; onUpdated: () => void; allowTracking: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const [courier, setCourier] = React.useState(order.courier_name ?? '');
  const [tracking, setTracking] = React.useState(order.tracking_number ?? '');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!courier.trim() || !tracking.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          courier_name: courier.trim(),
          tracking_number: tracking.trim(),
          status: 'shipped',
          shipped_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (error) throw error;

      // Fire tracking-update email (best-effort)
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({ template: 'tracking_update_buyer', order_id: order.id }),
      }).catch(() => {});

      setEditing(false);
      onUpdated();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to update tracking');
    } finally {
      setSaving(false);
    }
  };

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
          <span className="text-sm font-black">{formatCurrency(Number(order.seller_payout_amount))}</span>
          <StatusPill status={order.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-black/5 text-[10px] font-bold uppercase tracking-widest text-black/60">
        <div>
          <span className="block text-black/40 mb-1">Ship to</span>
          {order.shipping_address?.fullName ?? order.shipping_address?.name}, {order.shipping_address?.address}, {order.shipping_address?.city} {order.shipping_address?.pincode}
        </div>
        <div>
          <span className="block text-black/40 mb-1">Buyer contact</span>
          {order.buyer_email} · {order.buyer_phone}
        </div>
      </div>

      {allowTracking && (
        <div className="pt-4 border-t border-black/5">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-zinc-800">
              Add Tracking & Mark Shipped
            </button>
          ) : (
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier (e.g. Delhivery)" className="flex-1 border-b border-black/10 py-2 text-sm font-bold focus:border-black outline-none" />
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" className="flex-1 border-b border-black/10 py-2 text-sm font-bold focus:border-black outline-none" />
              <button onClick={save} disabled={saving} className="bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditing(false)} className="text-[10px] font-black uppercase tracking-widest underline">Cancel</button>
            </div>
          )}
        </div>
      )}

      {(order.tracking_number || order.courier_name) && !editing && (
        <div className="pt-4 border-t border-black/5 text-[10px] font-bold uppercase tracking-widest text-black/60">
          Tracking: {order.courier_name} · {order.tracking_number}
        </div>
      )}
    </div>
  );
}

function PayoutsTable({ rows, orders }: { rows: SellerPayout[]; orders: Order[] }) {
  const orderById = React.useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">All Payouts ({rows.length})</h3>
      {rows.length === 0 ? (
        <div className="border border-black/5 bg-zinc-50 p-12 text-center text-xs font-bold uppercase tracking-widest text-black/30">No payouts yet.</div>
      ) : (
        <table className="w-full text-left">
          <thead><tr className="border-b border-black/10">
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Order</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Item</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Amount</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Status</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Released</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const o = orderById[p.order_id];
              return (
                <tr key={p.id} className="border-b border-black/5">
                  <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest">{o?.order_number ?? '—'}</td>
                  <td className="py-4 px-3 text-xs font-bold">{o?.listing_title ?? '—'}</td>
                  <td className="py-4 px-3 text-xs font-black">{formatCurrency(Number(p.amount))}</td>
                  <td className="py-4 px-3"><PayoutPill status={p.status} /></td>
                  <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">
                    {p.released_at ? new Date(p.released_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Order['status'] }) {
  const map: Record<string, string> = {
    pending: 'bg-zinc-100 text-zinc-600',
    paid: 'bg-amber-100 text-amber-700',
    shipped: 'bg-blue-100 text-blue-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-red-50 text-red-600',
  };
  return <span className={cn('px-3 py-1 text-[9px] font-black uppercase tracking-widest', map[status])}>{status}</span>;
}

function PayoutPill({ status }: { status: SellerPayout['status'] }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    released: 'bg-emerald-100 text-emerald-700',
    held: 'bg-red-100 text-red-700',
    cancelled: 'bg-zinc-100 text-zinc-500',
  };
  return <span className={cn('px-3 py-1 text-[9px] font-black uppercase tracking-widest', map[status])}>{status}</span>;
}
