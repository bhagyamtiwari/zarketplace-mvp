// My Orders: everything this account has bought from us.
//
// The buyer's side of an order is four steps, and only four, because that is
// all a buyer can see and all that is true from where they stand:
//
//   Order placed -> Order confirmed -> Shipped -> Delivered
//
// Confirmed covers everything between paying and the parcel leaving our hub:
// the item coming in to us, the check against its listing, the repack. Who we
// bought it from and when it reached us is the other transaction, not the
// buyer's, and the order row does not carry it.
//
// There used to be an escrow timeline here (Paid, Pickup, Delivered, Review,
// Paid Out) that told buyers their money was held until "the seller" was
// paid. That was the old marketplace. We sell the item ourselves; there is no
// seller on this side and nothing held in escrow.

import * as React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { Loader2, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { log } from '../lib/log';
import { shipmentStatusLabel } from '../lib/orderStatus';
import { usePageMeta, META, itemPath } from '../lib/pageMeta';
import { ui } from '../lib/ui';

const tlog = log('track');

export function TrackOrder() {
  usePageMeta(META.orders);

  return (
    <RequireAuth message="Sign in to see your orders.">
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

  return <OrdersView orders={orders} loading={loading} error={err} />;
}

/** The page itself, from data. Separate from the fetch so it can be looked at. */
export function OrdersView({ orders, loading, error }: { orders: Order[]; loading: boolean; error: string | null }) {
  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 [&>*]:max-w-2xl">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className={ui.pageTitle}>My Orders</h1>
          <p className={ui.help}>Everything you have bought from us.</p>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error ? (
          <p className={ui.error}>{error}</p>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-start gap-6">
            <p className={ui.help}>No orders yet. When you buy something, it shows up here with its tracking.</p>
            <Link to="/browse" className={ui.btnPrimary}>Shop now</Link>
          </div>
        ) : (
          <ul className="flex flex-col">
            {orders.map((o) => (
              <li key={o.id} className="border-t border-black/10 py-8 first:border-t-0 first:pt-0">
                <OrderCard order={o} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Where an order sits on the four steps, or null for an order that left the
// normal path (failed, cancelled, refunded), which gets a sentence instead.
function stepIndex(status: OrderStatus): number | null {
  switch (status) {
    case 'awaiting_payment':
    case 'awaiting_verification': return 0;
    case 'paid': return 1;
    case 'shipped': return 2;
    case 'delivered': return 3;
    default: return null;
  }
}

// For an order that left the normal path: what happened, in a sentence.
function offPathLine(status: OrderStatus): { title: string; body: string } {
  switch (status) {
    case 'payment_failed':
      return { title: 'Payment did not go through', body: 'Nothing was ordered. If money left your account, write to us and we will sort it out.' };
    case 'payment_conflict':
      return { title: 'Refunding your payment', body: 'We could not complete this order, so your payment is on its way back to you.' };
    case 'cancelled':
      return { title: 'Cancelled', body: 'Your payment is refunded to the way you paid, within 5-7 business days.' };
    case 'refunded':
      return { title: 'Refunded', body: 'Your payment has been refunded to the way you paid.' };
    default:
      return { title: 'Processing', body: '' };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

export function OrderCard({ order }: { order: Order }) {
  const idx = stepIndex(order.status);
  const itemHref = order.listing_sku ? itemPath({ sku: order.listing_sku, title: order.listing_title }) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4 sm:gap-5">
        <div className="h-24 w-[72px] shrink-0 overflow-hidden bg-zinc-100">
          {order.listing_image_url && (
            <img src={variantUrl(order.listing_image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          {itemHref ? (
            <Link to={itemHref} className="text-[15px] font-bold leading-snug hover:underline underline-offset-4">{order.listing_title}</Link>
          ) : (
            <span className="text-[15px] font-bold leading-snug">{order.listing_title}</span>
          )}
          <span>Order {order.order_number}</span>
          <span>{formatDateTime(order.created_at)}</span>
          <span className="mt-1 font-bold tabular-nums">{formatCurrency(Number(order.total_amount))}</span>
        </div>
      </div>

      {idx === null ? (
        <OffPath status={order.status} />
      ) : (
        <OrderSteps order={order} at={idx} />
      )}
    </div>
  );
}

function OffPath({ status }: { status: OrderStatus }) {
  const line = offPathLine(status);
  return (
    <div className="flex flex-col gap-1 border-l-2 border-black pl-4">
      <p className="text-sm font-bold">{line.title}</p>
      {line.body && <p className={ui.help}>{line.body}</p>}
    </div>
  );
}

// The four steps as a column: a numbered circle per step on a thin line, the
// step's name, and one line about it once it has happened. A done step shows
// a tick; the step the order is on is filled; the rest are outlines.
function OrderSteps({ order, at }: { order: Order; at: number }) {
  // The courier's live status ("Out for delivery") only while the parcel is
  // on its way; once delivered, the Delivered step says so itself.
  const courierNow = at === 2 ? shipmentStatusLabel(order.shipment_status) : null;
  const steps: Array<{ title: string; line: React.ReactNode }> = [
    {
      title: 'Order placed',
      line: at === 0 ? 'Confirming your payment. This usually takes a minute.' : null,
    },
    {
      title: 'Order confirmed',
      line: at === 1
        ? 'Payment received. We are checking your item at our hub and packing it.'
        : 'Payment received. Checked at our hub and packed.',
    },
    {
      title: 'Shipped',
      line: (
        <span className="flex flex-col gap-1">
          <span>
            {order.shipped_at ? `Left our hub on ${formatDate(order.shipped_at)}` : 'On its way to you'}
            {order.courier ? ` with ${order.courier}` : ''}.
            {courierNow ? ` ${courierNow}.` : ''}
          </span>
          {order.tracking_number && (
            <span>Tracking number <span className="whitespace-nowrap tabular-nums">{order.tracking_number}</span></span>
          )}
          <Tracking order={order} />
        </span>
      ),
    },
    {
      title: 'Delivered',
      line: (
        <>
          {order.delivered_at ? `Arrived on ${formatDate(order.delivered_at)}. ` : ''}
          Something wrong with it? <Link to="/returns" className={cn(ui.link, 'font-bold')}>Tell us within 7 days</Link>.
        </>
      ),
    },
  ];

  return (
    <ol className="flex flex-col" aria-label="Order progress">
      {steps.map((step, i) => {
        const done = i < at;
        const current = i === at;
        const reached = i <= at;
        const last = i === steps.length - 1;
        return (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
            {!last && (
              <span aria-hidden className={cn('absolute left-3 top-7 bottom-1 w-px -translate-x-1/2', i < at ? 'bg-black' : 'bg-black/15')} />
            )}
            <span
              aria-hidden
              className={cn(
                'relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black leading-none',
                reached ? 'bg-black text-white' : 'border border-black/30 bg-white text-black',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-0.5 text-sm">
              <span className={cn(reached && 'font-bold')}>{step.title}</span>
              {reached && step.line && <span className="leading-relaxed">{step.line}</span>}
            </div>
          </li>
        );
      })}
    </ol>
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

  if (!order.tracking_url) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
      <a href={order.tracking_url} target="_blank" rel="noreferrer" className={cn(ui.link, 'font-bold')}>
        Track package
      </a>
      {pkgUrl && <img src={pkgUrl} alt="Your parcel" className="h-16 w-16 object-cover" />}
    </span>
  );
}
