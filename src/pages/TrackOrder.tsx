// TrackOrder - buyer's "My Orders" page. Auth required. Lists every order
// where buyer_id = auth.uid() (RLS enforces this). Each row shows:
//  - status timeline (Ordered → Verified → Shipped)
//  - tracking section (link, courier, number, package photo) once available

import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, Truck, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { log } from '../lib/log';

const tlog = log('track');

const STATUS_STEPS: { key: OrderStatus; label: string; icon: any }[] = [
  { key: 'awaiting_payment', label: 'Ordered', icon: Clock },
  { key: 'awaiting_verification', label: 'Pending', icon: Clock },
  { key: 'paid', label: 'Verified', icon: CheckCircle2 },
  { key: 'shipped', label: 'Shipped', icon: Truck },
];

export function TrackOrder() {
  return (
    <RequireAuth message="Sign in to view your orders.">
      <TrackInner />
    </RequireAuth>
  );
}

function TrackInner() {
  const { user } = useAuth();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const fetchOrders = React.useCallback(async () => {
    if (!user) return;
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.from('orders').select('*')
        .eq('buyer_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      setOrders((data as Order[]) ?? []);
    } catch (e: any) {
      tlog.error('fetchOrders', e);
      setErr(e?.message ?? 'Failed to load orders');
    } finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const activeCount = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded' && o.status !== 'shipped').length;
  const completedCount = orders.filter((o) => o.status === 'shipped').length;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="flex flex-col gap-4 mb-12">
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">My Orders</span>
        <h1 className="text-5xl font-black tracking-tighter uppercase">My Purchases</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/40 max-w-xl leading-relaxed">
          Items YOU bought on zarketplace. Track payment verification and shipping here.
          (For items YOU sold, open the Seller Portal.)
        </p>
        {orders.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[9px] font-black rounded-full bg-amber-100 text-amber-700">{activeCount}</span>
              Active
            </span>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[9px] font-black rounded-full bg-emerald-100 text-emerald-700">{completedCount}</span>
              Shipped
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>
      ) : err ? (
        <div className="border border-red-200 bg-red-50 p-6 text-xs font-bold uppercase tracking-widest text-red-700">{err}</div>
      ) : orders.length === 0 ? (
        <div className="border border-black/5 bg-zinc-50 p-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-black/40 mb-6">No orders yet.</p>
          <Link to="/browse" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800">
            Browse the drop
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {orders.map((o) => <React.Fragment key={o.id}><OrderCard order={o} /></React.Fragment>)}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const idx = STATUS_STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="border border-black/5 bg-white p-6 flex flex-col gap-6">
      <div className="flex gap-4">
        {order.listing_image_url && (
          <div className="h-24 w-20 flex-shrink-0 overflow-hidden border border-black/5">
            <img src={order.listing_image_url} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-black/50">#{order.order_number}</span>
          <h2 className="text-base font-black uppercase tracking-tight truncate">{order.listing_title}</h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
            {new Date(order.created_at).toLocaleDateString()} · {formatCurrency(Number(order.total_amount))}
          </span>
        </div>
        <StatusPill status={order.status} />
      </div>

      {/* Timeline */}
      {order.status !== 'cancelled' && order.status !== 'refunded' && (
        <div className="grid grid-cols-4 gap-2 pt-4 border-t border-black/5">
          {STATUS_STEPS.map((step, i) => {
            const Icon = step.icon;
            const reached = idx >= i;
            const current = idx === i;
            return (
              <div key={step.key} className="flex flex-col gap-2 items-start">
                <div className={cn('h-9 w-9 rounded-full flex items-center justify-center border',
                  reached ? 'bg-black text-white border-black' : 'bg-white text-black/30 border-black/10',
                  current && 'ring-2 ring-black/30 ring-offset-2')}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn('text-[9px] font-black uppercase tracking-widest', reached ? 'text-black' : 'text-black/30')}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Tracking */}
      <Tracking order={order} />
    </div>
  );
}

function Tracking({ order }: { order: Order }) {
  const [pkgUrl, setPkgUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!order.package_image_url) return;
    let cancelled = false;
    supabase.storage.from('order-attachments').createSignedUrl(order.package_image_url, 3600).then(({ data }) => {
      if (!cancelled) setPkgUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [order.package_image_url]);

  return (
    <div className="border-t border-black/5 pt-4 flex flex-col gap-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-black/40">Tracking</span>
      {order.tracking_url ? (
        <div className="flex flex-col gap-2">
          <a href={order.tracking_url} target="_blank" rel="noreferrer"
            className="self-start inline-flex items-center gap-2 bg-black text-white px-5 py-3 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-zinc-800">
            <ExternalLink className="h-3 w-3" /> Track package →
          </a>
          {(order.courier || order.tracking_number) && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">
              {order.courier ?? ''} {order.tracking_number ? `· ${order.tracking_number}` : ''}
            </span>
          )}
          {pkgUrl && <img src={pkgUrl} alt="package" className="h-20 w-20 object-cover border border-black/10" />}
        </div>
      ) : (
        <div className="bg-zinc-50 border border-black/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
            Tracking unavailable. We're verifying your payment. Once confirmed, the seller will ship and add tracking. We'll email you the moment they do.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const map: Record<string, string> = {
    awaiting_payment: 'border-zinc-300 text-zinc-600',
    awaiting_verification: 'border-amber-500 text-amber-700',
    payment_failed: 'border-red-500 text-red-700',
    payment_conflict: 'border-orange-500 text-orange-700',
    paid: 'border-blue-500 text-blue-700',
    shipped: 'border-emerald-500 text-emerald-700',
    cancelled: 'border-red-300 text-red-600',
    refunded: 'border-red-300 text-red-600',
  };
  return <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 border self-start', map[status])}>{status.replace(/_/g, ' ')}</span>;
}
