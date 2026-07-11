// TrackOrder - buyer's "My Orders" page. Auth required. Lists every order
// where buyer_id = auth.uid() (RLS enforces this). Each row shows:
//  - status timeline (Ordered → Verified → Shipped)
//  - tracking section (link, courier, number, package photo) once available

import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Order } from '../types';
import { formatCurrency } from '../lib/utils';
import { Loader2, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { log } from '../lib/log';
import { StatusBadge } from '../components/StatusBadge';
import { OrderTimeline } from '../components/OrderTimeline';
import { hasEscrowTimeline } from '../lib/escrowTimeline';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const tlog = log('track');

export function TrackOrder() {
  useDocumentTitle('My Orders');

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

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-14 sm:pb-20">
      <div className="flex flex-col gap-4 mb-12">
        <h1 className="text-5xl font-black tracking-tighter uppercase">My Orders</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/40 max-w-xl leading-relaxed">
          Items you've bought. Track payment and shipping.
          <br />
          For items you've sold, open the Seller Portal.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>
      ) : err ? (
        <div className="border border-red-200 bg-red-50 p-6 text-xs font-bold uppercase tracking-widest text-red-700">{err}</div>
      ) : orders.length === 0 ? (
        <EmptyState
          action={
            <Link to="/browse" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800">
              Browse All
            </Link>
          }
        >
          No orders yet.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {orders.map((o) => <React.Fragment key={o.id}><OrderCard order={o} /></React.Fragment>)}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
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
        <StatusBadge status={order.status} audience="buyer" />
      </div>

      {/* Escrow timeline */}
      {hasEscrowTimeline(order) && <OrderTimeline order={order} audience="buyer" />}

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
            <ExternalLink className="h-3 w-3" /> Track package
          </a>
          {(order.courier || order.tracking_number) && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">
              {order.courier ?? ''} {order.tracking_number ? `· ${order.tracking_number}` : ''}
            </span>
          )}
          {pkgUrl && <img src={pkgUrl} alt="package" className="h-20 w-20 object-cover border border-black/10" />}
        </div>
      ) : order.status === 'paid' ? (
        <div className="bg-zinc-50 border border-black/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
            No tracking yet. The seller is packing your item for courier pickup, and your payment stays protected in escrow until it's delivered. We'll email you the moment tracking is added.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-50 border border-black/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
            No tracking yet. We're still confirming your payment. Once it clears, the item is packed for pickup and tracking is added. We'll email you the moment it is.
          </p>
        </div>
      )}
    </div>
  );
}

