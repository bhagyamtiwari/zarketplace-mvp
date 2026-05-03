// TrackOrder.tsx
//
// Buyer-facing order tracking page (no auth required).
// Buyer enters order number + email; we look up the order and display:
//   - item details
//   - status timeline (Ordered → Paid → Shipped → Delivered)
//   - tracking info if shipped
//
// Route: /track-order  (also accepts ?order=...&email=... query params, used by
// the Cashfree return_url and confirmation emails to deep-link buyers).

import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Order } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, Package, Truck, CheckCircle2, Clock, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { log } from '../lib/log';

const tlog = log('track');

const STATUS_STEPS: { key: Order['status']; label: string; icon: any }[] = [
  { key: 'pending', label: 'Ordered', icon: Clock },
  { key: 'paid', label: 'Paid', icon: CheckCircle2 },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Package },
];

export function TrackOrder() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [orderNumber, setOrderNumber] = React.useState(searchParams.get('order') ?? '');
  const [email, setEmail] = React.useState(searchParams.get('email') ?? user?.email ?? '');
  const [order, setOrder] = React.useState<Order | null>(null);
  const [myOrders, setMyOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searched, setSearched] = React.useState(false);

  // When the user logs in, populate email and load their order history.
  React.useEffect(() => {
    if (!user?.email) return;
    setEmail(user.email);
    const t = tlog.time('myOrders');
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or(`buyer_id.eq.${user.id},buyer_email.ilike.${user.email}`)
        .order('created_at', { ascending: false });
      t.end({ count: data?.length, error });
      setMyOrders((data as Order[]) ?? []);
    })();
  }, [user]);

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setOrder(null);
    setSearched(true);
    if (!orderNumber || !email) {
      setError('Please enter both order number and email.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: dbErr } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber.trim())
        .ilike('buyer_email', email.trim())
        .maybeSingle();

      if (dbErr) throw dbErr;
      if (!data) {
        setError('No order found. Please check the order number and email.');
      } else {
        setOrder(data as Order);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to look up order');
    } finally {
      setLoading(false);
    }
  };

  // Auto-lookup if both query params were provided (post-payment redirect)
  React.useEffect(() => {
    const o = searchParams.get('order');
    const m = searchParams.get('email');
    if (o && m) {
      void lookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStepIdx = order
    ? STATUS_STEPS.findIndex((s) => s.key === order.status)
    : -1;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="flex flex-col gap-4 mb-12">
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Buyer Portal</span>
        <h1 className="text-5xl font-black tracking-tighter uppercase">Track Order</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/40 max-w-md">
          Enter your order number and the email you used at checkout.
        </p>
      </div>

      <form onSubmit={lookup} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 items-end">
        <div className="flex flex-col gap-2 md:col-span-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-black">Order Number</label>
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="ZKT-XXXXXXXX"
            className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all"
          />
        </div>
        <div className="flex flex-col gap-2 md:col-span-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-black">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-black py-4 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>Look Up</span>
        </button>
      </form>

      {error && (
        <div className="border border-red-200 bg-red-50 p-6 mb-8 flex items-center gap-3">
          <X className="h-4 w-4 text-red-600" />
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">{error}</p>
        </div>
      )}

      {/* When signed in, show all orders for this user. Stays visible even
          after one is selected so the buyer can switch between orders. */}
      {user && myOrders.length > 0 && (
        <div className="mb-12">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 mb-4">Your Orders</h2>
          <div className="flex flex-col">
            {myOrders.map((o) => {
              const isActive = order?.id === o.id;
              return (
              <button
                key={o.id}
                onClick={() => { setOrderNumber(o.order_number); setOrder(o); setError(null); setSearched(true); window.scrollTo({ top: 200, behavior: 'smooth' }); }}
                className={cn(
                  'flex items-center gap-4 p-4 border-b border-black/5 text-left transition-colors',
                  isActive ? 'bg-black text-white hover:bg-zinc-900' : 'hover:bg-zinc-50',
                )}
              >
                {o.listing_image_url && (
                  <img src={o.listing_image_url} alt="" className="h-14 w-14 object-cover border border-black/5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-widest truncate">{o.listing_title}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mt-1">
                    {o.order_number} · {new Date(o.created_at).toLocaleDateString()} · {formatCurrency(Number(o.total_amount))}
                  </p>
                </div>
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-widest px-2 py-1 border',
                  o.status === 'delivered' ? 'border-emerald-600 text-emerald-700' :
                  o.status === 'shipped' ? 'border-blue-600 text-blue-700' :
                  o.status === 'paid' ? 'border-black text-black' :
                  o.status === 'cancelled' || o.status === 'refunded' ? 'border-red-300 text-red-600' :
                  'border-black/30 text-black/50'
                )}>{o.status}</span>
                <ChevronRight className={cn('h-4 w-4', isActive ? 'text-white/60' : 'text-black/30')} />
              </button>
              );
            })}
          </div>
        </div>
      )}

      {!order && !loading && searched && !error && (
        <div className="border border-black/5 bg-zinc-50 p-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-black/40">No matching order yet.</p>
        </div>
      )}

      {order && (
        <div className="flex flex-col gap-12">
          {/* Item card */}
          <div className="bg-zinc-50 border border-black/5 p-8 flex gap-6">
            {order.listing_image_url && (
              <div className="h-32 w-24 flex-shrink-0 overflow-hidden border border-black/5">
                <img src={order.listing_image_url} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex flex-col gap-2 flex-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-black/50">Order #{order.order_number}</span>
              <h2 className="text-xl font-black uppercase tracking-tight">{order.listing_title}</h2>
              {order.listing_sku && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">SKU {order.listing_sku}</span>
              )}
              <span className="text-sm font-black mt-2">{formatCurrency(Number(order.total_amount))}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Order Status</h3>
            {order.status === 'cancelled' ? (
              <div className="border border-red-200 bg-red-50 p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-red-700">This order was cancelled.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {STATUS_STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const reached = currentStepIdx >= idx;
                  const current = currentStepIdx === idx;
                  return (
                    <div key={step.key} className="flex flex-col gap-3 items-start">
                      <div
                        className={cn(
                          'h-10 w-10 rounded-full flex items-center justify-center border transition-colors',
                          reached ? 'bg-black text-white border-black' : 'bg-white text-black/30 border-black/10',
                          current && 'ring-2 ring-black/30 ring-offset-2',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={cn('text-[10px] font-black uppercase tracking-widest', reached ? 'text-black' : 'text-black/30')}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tracking */}
          {(order.tracking_number || order.courier_name) && (
            <div className="bg-zinc-50 border border-black/5 p-8 flex flex-col gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Tracking</h3>
              <p className="text-sm font-bold uppercase tracking-widest">
                {order.courier_name} {order.tracking_number && `· ${order.tracking_number}`}
              </p>
            </div>
          )}

          {/* Shipping address */}
          <div className="bg-white border border-black/5 p-8 flex flex-col gap-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Shipping To</h3>
            <div className="text-xs font-bold uppercase tracking-widest leading-relaxed text-black/70">
              <p>{order.shipping_address?.fullName ?? order.shipping_address?.name}</p>
              <p>{order.shipping_address?.address}</p>
              <p>{order.shipping_address?.city}, {order.shipping_address?.pincode}</p>
              <p>{order.buyer_phone}</p>
            </div>
          </div>

          <Link to="/browse" className="text-[10px] font-black uppercase tracking-widest underline">
            Continue Shopping
          </Link>
        </div>
      )}
    </div>
  );
}
