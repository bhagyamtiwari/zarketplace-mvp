// zarketplace admin — operations console.
//
// Not an analytics dashboard: a left-sidebar-driven ops tool for resolving
// seller / buyer / shipping / payment / moderation problems fast. Every page
// shows only what that page needs; a record opens in a right-hand drawer (never
// a new route); every mutating action confirms where it matters and writes an
// audit row (see lib/adminAudit + migration admin_ops_console_foundation).
//
// Data model note: the granular shipping sub-states in the sidebar (Picked Up /
// In Transit / Failed-RTO-NDR) read orders.shipment_status, which the
// delivery-status-hook webhook syncs from Shiprocket. Only 'delivered' also
// drives the order/escrow state machine; every other sub-state is display-only.

import React from 'react';
import { supabase } from '../lib/supabase';
import { Listing, ListingStatus, Order, OrderStatus, SellerPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import {
  Loader2, Search, ChevronRight, X, ExternalLink, Package, CreditCard,
  Truck, Wallet, Users as UsersIcon, LifeBuoy, Terminal, LayoutGrid, Boxes,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { StatusBadge } from '../components/StatusBadge';
import { shipmentStatusLabel } from '../lib/orderStatus';
import { log } from '../lib/log';
import { sendEmail } from '../lib/email';
import { writeAudit, AuditEntry } from '../lib/adminAudit';

const adlog = log('admin');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  is_flagged: boolean;
  is_banned: boolean;
  created_at: string;
}

interface EmailLogRow {
  id: string;
  to_email: string;
  template: string;
  subject: string;
  status: string;
  related_order_id: string | null;
  error_message: string | null;
  created_at: string;
}

type LeafKind = 'overview' | 'orders' | 'listings' | 'payouts' | 'users' | 'emails' | 'audit' | 'settings';

interface Leaf {
  key: string;
  label: string;
  kind: LeafKind;
  order?: (o: Order) => boolean;
  listing?: (l: Listing) => boolean;
  payout?: (p: SellerPayout) => boolean;
  user?: (u: AdminUser, ctx: UserCtx) => boolean;
}

interface Section {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  leaves: Leaf[];
}

interface UserCtx { buyerIds: Set<string>; sellerIds: Set<string>; }

// ---------------------------------------------------------------------------
// Sidebar structure
// ---------------------------------------------------------------------------

const NAV: Section[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, leaves: [
    { key: 'overview', label: 'Overview', kind: 'overview' },
  ] },
  { key: 'listings', label: 'Listings', icon: Boxes, leaves: [
    { key: 'l_pending', label: 'Pending Approval', kind: 'listings', listing: (l) => l.status === 'pending' },
    { key: 'l_live', label: 'Live', kind: 'listings', listing: (l) => l.status === 'approved' && !l.is_sold },
    { key: 'l_sold', label: 'Sold', kind: 'listings', listing: (l) => l.status === 'approved' && l.is_sold },
    // Live listings that could never be picked up: no usable pickup address.
    // New/edited listings are blocked at approval by the DB trigger, so this
    // only ever holds legacy rows - but it must be visible, because such a
    // listing fails Shiprocket booking *after* the buyer has already paid.
    { key: 'l_no_pickup', label: 'Missing Pickup Address', kind: 'listings', listing: (l) => l.status === 'approved' && !l.is_sold && !l.pickup_address?.pincode },
    { key: 'l_rejected', label: 'Rejected', kind: 'listings', listing: (l) => l.status === 'rejected' },
    { key: 'l_archived', label: 'Archived', kind: 'listings', listing: (l) => l.status === 'archived' || l.status === 'suspended' },
  ] },
  { key: 'orders', label: 'Orders', icon: Package, leaves: [
    { key: 'o_awaiting_payment', label: 'Awaiting Payment', kind: 'orders', order: (o) => o.status === 'awaiting_payment' },
    { key: 'o_awaiting_verification', label: 'Awaiting Verification', kind: 'orders', order: (o) => o.status === 'awaiting_verification' },
    { key: 'o_paid', label: 'Paid', kind: 'orders', order: (o) => o.status === 'paid' },
    { key: 'o_awaiting_pickup', label: 'Awaiting Pickup', kind: 'orders', order: (o) => o.status === 'shipped' && (!o.shipment_status || o.shipment_status === 'pickup_scheduled') },
    { key: 'o_picked_up', label: 'Picked Up', kind: 'orders', order: (o) => o.shipment_status === 'picked_up' },
    { key: 'o_in_transit', label: 'In Transit', kind: 'orders', order: (o) => o.shipment_status === 'in_transit' || o.shipment_status === 'out_for_delivery' },
    { key: 'o_delivered', label: 'Delivered', kind: 'orders', order: (o) => o.status === 'delivered' },
    { key: 'o_cancelled', label: 'Cancelled', kind: 'orders', order: (o) => o.status === 'cancelled' },
    { key: 'o_refunded', label: 'Refunded', kind: 'orders', order: (o) => o.status === 'refunded' },
    { key: 'o_claims', label: 'Claims', kind: 'orders', order: (o) => o.claim_open },
  ] },
  { key: 'payouts', label: 'Payouts', icon: Wallet, leaves: [
    { key: 'p_pending', label: 'Pending', kind: 'payouts', payout: (p) => p.status === 'awaiting_payout' && (!p.releasable_at || new Date(p.releasable_at) > new Date()) },
    { key: 'p_processing', label: 'Processing', kind: 'payouts', payout: (p) => p.status === 'awaiting_payout' && !!p.releasable_at && new Date(p.releasable_at) <= new Date() },
    { key: 'p_paid', label: 'Paid', kind: 'payouts', payout: (p) => p.status === 'paid_out' },
  ] },
  { key: 'users', label: 'Users', icon: UsersIcon, leaves: [
    { key: 'u_buyers', label: 'Buyers', kind: 'users', user: (u, c) => c.buyerIds.has(u.id) },
    { key: 'u_sellers', label: 'Sellers', kind: 'users', user: (u, c) => c.sellerIds.has(u.id) },
    { key: 'u_flagged', label: 'Flagged', kind: 'users', user: (u) => u.is_flagged },
    { key: 'u_banned', label: 'Banned', kind: 'users', user: (u) => u.is_banned },
  ] },
  { key: 'support', label: 'Support', icon: LifeBuoy, leaves: [
    { key: 's_claims', label: 'Open Claims', kind: 'orders', order: (o) => o.claim_open },
    { key: 's_refunds', label: 'Refund Requests', kind: 'orders', order: (o) => o.status === 'cancelled' || o.status === 'payment_conflict' },
    { key: 's_shipping', label: 'Shipping Problems', kind: 'orders', order: (o) => !!o.shiprocket_order_id && !o.tracking_number && o.status !== 'delivered' },
    { key: 's_payment', label: 'Payment Problems', kind: 'orders', order: (o) => o.status === 'payment_failed' || o.status === 'payment_conflict' },
  ] },
  { key: 'shiprocket', label: 'Shiprocket', icon: Truck, leaves: [
    { key: 'sr_queue', label: 'Pickup Queue', kind: 'orders', order: (o) => o.status === 'paid' && !o.shiprocket_order_id },
    { key: 'sr_active', label: 'Active Shipments', kind: 'orders', order: (o) => !!o.shiprocket_order_id && o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'refunded' },
    { key: 'sr_failed', label: 'Failed / RTO / NDR', kind: 'orders', order: (o) => (!!o.shiprocket_order_id && !o.tracking_number) || o.shipment_status === 'rto' || o.shipment_status === 'ndr' },
  ] },
  { key: 'razorpay', label: 'Razorpay', icon: CreditCard, leaves: [
    { key: 'rz_failures', label: 'Payment Failures', kind: 'orders', order: (o) => o.status === 'payment_failed' },
    { key: 'rz_conflicts', label: 'Conflicts', kind: 'orders', order: (o) => o.status === 'payment_conflict' },
    { key: 'rz_refunds', label: 'Refund Queue', kind: 'orders', order: (o) => o.status === 'cancelled' || o.status === 'refunded' || o.status === 'payment_conflict' },
  ] },
  { key: 'system', label: 'System', icon: Terminal, leaves: [
    { key: 'sys_emails', label: 'Email Logs', kind: 'emails' },
    { key: 'sys_audit', label: 'Audit Logs', kind: 'audit' },
    { key: 'sys_settings', label: 'Settings', kind: 'settings' },
  ] },
];

const LEAF_BY_KEY = new Map<string, Leaf>();
for (const s of NAV) for (const l of s.leaves) LEAF_BY_KEY.set(l.key, l);

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function Admin() {
  return (
    <RequireAuth requireAdmin message="Sign in with an admin account.">
      <Console />
    </RequireAuth>
  );
}

function Console() {
  const { user } = useAuth();
  const [activeKey, setActiveKey] = React.useState('overview');
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [payouts, setPayouts] = React.useState<SellerPayout[]>([]);
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [emails, setEmails] = React.useState<EmailLogRow[]>([]);
  const [audit, setAudit] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [drawer, setDrawer] = React.useState<{ type: 'order' | 'listing'; id: string } | null>(null);

  const leaf = LEAF_BY_KEY.get(activeKey) ?? NAV[0].leaves[0];

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [o, l, p, u, e, a] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('listings').select('*').order('created_at', { ascending: false }),
        supabase.from('seller_payouts').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, email, full_name, phone, is_admin, is_flagged, is_banned, created_at').order('created_at', { ascending: false }),
        supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(500),
      ]);
      setOrders((o.data as Order[]) ?? []);
      setListings((l.data as Listing[]) ?? []);
      setPayouts((p.data as SellerPayout[]) ?? []);
      setUsers((u.data as AdminUser[]) ?? []);
      setEmails((e.data as EmailLogRow[]) ?? []);
      setAudit((a.data as AuditEntry[]) ?? []);
    } catch (err) { adlog.error('loadAll', err); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void loadAll(); }, [loadAll]);

  const userCtx: UserCtx = React.useMemo(() => ({
    buyerIds: new Set(orders.map((o) => o.buyer_id).filter(Boolean) as string[]),
    sellerIds: new Set(listings.map((l) => l.seller_id).filter(Boolean) as string[]),
  }), [orders, listings]);

  // counts for the sidebar badges (only the actionable ones are surfaced)
  const countFor = (l: Leaf): number => {
    if (l.order) return orders.filter(l.order).length;
    if (l.listing) return listings.filter(l.listing).length;
    if (l.payout) return payouts.filter(l.payout).length;
    if (l.user) return users.filter((u) => l.user!(u, userCtx)).length;
    return 0;
  };

  const drawerOrder = drawer?.type === 'order' ? orders.find((o) => o.id === drawer.id) ?? null : null;
  const drawerListing = drawer?.type === 'listing' ? listings.find((l) => l.id === drawer.id) ?? null : null;

  return (
    <div className="min-h-screen pt-16 flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-black/10 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto py-6 px-3 hidden md:block">
        <div className="px-3 pb-4 mb-2 border-b border-black/5">
          <p className="text-[11px] font-black uppercase tracking-widest">Ops Console</p>
          <p className="text-[10px] text-black/40 truncate">{user?.email}</p>
        </div>
        <nav className="flex flex-col gap-4">
          {NAV.map((section) => (
            <div key={section.key}>
              <div className="flex items-center gap-2 px-3 mb-1">
                <section.icon className="h-3 w-3 text-black/30" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black/40">{section.label}</span>
              </div>
              <div className="flex flex-col">
                {section.leaves.filter((l) => l.kind !== 'overview' || section.key === 'overview').map((l) => {
                  const count = ['orders', 'listings', 'payouts', 'users'].includes(l.kind) ? countFor(l) : 0;
                  const active = activeKey === l.key;
                  return (
                    <button key={l.key} onClick={() => setActiveKey(l.key)}
                      className={cn('flex items-center justify-between pl-7 pr-3 py-1.5 text-left text-[11px] font-bold tracking-tight rounded transition-colors',
                        active ? 'bg-black text-white' : 'text-black/60 hover:bg-black/[0.04] hover:text-black')}>
                      <span>{l.label}</span>
                      {count > 0 && <span className={cn('text-[9px] font-black tabular-nums', active ? 'text-white/70' : 'text-black/40')}>{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/10 px-6 py-3 flex items-center gap-4">
          <GlobalSearch orders={orders} listings={listings} users={users}
            onOpenOrder={(id) => setDrawer({ type: 'order', id })}
            onOpenListing={(id) => setDrawer({ type: 'listing', id })} />
          <button onClick={() => void loadAll()} title="Refresh"
            className="text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
          </button>
        </div>

        <div className="p-6">
          <h1 className="text-2xl font-black tracking-tighter uppercase mb-6">{leaf.label}</h1>
          {loading ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-black/20" /></div>
          ) : (
            <LeafView
              leaf={leaf} orders={orders} listings={listings} payouts={payouts} users={users}
              emails={emails} audit={audit} userCtx={userCtx}
              onOpenOrder={(id) => setDrawer({ type: 'order', id })}
              onOpenListing={(id) => setDrawer({ type: 'listing', id })}
            />
          )}
        </div>
      </main>

      {/* Drawer */}
      {drawerOrder && (
        <OrderDrawer order={drawerOrder} orders={orders} payouts={payouts} emails={emails} audit={audit}
          onClose={() => setDrawer(null)} onDone={loadAll} />
      )}
      {drawerListing && (
        <ListingDrawer listing={drawerListing} orders={orders} payouts={payouts} audit={audit}
          onClose={() => setDrawer(null)} onDone={loadAll}
          onOpenOrder={(id) => setDrawer({ type: 'order', id })} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

function GlobalSearch({ orders, listings, users, onOpenOrder, onOpenListing }: {
  orders: Order[]; listings: Listing[]; users: AdminUser[];
  onOpenOrder: (id: string) => void; onOpenListing: (id: string) => void;
}) {
  const [q, setQ] = React.useState('');
  const term = q.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (term.length < 2) return [] as { type: 'order' | 'listing'; id: string; label: string; sub: string }[];
    const out: { type: 'order' | 'listing'; id: string; label: string; sub: string }[] = [];
    for (const o of orders) {
      const hay = [o.order_number, o.buyer_email, o.seller_email, o.buyer_phone, o.tracking_number,
        o.shiprocket_order_id, o.listing_id, o.listing_title].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(term)) out.push({ type: 'order', id: o.id, label: o.order_number, sub: `${o.listing_title ?? ''} · ${o.buyer_email}` });
      if (out.length > 8) break;
    }
    for (const l of listings) {
      const hay = [l.id, l.sku, l.title, l.seller_email].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(term)) out.push({ type: 'listing', id: l.id, label: l.title, sub: l.seller_email ?? '' });
      if (out.length > 16) break;
    }
    return out;
  }, [term, orders, listings]);

  return (
    <div className="relative flex-1 max-w-xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/30" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order #, email, phone, tracking, AWB, listing id…"
        className="w-full pl-9 pr-3 py-2 text-xs border border-black/10 rounded focus:outline-none focus:border-black" />
      {results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-black/10 rounded shadow-lg max-h-80 overflow-y-auto z-20">
          {results.map((r) => (
            <button key={`${r.type}-${r.id}`}
              onClick={() => { r.type === 'order' ? onOpenOrder(r.id) : onOpenListing(r.id); setQ(''); }}
              className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-black/[0.04] border-b border-black/5 last:border-0">
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{r.label}</p>
                <p className="text-[10px] text-black/40 truncate">{r.sub}</p>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-black/30">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function LeafView({ leaf, orders, listings, payouts, users, emails, audit, userCtx, onOpenOrder, onOpenListing }: {
  leaf: Leaf; orders: Order[]; listings: Listing[]; payouts: SellerPayout[]; users: AdminUser[];
  emails: EmailLogRow[]; audit: AuditEntry[]; userCtx: UserCtx;
  onOpenOrder: (id: string) => void; onOpenListing: (id: string) => void;
}) {
  if (leaf.kind === 'overview') return <OverviewView orders={orders} listings={listings} payouts={payouts} />;
  if (leaf.kind === 'orders') return <OrdersView rows={orders.filter(leaf.order ?? (() => true))} onOpen={onOpenOrder} />;
  if (leaf.kind === 'listings') return <ListingsView rows={listings.filter(leaf.listing ?? (() => true))} orders={orders} onOpen={onOpenListing} />;
  if (leaf.kind === 'payouts') return <PayoutsView rows={payouts.filter(leaf.payout ?? (() => true))} orders={orders} />;
  if (leaf.kind === 'users') return <UsersView rows={users.filter((u) => (leaf.user ?? (() => true))(u, userCtx))} />;
  if (leaf.kind === 'emails') return <EmailsView rows={emails} />;
  if (leaf.kind === 'audit') return <AuditView rows={audit} />;
  if (leaf.kind === 'settings') return <SettingsView />;
  return null;
}

function Empty({ label }: { label: string }) {
  return <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 py-6">{label}</p>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn('py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40', right && 'text-right')}>{children}</th>;
}

function OverviewView({ orders, listings, payouts }: { orders: Order[]; listings: Listing[]; payouts: SellerPayout[] }) {
  const stat = (label: string, value: number | string) => (
    <div className="border border-black/10 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-black/40">{label}</p>
      <p className="text-xl font-black tabular-nums mt-1">{value}</p>
    </div>
  );
  const pendingListings = listings.filter((l) => l.status === 'pending').length;
  const toVerify = orders.filter((o) => o.status === 'awaiting_verification').length;
  const toBook = orders.filter((o) => o.status === 'paid' && !o.shiprocket_order_id).length;
  const openClaims = orders.filter((o) => o.claim_open).length;
  const payoutsDue = payouts.filter((p) => p.status === 'awaiting_payout' && (!p.releasable_at || new Date(p.releasable_at) <= new Date())).length;
  const shipFailed = orders.filter((o) => !!o.shiprocket_order_id && !o.tracking_number).length;
  const noPickupAddr = listings.filter((l) => l.status === 'approved' && !l.is_sold && !l.pickup_address?.pincode).length;
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-black/40 mb-2">Needs attention</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stat('Pending listings', pendingListings)}
          {stat('To verify', toVerify)}
          {stat('To book pickup', toBook)}
          {stat('Open claims', openClaims)}
          {stat('Payouts due', payoutsDue)}
          {stat('Shipping failures', shipFailed)}
          {stat('No pickup address', noPickupAddr)}
        </div>
      </div>
    </div>
  );
}

function OrdersView({ rows, onOpen }: { rows: Order[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <Empty label="No orders." />;
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Order</Th><Th>Item</Th><Th>Buyer</Th><Th>Seller</Th><Th right>Amount</Th><Th>Date</Th><Th>Status</Th><Th right>Open</Th>
        </tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o.id)} className="border-b border-black/5 last:border-0 hover:bg-black/[0.03] cursor-pointer">
              <td className="py-3 px-3 text-[11px] font-black uppercase tracking-tight whitespace-nowrap">{o.order_number}</td>
              <td className="py-3 px-3 text-xs font-medium max-w-[220px] truncate">{o.listing_title}</td>
              <td className="py-3 px-3 text-[11px]">{o.buyer_email}</td>
              <td className="py-3 px-3 text-[11px]">{o.seller_email}</td>
              <td className="py-3 px-3 text-xs font-black text-right tabular-nums">{formatCurrency(Number(o.total_amount))}</td>
              <td className="py-3 px-3 text-[10px] text-black/50 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="py-3 px-3"><StatusBadge status={o.status} audience="admin" />{o.claim_open && <span className="ml-1 text-[9px] font-black uppercase text-red-600">Claim</span>}</td>
              <td className="py-3 px-3 text-right"><ChevronRight className="h-4 w-4 text-black/30 inline" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListingsView({ rows, orders, onOpen }: { rows: Listing[]; orders: Order[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <Empty label="No listings." />;
  const orderByListing = new Map<string, Order>();
  for (const o of orders) if (o.listing_id && o.status !== 'cancelled' && o.status !== 'refunded') orderByListing.set(o.listing_id, o);
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Item</Th><Th>Seller</Th><Th right>Price</Th><Th>State</Th><Th>Order</Th><Th right>Open</Th>
        </tr></thead>
        <tbody>
          {rows.map((l) => {
            const ord = l.is_sold ? orderByListing.get(l.id) : undefined;
            return (
              <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-black/5 last:border-0 hover:bg-black/[0.03] cursor-pointer">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-8 shrink-0 overflow-hidden bg-zinc-100 border border-black/5">
                      <img src={l.image_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="min-w-0"><p className="text-xs font-bold truncate max-w-[200px]">{l.title}</p>
                      <p className="text-[10px] text-black/40 uppercase tracking-widest">{l.brand}{l.free_shipping && <span className="ml-2 text-black/60">Free shipping</span>}</p></div>
                  </div>
                </td>
                <td className="py-3 px-3 text-[11px]">{l.seller_email}</td>
                <td className="py-3 px-3 text-xs font-black text-right tabular-nums">{formatCurrency(l.price)}</td>
                <td className="py-3 px-3">
                  <span className={cn('text-[9px] font-black uppercase tracking-widest',
                    l.is_sold ? 'text-red-600' : l.status === 'approved' ? 'text-emerald-700' : 'text-black/50')}>
                    {l.is_sold ? 'Sold' : l.status === 'approved' ? 'Live' : l.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/50">{ord ? ord.order_number : '—'}</td>
                <td className="py-3 px-3 text-right"><ChevronRight className="h-4 w-4 text-black/30 inline" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsView({ rows, orders }: { rows: SellerPayout[]; orders: Order[] }) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const [busy, setBusy] = React.useState<string | null>(null);
  if (rows.length === 0) return <Empty label="No payouts." />;
  const markPaid = async (p: SellerPayout) => {
    if (p.releasable_at && new Date(p.releasable_at) > new Date()) { alert(`Held until ${new Date(p.releasable_at).toLocaleString()}.`); return; }
    if (!confirm(`Mark payout of ${formatCurrency(Number(p.amount))} as paid? Confirm you have sent the UPI transfer.`)) return;
    setBusy(p.id);
    try {
      const { error } = await supabase.from('seller_payouts').update({ status: 'paid_out', paid_at: new Date().toISOString() }).eq('id', p.id);
      if (error) throw error;
      await writeAudit({ entity: 'payout', entity_id: p.id, action: 'payout.mark_paid', old_state: { status: p.status }, new_state: { status: 'paid_out' } });
      if (p.order_id) void sendEmail({ template: 'payout_released_seller', order_id: p.order_id });
      location.reload();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(null); }
  };
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Order</Th><Th>Seller UPI</Th><Th right>Amount</Th><Th>Releasable</Th><Th>Status</Th><Th right>Action</Th>
        </tr></thead>
        <tbody>
          {rows.map((p) => {
            const o = byId.get(p.order_id);
            return (
              <tr key={p.id} className="border-b border-black/5 last:border-0">
                <td className="py-3 px-3 text-[11px] font-black uppercase">{o?.order_number ?? p.order_id.slice(0, 8)}</td>
                <td className="py-3 px-3 text-[11px] font-mono">{o?.seller_upi_vpa_snapshot ?? '—'}</td>
                <td className="py-3 px-3 text-xs font-black text-right tabular-nums">{formatCurrency(Number(p.amount))}</td>
                <td className="py-3 px-3 text-[10px] text-black/50">{p.releasable_at ? new Date(p.releasable_at).toLocaleDateString() : '—'}</td>
                <td className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">{p.status === 'paid_out' ? 'Paid' : 'Pending'}</td>
                <td className="py-3 px-3 text-right">
                  {p.status !== 'paid_out' && (
                    <button onClick={() => markPaid(p)} disabled={busy === p.id}
                      className="border border-black px-3 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white disabled:opacity-50">
                      {busy === p.id ? '…' : 'Mark Paid'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsersView({ rows }: { rows: AdminUser[] }) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState<string | null>(null);
  if (rows.length === 0) return <Empty label="No users." />;
  const toggle = async (u: AdminUser, field: 'is_admin' | 'is_flagged' | 'is_banned') => {
    const next = !u[field];
    if (field === 'is_admin' && u.id === user?.id && !next && !confirm('Revoke your own admin access?')) return;
    if (field === 'is_banned' && next && !confirm(`Ban ${u.email}? They will be blocked from the marketplace.`)) return;
    setBusy(u.id);
    try {
      const { error } = await supabase.from('profiles').update({ [field]: next }).eq('id', u.id);
      if (error) throw error;
      await writeAudit({ entity: 'user', entity_id: u.id, action: `user.${field}.${next ? 'set' : 'unset'}`, old_state: { [field]: u[field] }, new_state: { [field]: next }, reason: u.email });
      location.reload();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(null); }
  };
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Email</Th><Th>Name</Th><Th>Phone</Th><Th>Joined</Th><Th right>Flags</Th>
        </tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-black/5 last:border-0">
              <td className="py-3 px-3 text-[11px] font-bold">{u.email}{u.is_admin && <span className="ml-2 text-[8px] font-black uppercase bg-black text-white px-1 py-0.5">Admin</span>}</td>
              <td className="py-3 px-3 text-[11px]">{u.full_name ?? '—'}</td>
              <td className="py-3 px-3 text-[11px]">{u.phone ?? '—'}</td>
              <td className="py-3 px-3 text-[10px] text-black/50">{new Date(u.created_at).toLocaleDateString()}</td>
              <td className="py-3 px-3 text-right whitespace-nowrap">
                <button onClick={() => toggle(u, 'is_flagged')} disabled={busy === u.id}
                  className={cn('text-[9px] font-black uppercase tracking-widest mr-3', u.is_flagged ? 'text-amber-700 underline' : 'text-black/30 hover:text-black')}>Flag</button>
                <button onClick={() => toggle(u, 'is_banned')} disabled={busy === u.id}
                  className={cn('text-[9px] font-black uppercase tracking-widest mr-3', u.is_banned ? 'text-red-600 underline' : 'text-black/30 hover:text-black')}>Ban</button>
                <button onClick={() => toggle(u, 'is_admin')} disabled={busy === u.id}
                  className="text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-black">{u.is_admin ? 'Unadmin' : 'Admin'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmailsView({ rows }: { rows: EmailLogRow[] }) {
  if (rows.length === 0) return <Empty label="No emails logged." />;
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Sent</Th><Th>To</Th><Th>Template</Th><Th>Subject</Th><Th right>Status</Th>
        </tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-black/5 last:border-0">
              <td className="py-3 px-3 text-[10px] text-black/50 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
              <td className="py-3 px-3 text-[11px]">{e.to_email}</td>
              <td className="py-3 px-3 text-[10px] font-mono">{e.template}</td>
              <td className="py-3 px-3 text-[11px] max-w-[280px] truncate">{e.subject}</td>
              <td className="py-3 px-3 text-right text-[9px] font-black uppercase tracking-widest"
                title={e.error_message ?? ''}>
                <span className={e.status === 'sent' ? 'text-emerald-700' : e.status === 'failed' ? 'text-red-600' : 'text-black/40'}>{e.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditView({ rows }: { rows: AuditEntry[] }) {
  if (rows.length === 0) return <Empty label="No audit entries yet." />;
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>When</Th><Th>Admin</Th><Th>Action</Th><Th>Entity</Th><Th>Change</Th><Th>Reason</Th>
        </tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-black/5 last:border-0 align-top">
              <td className="py-3 px-3 text-[10px] text-black/50 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
              <td className="py-3 px-3 text-[11px]">{a.admin_email ?? '—'}</td>
              <td className="py-3 px-3 text-[10px] font-mono">{a.action}</td>
              <td className="py-3 px-3 text-[10px] text-black/50">{a.entity}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}</td>
              <td className="py-3 px-3 text-[10px] font-mono text-black/60 max-w-[220px] truncate">
                {a.old_state ? JSON.stringify(a.old_state) : ''} {a.new_state ? `→ ${JSON.stringify(a.new_state)}` : ''}
              </td>
              <td className="py-3 px-3 text-[10px] text-black/60 max-w-[200px] truncate">{a.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsView() {
  const [cfg, setCfg] = React.useState<{ buyer_protection_percent: number; buyer_protection_floor: number; buyer_protection_cap: number | null } | null>(null);
  const [cats, setCats] = React.useState<{ key: string; label: string; rate: number }[]>([]);
  React.useEffect(() => {
    void (async () => {
      const { data: c } = await supabase.from('pricing_config').select('*').eq('id', 1).maybeSingle();
      setCfg(c as any);
      const { data: s } = await supabase.from('shipping_categories').select('key,label,rate').order('sort_order');
      setCats((s as any) ?? []);
    })();
  }, []);
  return (
    <div className="flex flex-col gap-8 max-w-lg">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-black/40 mb-2">Buyer protection fee</p>
        {cfg ? (
          <div className="text-xs space-y-1 border border-black/10 p-4">
            <p><span className="text-black/40">Percent:</span> {cfg.buyer_protection_percent}%</p>
            <p><span className="text-black/40">Floor:</span> {formatCurrency(cfg.buyer_protection_floor)}</p>
            <p><span className="text-black/40">Cap:</span> {cfg.buyer_protection_cap != null ? formatCurrency(cfg.buyer_protection_cap) : 'None'}</p>
            <p className="text-[10px] text-black/40 pt-2">Fee = max(floor, percent × price), capped. Charged on every order server-side.</p>
          </div>
        ) : <p className="text-[11px] text-black/40">No pricing config.</p>}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-black/40 mb-2">Shipping rates</p>
        <div className="border border-black/10 divide-y divide-black/5">
          {cats.map((c) => (
            <div key={c.key} className="flex items-center justify-between px-4 py-2 text-xs">
              <span>{c.label}</span><span className="font-black tabular-nums">{formatCurrency(c.rate)}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-black/40 pt-2">Edit rates directly in Supabase for now (they are the source of truth).</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer scaffolding
// ---------------------------------------------------------------------------

function DrawerShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-black/10 px-5 py-4 flex items-start justify-between">
          <div className="min-w-0"><p className="text-sm font-black uppercase tracking-tight truncate">{title}</p>
            {subtitle && <p className="text-[10px] text-black/40 truncate">{subtitle}</p>}</div>
          <button onClick={onClose} className="text-black/40 hover:text-black"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-black/40 mb-2 border-b border-black/5 pb-1">{title}</p>
      <div className="text-xs space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <p className="flex justify-between gap-3"><span className="text-black/40">{k}</span><span className="text-right font-medium">{v || '—'}</span></p>;
}

// ---------------------------------------------------------------------------
// Order drawer
// ---------------------------------------------------------------------------

function OrderDrawer({ order, payouts, emails, audit, onClose, onDone }: {
  order: Order; orders: Order[]; payouts: SellerPayout[]; emails: EmailLogRow[]; audit: AuditEntry[];
  onClose: () => void; onDone: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const payout = payouts.find((p) => p.order_id === order.id);
  const orderEmails = emails.filter((e) => e.related_order_id === order.id);
  const orderAudit = audit.filter((a) => a.entity === 'order' && a.entity_id === order.id);

  const setStatus = async (status: OrderStatus, reason?: string) => {
    setBusy(true);
    try {
      const update: Record<string, unknown> = { status };
      if (status === 'shipped') update.shipped_at = new Date().toISOString();
      const { error } = await supabase.from('orders').update(update).eq('id', order.id);
      if (error) throw error;
      if (order.listing_id) {
        const isSold = !(status === 'cancelled' || status === 'refunded');
        await supabase.from('listings').update({ is_sold: isSold }).eq('id', order.listing_id);
      }
      await writeAudit({ entity: 'order', entity_id: order.id, action: `order.status.${status}`, old_state: { status: order.status }, new_state: { status }, reason: reason ?? null });
      // Buyer "delivered" email + 48h review window notice (the Shiprocket
      // webhook sends this on auto-delivery; this covers the manual path).
      if (status === 'delivered' && order.status !== 'delivered') {
        void sendEmail({ template: 'order_delivered_buyer', order_id: order.id });
      }
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };

  const cancelAndRefund = async () => {
    const reason = prompt('Reason for cancelling this order? (stored in the audit log)') ?? '';
    if (!confirm('Cancel this order, relist the item, void any unpaid payout, and email both parties?\n\nRefund the payment in Razorpay manually.')) return;
    setBusy(true);
    try {
      if (payout && payout.status !== 'paid_out') await supabase.from('seller_payouts').delete().eq('id', payout.id);
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      if (error) throw error;
      if (order.listing_id) await supabase.from('listings').update({ is_sold: false }).eq('id', order.listing_id);
      await writeAudit({ entity: 'order', entity_id: order.id, action: 'order.cancel', old_state: { status: order.status }, new_state: { status: 'cancelled' }, reason });
      void sendEmail({ template: 'order_cancelled_buyer', order_id: order.id });
      void sendEmail({ template: 'order_cancelled_seller', order_id: order.id });
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };

  // Automated refund: hits the razorpay-refund edge function, which refunds the
  // captured payment, marks the order refunded, relists the item, voids any
  // unpaid payout, emails the buyer, and writes its own audit row.
  const refundViaRazorpay = async () => {
    const reason = prompt('Reason for refund? (stored in the audit log)') ?? '';
    if (!confirm(`Refund ${formatCurrency(Number(order.total_amount))} to the buyer via Razorpay?\n\nThe order is marked refunded, the item is relisted, and the buyer is emailed. This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('razorpay-refund', { body: { order_id: order.id, reason } });
      if (error) throw error;
      const r = data as { ok?: boolean; error?: string } | null;
      if (r && r.ok === false) throw new Error(r.error ?? 'Refund failed');
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Refund failed.'); } finally { setBusy(false); }
  };

  const bookPickup = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('shiprocket-create-order', { body: { order_id: order.id } });
      if (error) throw error;
      const r = data as { warnings?: string[] } | null;
      await writeAudit({ entity: 'order', entity_id: order.id, action: 'order.book_pickup', new_state: { shiprocket: 'booked' } });
      if (r?.warnings?.length) alert(`Booked, but: ${r.warnings.join(' ')}`);
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed to book pickup.'); } finally { setBusy(false); }
  };

  const toggleClaim = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from('orders').update({ claim_open: !order.claim_open }).eq('id', order.id);
      if (error) throw error;
      await writeAudit({ entity: 'order', entity_id: order.id, action: `order.claim.${order.claim_open ? 'close' : 'open'}`, old_state: { claim_open: order.claim_open }, new_state: { claim_open: !order.claim_open } });
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await writeAudit({ entity: 'order', entity_id: order.id, action: 'order.note', reason: note.trim() });
    setNote(''); await onDone();
  };

  const timeline: { at: string | null; label: string }[] = [
    { at: order.created_at, label: 'Order created' },
    { at: order.payment_submitted_at, label: 'Payment submitted' },
    { at: order.status === 'paid' || order.shipped_at || order.delivered_at ? order.updated_at : null, label: 'Payment confirmed' },
    { at: order.shipped_at, label: 'Shipped / picked up' },
    { at: order.delivered_at, label: 'Delivered' },
    { at: order.review_ends_at, label: 'Review window ends' },
  ].filter((t) => t.at);

  const addr = order.shipping_address ?? {};

  return (
    <DrawerShell title={order.order_number} subtitle={order.listing_title ?? ''} onClose={onClose}>
      <div className="flex items-center gap-2"><StatusBadge status={order.status} audience="admin" />{order.claim_open && <span className="text-[9px] font-black uppercase text-red-600">Claim open</span>}</div>

      <Sec title="Timeline">
        {timeline.length === 0 ? <p className="text-black/40">—</p> : timeline.map((t, i) => (
          <p key={i} className="flex justify-between gap-3"><span>{t.label}</span><span className="text-black/40 text-[10px]">{t.at ? new Date(t.at).toLocaleString() : ''}</span></p>
        ))}
      </Sec>

      <Sec title="Buyer">
        <Row k="Name" v={order.buyer_name} /><Row k="Email" v={order.buyer_email} /><Row k="Phone" v={order.buyer_phone} />
        <Row k="Ship to" v={[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')} />
        {order.buyer_note && <p className="mt-1 border-l-2 border-black/20 pl-2 text-black/70">{order.buyer_note}</p>}
      </Sec>

      <Sec title="Seller">
        <Row k="Email" v={order.seller_email} /><Row k="UPI" v={order.seller_upi_vpa_snapshot} />
      </Sec>

      <Sec title="Payment">
        <Row k="Item" v={formatCurrency(Number(order.amount))} />
        <Row k="Shipping (buyer paid)" v={order.free_shipping ? 'Free (seller-funded)' : formatCurrency(Number(order.shipping_cost))} />
        <Row k="Protection fee" v={formatCurrency(Number(order.buyer_protection_fee))} />
        <Row k="Total" v={<strong>{formatCurrency(Number(order.total_amount))}</strong>} />
        <Row k="Razorpay order" v={order.razorpay_order_id} />
        <Row k="Razorpay payment" v={order.razorpay_payment_id} />
      </Sec>

      <Sec title="Shipping">
        <Row k="Shiprocket #" v={order.shiprocket_order_id} />
        <Row k="AWB / tracking" v={order.tracking_number} />
        <Row k="Courier" v={order.courier} />
        <Row k="Shipment status" v={shipmentStatusLabel(order.shipment_status) ?? '—'} />
        {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] underline">Track <ExternalLink className="h-3 w-3" /></a>}
      </Sec>

      <Sec title="Payout">
        {payout ? (<>
          <Row k="Amount" v={formatCurrency(Number(payout.amount))} />
          {order.free_shipping && <Row k="Shipping deducted" v={formatCurrency(Number(order.shipping_cost))} />}
          <Row k="Status" v={payout.status === 'paid_out' ? 'Paid' : 'Pending'} />
          <Row k="Releasable" v={payout.releasable_at ? new Date(payout.releasable_at).toLocaleDateString() : '—'} />
        </>) : <p className="text-black/40">No payout row.</p>}
      </Sec>

      <Sec title={`Emails sent (${orderEmails.length})`}>
        {orderEmails.length === 0 ? <p className="text-black/40">None.</p> : orderEmails.map((e) => (
          <p key={e.id} className="flex justify-between gap-3"><span className="truncate">{e.template}</span><span className={cn('text-[10px]', e.status === 'sent' ? 'text-emerald-700' : 'text-red-600')}>{e.status}</span></p>
        ))}
      </Sec>

      <Sec title="Internal notes">
        {orderAudit.filter((a) => a.action === 'order.note').map((a) => (
          <p key={a.id} className="border-l-2 border-black/20 pl-2 text-black/70">{a.reason}<span className="block text-[9px] text-black/30">{a.admin_email} · {new Date(a.created_at).toLocaleString()}</span></p>
        ))}
        <div className="flex gap-2 mt-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 border border-black/10 px-2 py-1 text-xs focus:outline-none focus:border-black" />
          <button onClick={addNote} className="border border-black px-2 py-1 text-[10px] font-black uppercase">Add</button>
        </div>
      </Sec>

      <Sec title="Admin actions">
        <div className="flex flex-col gap-2 pt-1">
          {order.status === 'awaiting_verification' && <ActBtn label="Mark Paid" onClick={() => setStatus('paid')} busy={busy} />}
          {order.status === 'paid' && !order.shiprocket_order_id && <ActBtn label="Book Pickup (Shiprocket)" onClick={bookPickup} busy={busy} />}
          {order.status === 'paid' && <ActBtn label="Mark Shipped" onClick={() => setStatus('shipped')} busy={busy} />}
          {order.status === 'shipped' && <ActBtn label="Mark Delivered" onClick={() => setStatus('delivered')} busy={busy} />}
          <ActBtn label={order.claim_open ? 'Close Claim' : 'Open Claim'} onClick={toggleClaim} busy={busy} />
          {/* Captured payment -> refund it via Razorpay (automated). */}
          {order.razorpay_payment_id && order.status !== 'refunded' && (
            <ActBtn label="Refund via Razorpay" danger onClick={refundViaRazorpay} busy={busy} />
          )}
          {/* No captured payment -> just cancel + relist (nothing to refund). */}
          {!order.razorpay_payment_id && order.status !== 'cancelled' && order.status !== 'refunded' && (
            <ActBtn label="Cancel & relist" danger onClick={cancelAndRefund} busy={busy} />
          )}
        </div>
      </Sec>
    </DrawerShell>
  );
}

function ActBtn({ label, onClick, busy, danger }: { label: string; onClick: () => void; busy: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={cn('border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50',
        danger ? 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white' : 'border-black hover:bg-black hover:text-white')}>
      {busy ? '…' : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Listing drawer
// ---------------------------------------------------------------------------

function ListingDrawer({ listing, orders, payouts, audit, onClose, onDone, onOpenOrder }: {
  listing: Listing; orders: Order[]; payouts: SellerPayout[]; audit: AuditEntry[];
  onClose: () => void; onDone: () => Promise<void> | void; onOpenOrder: (id: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const order = orders.find((o) => o.listing_id === listing.id && o.status !== 'cancelled' && o.status !== 'refunded');
  const payout = order ? payouts.find((p) => p.order_id === order.id) : undefined;
  const modHistory = audit.filter((a) => a.entity === 'listing' && a.entity_id === listing.id);

  const setStatus = async (status: ListingStatus, label: string) => {
    if (!confirm(`${label} "${listing.title}"?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('listings').update({ status }).eq('id', listing.id);
      if (error) throw error;
      await writeAudit({ entity: 'listing', entity_id: listing.id, action: `listing.${status}`, old_state: { status: listing.status }, new_state: { status }, reason: listing.title });
      // Tell the seller their item is live (only on a fresh approval).
      if (status === 'approved' && listing.status !== 'approved' && listing.seller_email) {
        void sendEmail({ template: 'listing_approved_seller', extra: { seller_email: listing.seller_email, listing_title: listing.title, listing_id: listing.id } });
      }
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm(`Permanently delete "${listing.title}"? Existing orders keep their record.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('listings').delete().eq('id', listing.id);
      if (error) throw error;
      await writeAudit({ entity: 'listing', entity_id: listing.id, action: 'listing.delete', old_state: { status: listing.status }, reason: listing.title });
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };

  return (
    <DrawerShell title={listing.title} subtitle={listing.brand ?? ''} onClose={onClose}>
      <div className="grid grid-cols-3 gap-1">
        {listing.image_urls.slice(0, 6).map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-[3/4] overflow-hidden bg-zinc-100 border border-black/5">
            <img src={u} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className={cn('text-[9px] font-black uppercase tracking-widest', listing.is_sold ? 'text-red-600' : listing.status === 'approved' ? 'text-emerald-700' : 'text-black/50')}>
          {listing.is_sold ? 'Sold' : listing.status === 'approved' ? 'Live' : listing.status}
        </span>
      </div>

      <Sec title="Item">
        <Row k="Price" v={formatCurrency(listing.price)} />
        {listing.sale_price && <Row k="Sale price" v={formatCurrency(listing.sale_price)} />}
        <Row k="Category" v={listing.category} /><Row k="Size" v={`${listing.size ?? ''} (${listing.size_type ?? ''})`} />
        <Row k="Condition" v={listing.condition} /><Row k="Shipping cat" v={listing.shipping_category} />
        <Row k="Free shipping" v={listing.free_shipping ? 'Yes (deducted from payout)' : 'No'} />
        <Row k="Flaws" v={listing.has_flaws ? 'Disclosed' : 'None'} />
        <Row k="Authenticity" v={listing.authenticity_confirmed ? 'Confirmed' : 'Not confirmed'} />
        {listing.has_flaws && listing.flaws_description && <p className="text-black/60 mt-1">"{listing.flaws_description}"</p>}
      </Sec>

      <Sec title="Seller">
        <Row k="Email" v={listing.seller_email} /><Row k="UPI" v={listing.seller_upi_vpa} />
        {listing.seller_instagram && <a href={listing.seller_instagram} target="_blank" rel="noreferrer" className="text-[10px] underline">Instagram</a>}
      </Sec>

      {listing.is_sold && (
        <Sec title="Sale">
          <Row k="Order" v={order ? <button className="underline" onClick={() => onOpenOrder(order.id)}>{order.order_number}</button> : '—'} />
          <Row k="Buyer" v={order?.buyer_email} />
          <Row k="Shipment" v={order ? (order.tracking_number ? `${order.courier ?? ''} ${order.tracking_number}` : order.status) : '—'} />
          <Row k="Payout" v={payout ? (payout.status === 'paid_out' ? 'Paid' : 'Pending') : '—'} />
        </Sec>
      )}

      <Sec title={`Moderation history (${modHistory.length})`}>
        {modHistory.length === 0 ? <p className="text-black/40">None.</p> : modHistory.map((a) => (
          <p key={a.id} className="flex justify-between gap-2"><span className="font-mono text-[10px]">{a.action}</span><span className="text-[9px] text-black/40">{new Date(a.created_at).toLocaleDateString()}</span></p>
        ))}
      </Sec>

      <Sec title="Admin actions">
        <div className="flex flex-col gap-2 pt-1">
          {listing.status !== 'approved' && <ActBtn label="Approve" onClick={() => setStatus('approved', 'Approve')} busy={busy} />}
          {listing.status !== 'rejected' && <ActBtn label="Reject" onClick={() => setStatus('rejected', 'Reject')} busy={busy} />}
          {listing.status === 'approved' && <ActBtn label="Suspend" onClick={() => setStatus('suspended', 'Suspend')} busy={busy} />}
          {listing.status !== 'archived' && <ActBtn label="Archive" onClick={() => setStatus('archived', 'Archive')} busy={busy} />}
          {listing.is_sold && order && <ActBtn label={order.razorpay_payment_id ? 'Refund order & relist' : 'Cancel order & relist'} danger onClick={async () => {
            const reason = prompt('Reason for cancelling & relisting?') ?? '';
            setBusy(true);
            try {
              if (order.razorpay_payment_id) {
                // Money was captured: refund it (this also marks the order
                // refunded, relists, voids payout, and emails the buyer).
                if (!confirm(`Refund ${formatCurrency(Number(order.total_amount))} to the buyer via Razorpay and relist this item? This cannot be undone.`)) { setBusy(false); return; }
                const { data, error } = await supabase.functions.invoke('razorpay-refund', { body: { order_id: order.id, reason } });
                if (error) throw error;
                const r = data as { ok?: boolean; error?: string } | null;
                if (r && r.ok === false) throw new Error(r.error ?? 'Refund failed');
              } else {
                // No captured payment: just cancel + relist.
                if (!confirm('Cancel the order and put this listing back on sale?')) { setBusy(false); return; }
                if (payout && payout.status !== 'paid_out') await supabase.from('seller_payouts').delete().eq('id', payout.id);
                await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
                await supabase.from('listings').update({ is_sold: false }).eq('id', listing.id);
                await writeAudit({ entity: 'order', entity_id: order.id, action: 'order.cancel', old_state: { status: order.status }, new_state: { status: 'cancelled' }, reason });
                void sendEmail({ template: 'order_cancelled_buyer', order_id: order.id });
                void sendEmail({ template: 'order_cancelled_seller', order_id: order.id });
              }
              await onDone(); onClose();
            } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
          }} busy={busy} />}
          <ActBtn label="Delete" danger onClick={del} busy={busy} />
        </div>
      </Sec>
    </DrawerShell>
  );
}
