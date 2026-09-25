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
import { isDemoTitle } from '../lib/pageMeta';
import { supabase } from '../lib/supabase';
import { Listing, ListingStatus, Order, OrderStatus, VendorPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import {
  Loader2, Search, ChevronRight, X, ExternalLink, ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle, Archive, Zap, Package, CreditCard,
  Truck, Wallet, Users as UsersIcon, LifeBuoy, Terminal, LayoutGrid, Boxes, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { StatusBadge } from '../components/StatusBadge';
import { shipmentStatusLabel } from '../lib/orderStatus';
import { log } from '../lib/log';
import { sendEmail } from '../lib/email';
import { writeAudit, AuditEntry } from '../lib/adminAudit';
import { ListingEditor } from '../components/admin/ListingEditor';

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
  /** One sentence: what is in this queue and what to do with it. */
  hint: string;
  order?: (o: Order) => boolean;
  listing?: (l: Listing, a?: AcqRow) => boolean;
  payout?: (p: VendorPayout) => boolean;
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

export interface AcqRow {
  listing_id: string;
  offer_status: string;
  offer_amount: number | null;
  expected_resale: number | null;
  offered_at: string | null;
  offer_expires_at: string | null;
  reviewed_at: string | null;
  offer_round: number;
  updated_at: string | null;
}

// Six sections, one home per problem. Support, Shiprocket and Razorpay used
// to be sections of their own that re-listed the same orders under other
// names, so the same stuck order could be found in three places and it was
// never clear which one was the place to act. Every problem now lives under
// Issues, once.
//
// Each queue carries one sentence saying what is in it and what to do, so
// someone who did not build this can run it.
/** A new item nobody has answered yet: the one queue that is always ours. */
export function needsApproval(l: Listing, a?: AcqRow): boolean {
  return l.status === 'pending' && (!a || a.offer_status === 'pending_pricing');
}

const CLOSED_OFFER = new Set(['declined', 'expired', 'offer_rejected']);

const NAV: Section[] = [
  { key: 'overview', label: 'Today', icon: LayoutGrid, leaves: [
    { key: 'overview', label: 'To do', kind: 'overview',
      hint: 'Everything that needs someone today. Click a number to open that queue.' },
  ] },
  { key: 'listings', label: 'Listings', icon: Boxes, leaves: [
    // Split deliberately. These were one queue, and merging them is what let
    // an item waiting on a vendor look like work an operator could do.
    { key: 'l_triage', label: 'Needs approval', kind: 'listings',
      hint: 'New items from vendors, waiting on us. Open one, set the listed price and our offer, then send it, or reject it. We promise an answer within 24 hours.',
      listing: needsApproval },
    { key: 'l_with_vendor', label: 'Offer sent', kind: 'listings',
      hint: 'We have sent an offer, or asked for a fix, and are waiting on the vendor. Offers close by themselves after 7 days. Nothing to do.',
      listing: (l, a) => l.status === 'pending' && a?.offer_status === 'offered' },
    { key: 'l_accepted', label: 'Accepted, not live', kind: 'listings',
      hint: 'The vendor accepted but the item did not go live. Open it and approve it.',
      listing: (l, a) => l.status === 'pending' && a?.offer_status === 'accepted' },
    { key: 'l_live', label: 'Live', kind: 'listings', hint: 'On the site and for sale.',
      listing: (l) => l.status === 'approved' && !l.is_sold },
    { key: 'l_sold', label: 'Sold', kind: 'listings', hint: 'Bought by a customer. The order has the shipping.',
      listing: (l) => l.status === 'approved' && l.is_sold },
    // reject_listing writes acquisitions.offer_status, never listings.status,
    // so keying this on the listing left it permanently empty while every
    // declined item hid in the approval queue.
    { key: 'l_rejected', label: 'Closed', kind: 'listings',
      hint: 'Items we rejected, offers that ran out after 7 days, and offers the vendor turned down. Rejected and expired items can be reopened from the item.',
      listing: (l, a) => l.status !== 'approved' && (CLOSED_OFFER.has(a?.offer_status ?? '') || l.status === 'rejected') },
    { key: 'l_archived', label: 'Archived', kind: 'listings', hint: 'Taken down. Kept for the record.',
      listing: (l) => l.status === 'archived' || l.status === 'suspended' },
  ] },
  { key: 'orders', label: 'Orders', icon: Package, leaves: [
    { key: 'o_paid', label: 'To ship', kind: 'orders',
      hint: 'Paid and waiting for a pickup to be booked. Open one and book it.',
      order: (o) => o.status === 'paid' },
    { key: 'o_awaiting_verification', label: 'To verify', kind: 'orders',
      hint: 'Payment received but not yet confirmed. Check it against Razorpay.',
      order: (o) => o.status === 'awaiting_verification' },
    { key: 'o_in_transit', label: 'On the way', kind: 'orders',
      hint: 'Booked with the courier, picked up or in transit. Nothing to do unless it stalls.',
      order: (o) => o.status === 'shipped' },
    { key: 'o_delivered', label: 'Delivered', kind: 'orders', hint: 'Arrived with the buyer.',
      order: (o) => o.status === 'delivered' },
    { key: 'o_awaiting_payment', label: 'Awaiting payment', kind: 'orders',
      hint: 'Checkout started but not paid. These clear themselves after 5 minutes.',
      order: (o) => o.status === 'awaiting_payment' },
    { key: 'o_cancelled', label: 'Cancelled & refunded', kind: 'orders', hint: 'Closed orders, for the record.',
      order: (o) => o.status === 'cancelled' || o.status === 'refunded' },
  ] },
  { key: 'issues', label: 'Issues', icon: LifeBuoy, leaves: [
    { key: 'o_claims', label: 'Buyer claims', kind: 'orders',
      hint: 'A buyer says the item is wrong or not as described. Open the order and resolve it.',
      order: (o) => o.claim_open },
    { key: 's_payment', label: 'Payment problems', kind: 'orders',
      hint: 'Payments that failed or do not match Razorpay. Check each one there.',
      order: (o) => o.status === 'payment_failed' || o.status === 'payment_conflict' },
    { key: 'sr_failed', label: 'Shipping problems', kind: 'orders',
      hint: 'Booked with no tracking number, returned to origin, or not delivered. Check each one in Shiprocket.',
      order: (o) => (!!o.shiprocket_order_id && !o.tracking_number && o.status !== 'delivered') || o.shipment_status === 'rto' || o.shipment_status === 'ndr' },
    // Live listings that could never be picked up: no usable pickup address.
    // New/edited listings are blocked at approval by the DB trigger, so this
    // only ever holds legacy rows - but it must be visible, because such a
    // listing fails Shiprocket booking *after* the buyer has already paid.
    { key: 'l_no_pickup', label: 'No pickup address', kind: 'listings',
      hint: 'Live items a courier could not collect. Get an address from the vendor, or take the item down.',
      listing: (l) => l.status === 'approved' && !l.is_sold && !l.pickup_address?.pincode },
  ] },
  { key: 'payouts', label: 'Payouts', icon: Wallet, leaves: [
    { key: 'p_due', label: 'Due', kind: 'payouts', hint: 'Vendors we owe money to. Pay them and mark each one sent.',
      payout: (p) => p.status === 'due' },
    { key: 'p_failed', label: 'Failed', kind: 'payouts', hint: 'Payments to vendors that did not go through. Check the UPI ID and retry.',
      payout: (p) => p.status === 'failed' },
    { key: 'p_paid', label: 'Sent', kind: 'payouts', hint: 'Paid.', payout: (p) => p.status === 'sent' },
  ] },
  { key: 'users', label: 'People', icon: UsersIcon, leaves: [
    { key: 'u_sellers', label: 'Vendors', kind: 'users', hint: 'Everyone who has sent us an item.',
      user: (u, c) => c.sellerIds.has(u.id) },
    { key: 'u_buyers', label: 'Buyers', kind: 'users', hint: 'Everyone who has placed an order.',
      user: (u, c) => c.buyerIds.has(u.id) },
    { key: 'u_flagged', label: 'Flagged', kind: 'users', hint: 'Accounts to keep an eye on.', user: (u) => u.is_flagged },
    { key: 'u_banned', label: 'Banned', kind: 'users', hint: 'Accounts that cannot buy or sell.', user: (u) => u.is_banned },
  ] },
  { key: 'system', label: 'System', icon: Terminal, leaves: [
    { key: 'sys_emails', label: 'Emails sent', kind: 'emails', hint: 'Every email the site has sent, newest first.' },
    { key: 'sys_audit', label: 'Change log', kind: 'audit', hint: 'Every change an admin has made, and who made it.' },
    { key: 'sys_settings', label: 'Settings', kind: 'settings', hint: 'Numbers the site runs on.' },
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
  const [payouts, setPayouts] = React.useState<VendorPayout[]>([]);
  const [vendorUpi, setVendorUpi] = React.useState<Map<string, string | null>>(new Map());
  const [acqByListing, setAcqByListing] = React.useState<Map<string, AcqRow>>(new Map());
  const [refundsOverdue, setRefundsOverdue] = React.useState(0);
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
        supabase.from('payouts').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, email, full_name, phone, is_admin, is_flagged, is_banned, created_at').order('created_at', { ascending: false }),
        supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(500),
      ]);
      // The acquisition, not the listing, holds the real state of an item
      // before it goes live. Every queue and count on this page used to read
      // listings.status alone, which is why an item waiting on the VENDOR sat
      // in the operator's queue accruing hours against the 24-hour promise,
      // and why the Rejected queue was permanently empty: reject_listing sets
      // acquisitions.offer_status and never touches listings.status.
      const { data: acqRows } = await supabase
        .from('acquisitions')
        .select('listing_id, offer_status, offer_amount, expected_resale, offered_at, offer_expires_at, reviewed_at, offer_round, updated_at');
      setAcqByListing(new Map(
        ((acqRows as AcqRow[]) ?? []).map((a) => [a.listing_id, a]),
      ));
      const { data: pr } = await supabase.from('pending_refunds').select('hours_pending');
      setRefundsOverdue(((pr as Array<{ hours_pending: number }>) ?? []).filter((x) => x.hours_pending >= 24).length);
      const { data: v } = await supabase.from('vendors').select('id, upi_vpa');
      setVendorUpi(new Map(((v as Array<{ id: string; upi_vpa: string | null }>) ?? []).map((x) => [x.id, x.upi_vpa])));
      setOrders((o.data as Order[]) ?? []);
      // The demo items that filled the shop before launch (titles ending in
      // "(Demo)") are archived and never real stock: kept out of every queue
      // and count here so the portal shows only real items.
      setListings(((l.data as Listing[]) ?? []).filter((x) => !isDemoTitle(x.title)));
      setPayouts((p.data as VendorPayout[]) ?? []);
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

  const openLeaf = (key: string) => { setDrawer(null); setActiveKey(key); };

  return (
    <div className="min-h-screen pt-16 flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-black/10 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto py-6 px-3 hidden md:block">
        <div className="px-3 pb-4 mb-4 border-b border-black/10">
          <p className="text-xs font-black uppercase tracking-widest">Admin</p>
          <p className="text-xs ink-mid truncate">{user?.email}</p>
        </div>
        <nav className="flex flex-col gap-5">
          {NAV.map((section) => (
            <div key={section.key}>
              <div className="flex items-center gap-2 px-3 mb-1.5">
                <section.icon className="h-3.5 w-3.5 ink-mid" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] ink-mid">{section.label}</span>
              </div>
              <div className="flex flex-col">
                {section.leaves.map((l) => {
                  const count = ['orders', 'listings', 'payouts', 'users'].includes(l.kind) ? countFor(l) : 0;
                  const active = activeKey === l.key && !drawer;
                  return (
                    <button key={l.key} onClick={() => openLeaf(l.key)}
                      className={cn('flex items-center justify-between pl-8 pr-3 py-2 text-left text-[13px] font-semibold rounded transition-colors',
                        active ? 'bg-black text-white' : 'text-black hover:bg-black/[0.05]')}>
                      <span>{l.label}</span>
                      {count > 0 && (l.key === 'l_triage' ? (
                        // The one queue that is always ours to clear, so the
                        // one count that stands out.
                        <span className="min-w-6 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[11px] font-black tabular-nums text-black">{count}</span>
                      ) : (
                        <span className={cn('text-[11px] font-black tabular-nums', active ? '' : 'ink-mid')}>{count}</span>
                      ))}
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
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-black/10 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          {/* The sidebar is desktop-only, so a phone gets the same queues as
              one menu. Without this the console had no navigation at all on a
              phone. */}
          <select
            value={activeKey}
            onChange={(e) => openLeaf(e.target.value)}
            aria-label="Queue"
            className="md:hidden w-full border border-black/15 rounded px-3 py-2 text-sm font-semibold bg-white"
          >
            {NAV.map((section) => (
              <optgroup key={section.key} label={section.label}>
                {section.leaves.map((l) => {
                  const count = ['orders', 'listings', 'payouts', 'users'].includes(l.kind) ? countFor(l) : 0;
                  return <option key={l.key} value={l.key}>{l.label}{count > 0 ? ` (${count})` : ''}</option>;
                })}
              </optgroup>
            ))}
          </select>
          <GlobalSearch orders={orders} listings={listings} users={users}
            onOpenOrder={(id) => setDrawer({ type: 'order', id })}
            onOpenListing={(id) => setDrawer({ type: 'listing', id })} />
          <button onClick={() => void loadAll()}
            className="text-[11px] font-black uppercase tracking-widest ink-mid hover:text-black">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {/* A record opens as a page in this column, not a drawer over it:
              the drawer was a narrow strip of 9px text over a dimmed list,
              and the list was never what anyone was looking at while it was
              open. Back returns to the queue it came from. */}
          {drawerOrder ? (
            <OrderDrawer order={drawerOrder} orders={orders} payouts={payouts} emails={emails} audit={audit}
              backLabel={leaf.label} onClose={() => setDrawer(null)} onDone={loadAll} />
          ) : drawerListing ? (
            <ListingDrawer listing={drawerListing} acq={acqByListing.get(drawerListing.id)} orders={orders} payouts={payouts} audit={audit}
              backLabel={leaf.label} onClose={() => setDrawer(null)} onDone={loadAll}
              onOpenOrder={(id) => setDrawer({ type: 'order', id })} />
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-1.5 max-w-3xl">
                <h1 className="text-2xl font-black tracking-tighter uppercase">{leaf.label}</h1>
                <p className="text-sm ink-mid">{leaf.hint}</p>
              </div>
              {loading ? (
                <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin ink-mid" /></div>
              ) : (
                <LeafView
                  leaf={leaf} orders={orders} listings={listings} acqByListing={acqByListing} payouts={payouts} users={users}
                  vendorUpi={vendorUpi} refundsOverdue={refundsOverdue}
                  emails={emails} audit={audit} userCtx={userCtx}
                  onOpenOrder={(id) => setDrawer({ type: 'order', id })}
                  onOpenListing={(id) => setDrawer({ type: 'listing', id })}
                  onOpenLeaf={openLeaf}
                />
              )}
            </>
          )}
        </div>
      </main>
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
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ink-mid" />
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
                <p className="text-[11px] ink-mid truncate">{r.sub}</p>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest ink-mid">{r.type}</span>
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

function LeafView({ leaf, orders, listings, acqByListing, payouts, users, vendorUpi, refundsOverdue, emails, audit, userCtx, onOpenOrder, onOpenListing, onOpenLeaf }: {
  leaf: Leaf; orders: Order[]; listings: Listing[]; acqByListing: Map<string, AcqRow>;
  payouts: VendorPayout[]; users: AdminUser[];
  vendorUpi: Map<string, string | null>; refundsOverdue: number;
  emails: EmailLogRow[]; audit: AuditEntry[]; userCtx: UserCtx;
  onOpenOrder: (id: string) => void; onOpenListing: (id: string) => void; onOpenLeaf: (key: string) => void;
}) {
  if (leaf.kind === 'overview') return <OverviewView orders={orders} listings={listings} acqByListing={acqByListing} payouts={payouts} refundsOverdue={refundsOverdue} onOpenLeaf={onOpenLeaf} />;
  if (leaf.kind === 'orders') return <OrdersView rows={orders.filter(leaf.order ?? (() => true))} onOpen={onOpenOrder} />;
  if (leaf.kind === 'listings') return <ListingsView rows={listings.filter((l) => (leaf.listing ?? (() => true))(l, acqByListing.get(l.id)))} acqByListing={acqByListing} orders={orders} onOpen={onOpenListing} />;
  if (leaf.kind === 'payouts') return <PayoutsView rows={payouts.filter(leaf.payout ?? (() => true))} listings={listings} vendorUpi={vendorUpi} />;
  if (leaf.kind === 'users') return <UsersView rows={users.filter((u) => (leaf.user ?? (() => true))(u, userCtx))} />;
  if (leaf.kind === 'emails') return <EmailsView rows={emails} />;
  if (leaf.kind === 'audit') return <AuditView rows={audit} />;
  if (leaf.kind === 'settings') return <SettingsView />;
  return null;
}

function Empty({ label }: { label: string }) {
  return <p className="text-[11px] font-bold uppercase tracking-widest ink-mid py-6">{label}</p>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn('py-3 px-3 text-[11px] font-black uppercase tracking-widest ink-mid', right && 'text-right')}>{children}</th>;
}

function OverviewView({ orders, listings, acqByListing, payouts, refundsOverdue, onOpenLeaf }: {
  orders: Order[]; listings: Listing[]; acqByListing: Map<string, AcqRow>;
  payouts: VendorPayout[]; refundsOverdue: number; onOpenLeaf: (key: string) => void;
}) {
  const needsOffer = listings.filter((l) => needsApproval(l, acqByListing.get(l.id)));
  // Past the 24 hours the submit screen promises. Time starts from when it
  // became ours, not from submission: a vendor's rework is not on our clock.
  const triageOverdue = needsOffer.filter((l) => {
    const since = new Date(acqByListing.get(l.id)?.updated_at ?? l.created_at).getTime();
    return Date.now() - since >= 864e5;
  }).length;
  const acceptedNotLive = listings.filter((l) => l.status === 'pending' && acqByListing.get(l.id)?.offer_status === 'accepted').length;

  // In the order they should be done: money and promises owed to people first.
  const todo: Array<{ key: string; count: number; label: string; urgent?: boolean }> = [
    { key: 'o_claims', count: orders.filter((o) => o.claim_open).length, label: 'buyer claims to resolve', urgent: true },
    { key: 'l_triage', count: needsOffer.length, label: 'items need approval', urgent: triageOverdue > 0 },
    { key: 'o_paid', count: orders.filter((o) => o.status === 'paid').length, label: 'orders to ship' },
    { key: 'o_awaiting_verification', count: orders.filter((o) => o.status === 'awaiting_verification').length, label: 'payments to verify' },
    { key: 'p_due', count: payouts.filter((p) => p.status === 'due').length, label: 'vendors to pay' },
    { key: 'l_accepted', count: acceptedNotLive, label: 'accepted items to put live' },
    { key: 's_payment', count: orders.filter((o) => o.status === 'payment_failed' || o.status === 'payment_conflict').length, label: 'payment problems' },
    { key: 'sr_failed', count: orders.filter((o) => (!!o.shiprocket_order_id && !o.tracking_number && o.status !== 'delivered') || o.shipment_status === 'rto' || o.shipment_status === 'ndr').length, label: 'shipping problems' },
    { key: 'l_no_pickup', count: listings.filter((l) => l.status === 'approved' && !l.is_sold && !l.pickup_address?.pincode).length, label: 'live items with no pickup address' },
  ];
  const open = todo.filter((t) => t.count > 0);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* A standing alert, not a colour on a number. Both of these are
          promises to somebody: 24 hours to answer a vendor, and a buyer who
          has paid for an item that is not coming. */}
      {(triageOverdue > 0 || refundsOverdue > 0) && (
        <div className="flex flex-col gap-2 border-2 border-red-600 bg-red-50 px-5 py-4">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-red-700">Past due</span>
          {triageOverdue > 0 && (
            <button onClick={() => onOpenLeaf('l_triage')} className="text-left text-sm font-bold text-red-800 underline underline-offset-4">
              {triageOverdue} {triageOverdue === 1 ? 'item has' : 'items have'} waited over 24 hours for an answer.
            </button>
          )}
          {refundsOverdue > 0 && (
            <button onClick={() => onOpenLeaf('o_cancelled')} className="text-left text-sm font-bold text-red-800 underline underline-offset-4">
              {refundsOverdue} {refundsOverdue === 1 ? 'buyer has' : 'buyers have'} waited over 24 hours for a refund.
            </button>
          )}
        </div>
      )}

      {open.length === 0 ? (
        <p className="border border-black/10 px-5 py-8 text-sm font-semibold">Nothing needs doing right now.</p>
      ) : (
        <ul className="flex flex-col border-t border-black/10">
          {open.map((t) => (
            <li key={t.key} className="border-b border-black/10">
              <button onClick={() => onOpenLeaf(t.key)} className={cn('group flex w-full items-center gap-4 py-4 pr-3 text-left',
                t.key === 'l_triage' ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-black/[0.03]')}>
                <span className={cn('w-12 text-right text-2xl font-black tabular-nums', t.urgent && 'text-red-600')}>{t.count}</span>
                <span className="flex-1 text-sm font-semibold">{t.label}</span>
                <ChevronRight className="h-4 w-4 ink-mid transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
              <td className="py-3 px-3 text-[11px] ink-mid whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="py-3 px-3"><StatusBadge status={o.status} audience="admin" />{o.claim_open && <span className="ml-1 text-[11px] font-black uppercase text-red-600">Claim</span>}</td>
              <td className="py-3 px-3 text-right"><ChevronRight className="h-4 w-4 ink-mid inline" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How long an item has been waiting on us for an answer. The submit screen
 * promises 24 hours, and nothing tracked it - so the promise was only ever
 * kept by accident. Only meaningful while it is our turn.
 */
/**
 * One badge that names the actual situation. listings.status alone read
 * "pending" whether we owed an offer, an offer was sitting unanswered, or the
 * vendor had been asked for changes and might never come back.
 */
type Tone = 'amber' | 'green' | 'blue' | 'live' | 'black' | 'grey';

const TONE: Record<Tone, string> = {
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  blue: 'bg-sky-50 text-sky-900 border-sky-300',
  live: 'bg-emerald-600 text-white border-emerald-600',
  black: 'bg-black text-white border-black',
  grey: 'bg-zinc-100 text-zinc-700 border-zinc-300',
};

function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
}

/**
 * Where an item stands, in one coloured label and one line under it. Colour
 * carries whose move it is: amber is ours to do, green is done and waiting on
 * the vendor, blue is one click from live. listings.status alone said
 * "pending" for all three.
 */
export function listingState(listing: Listing, acq?: AcqRow): { label: string; detail?: string; tone: Tone; icon: React.ComponentType<{ className?: string }>; urgent?: boolean } {
  if (listing.is_sold) return { label: 'Sold', tone: 'black', icon: Package };
  if (listing.status === 'approved') return { label: 'Live', tone: 'live', icon: CheckCircle2, detail: listing.is_verified ? 'Instant ship' : undefined };
  if (listing.status === 'archived' || listing.status === 'suspended') return { label: 'Archived', tone: 'grey', icon: Archive };
  switch (acq?.offer_status) {
    case 'accepted':
      return { label: 'Accepted', tone: 'blue', icon: CheckCircle2, detail: 'Approve it to go live' };
    case 'offered': {
      const d = daysLeft(acq.offer_expires_at);
      return {
        label: 'Offer sent', tone: 'green', icon: CheckCircle2,
        detail: d == null ? 'Waiting on the vendor' : d <= 0 ? 'Expiring now' : `Waiting on the vendor, ${d} day${d === 1 ? '' : 's'} left`,
      };
    }
    case 'declined': return { label: 'Declined', tone: 'grey', icon: XCircle, detail: 'Vendor can fix and resend' };
    case 'offer_rejected': return { label: 'Vendor said no', tone: 'grey', icon: XCircle };
    case 'expired': return { label: 'Offer expired', tone: 'grey', icon: Clock, detail: 'No answer in 7 days' };
    default: {
      const hours = Math.floor((Date.now() - new Date(acq?.updated_at ?? listing.created_at).getTime()) / 36e5);
      return {
        label: 'Needs approval', tone: 'amber', icon: AlertCircle, urgent: hours >= 24,
        detail: `Waiting ${hours < 1 ? 'under an hour' : `${hours}h`}${hours >= 24 ? ', past 24h' : ''}`,
      };
    }
  }
}

function StatePill({ listing, acq, large }: { listing: Listing; acq?: AcqRow; large?: boolean }) {
  const st = listingState(listing, acq);
  const Icon = st.icon;
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={cn('inline-flex items-center gap-1.5 self-start border rounded-full font-black uppercase tracking-wider whitespace-nowrap',
        large ? 'px-3.5 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]', TONE[st.tone])}>
        <Icon className={large ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> {st.label}
      </span>
      {st.detail && (
        <span className={cn('text-xs whitespace-nowrap', st.urgent ? 'font-bold text-red-700' : 'ink-mid')}>{st.detail}</span>
      )}
    </span>
  );
}

function ListingsView({ rows, acqByListing, orders, onOpen }: { rows: Listing[]; acqByListing: Map<string, AcqRow>; orders: Order[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <Empty label="No listings." />;
  const orderByListing = new Map<string, Order>();
  for (const o of orders) if (o.listing_id && o.status !== 'cancelled' && o.status !== 'refunded') orderByListing.set(o.listing_id, o);
  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Item</Th><Th>Status</Th><Th right>Price</Th><Th>Vendor</Th><Th>Order</Th><Th right>Open</Th>
        </tr></thead>
        <tbody>
          {rows.map((l) => {
            const ord = l.is_sold ? orderByListing.get(l.id) : undefined;
            return (
              <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-black/5 last:border-0 hover:bg-black/[0.03] cursor-pointer">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-11 shrink-0 overflow-hidden bg-zinc-100 border border-black/5">
                      <img src={variantUrl(l.image_url, 'thumb')} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="min-w-0"><p className="text-sm font-bold truncate max-w-[240px]">{l.title}</p>
                      <p className="text-xs ink-mid">{[l.brand, l.category, l.size_type].filter(Boolean).join(' · ')}</p></div>
                  </div>
                </td>
                <td className="py-3 px-3"><StatePill listing={l} acq={acqByListing.get(l.id)} /></td>
                <td className="py-3 px-3 text-xs font-black text-right tabular-nums">{l.price > 0 ? formatCurrency(l.price) : '-'}</td>
                <td className="py-3 px-3 text-xs">{l.seller_email}</td>
                <td className="py-3 px-3 text-[11px] font-bold uppercase tracking-widest ink-mid">{ord ? ord.order_number : '-'}</td>
                <td className="py-3 px-3 text-right"><ChevronRight className="h-4 w-4 ink-mid inline" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Payouts, listed against the acquisition that caused them.
//
// There is deliberately no order column here, and no join to one. A payout is
// owed because we accepted an item into inventory; whether the buyer has paid,
// or been delivered to, has nothing to do with it. An operator looking at this
// screen is looking at the inbound purchase, on its own.
function PayoutsView({ rows, listings, vendorUpi }: {
  rows: VendorPayout[]; listings: Listing[]; vendorUpi: Map<string, string | null>;
}) {
  const titleById = new Map(listings.map((l) => [l.id, l.title]));
  const [busy, setBusy] = React.useState<string | null>(null);
  if (rows.length === 0) return <Empty label="No payouts." />;

  const markPaid = async (p: VendorPayout) => {
    if (!confirm(`Mark payout of ${formatCurrency(Number(p.amount))} as sent? Confirm you have made the transfer.`)) return;
    setBusy(p.id);
    try {
      const { error } = await supabase.from('payouts')
        .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', p.id);
      if (error) throw error;
      await writeAudit({ entity: 'payout', entity_id: p.id, action: 'payout.mark_sent', old_state: { status: p.status }, new_state: { status: 'sent' } });
      location.reload();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(null); }
  };

  return (
    <div className="overflow-x-auto border border-black/10">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10 bg-black/[0.02]">
          <Th>Item</Th><Th>Vendor UPI</Th><Th right>Amount</Th><Th>Due</Th><Th>Status</Th><Th right>Action</Th>
        </tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-black/5 last:border-0">
              <td className="py-3 px-3 text-[11px] font-black uppercase">
                {titleById.get(p.acquisition_id) ?? p.acquisition_id.slice(0, 8)}
              </td>
              <td className="py-3 px-3 text-[11px] font-mono">{vendorUpi.get(p.vendor_id) ?? '-'}</td>
              <td className="py-3 px-3 text-xs font-black text-right tabular-nums">{formatCurrency(Number(p.amount))}</td>
              <td className="py-3 px-3 text-[11px] ink-mid">{new Date(p.due_at).toLocaleDateString()}</td>
              <td className="py-3 px-3 text-[11px] font-black uppercase tracking-widest">
                {p.status === 'sent' ? 'Sent' : p.status === 'failed' ? 'Failed' : 'Due'}
              </td>
              <td className="py-3 px-3 text-right">
                {p.status !== 'sent' && (
                  <button onClick={() => markPaid(p)} disabled={busy === p.id}
                    className="border border-black px-3 py-1 text-[11px] font-black uppercase tracking-widest hover:bg-black hover:text-white disabled:opacity-50">
                    {busy === p.id ? '…' : 'Mark Sent'}
                  </button>
                )}
              </td>
            </tr>
          ))}
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
              <td className="py-3 px-3 text-[11px]">{u.full_name ?? '-'}</td>
              <td className="py-3 px-3 text-[11px]">{u.phone ?? '-'}</td>
              <td className="py-3 px-3 text-[11px] ink-mid">{new Date(u.created_at).toLocaleDateString()}</td>
              <td className="py-3 px-3 text-right whitespace-nowrap">
                <button onClick={() => toggle(u, 'is_flagged')} disabled={busy === u.id}
                  className={cn('text-[11px] font-black uppercase tracking-widest mr-3', u.is_flagged ? 'text-amber-700 underline' : 'ink-mid hover:text-black')}>Flag</button>
                <button onClick={() => toggle(u, 'is_banned')} disabled={busy === u.id}
                  className={cn('text-[11px] font-black uppercase tracking-widest mr-3', u.is_banned ? 'text-red-600 underline' : 'ink-mid hover:text-black')}>Ban</button>
                <button onClick={() => toggle(u, 'is_admin')} disabled={busy === u.id}
                  className="text-[11px] font-black uppercase tracking-widest ink-mid hover:text-black">{u.is_admin ? 'Unadmin' : 'Admin'}</button>
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
              <td className="py-3 px-3 text-[11px] ink-mid whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
              <td className="py-3 px-3 text-[11px]">{e.to_email}</td>
              <td className="py-3 px-3 text-[11px] font-mono">{e.template}</td>
              <td className="py-3 px-3 text-[11px] max-w-[280px] truncate">{e.subject}</td>
              <td className="py-3 px-3 text-right text-[11px] font-black uppercase tracking-widest"
                title={e.error_message ?? ''}>
                <span className={e.status === 'sent' ? 'text-emerald-700' : e.status === 'failed' ? 'text-red-600' : 'ink-mid'}>{e.status}</span>
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
              <td className="py-3 px-3 text-[11px] ink-mid whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
              <td className="py-3 px-3 text-[11px]">{a.admin_email ?? '-'}</td>
              <td className="py-3 px-3 text-[11px] font-mono">{a.action}</td>
              <td className="py-3 px-3 text-[11px] ink-mid">{a.entity}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ''}</td>
              <td className="py-3 px-3 text-[11px] font-mono ink-mid max-w-[220px] truncate">
                {a.old_state ? JSON.stringify(a.old_state) : ''} {a.new_state ? `→ ${JSON.stringify(a.new_state)}` : ''}
              </td>
              <td className="py-3 px-3 text-[11px] ink-mid max-w-[200px] truncate">{a.reason ?? ''}</td>
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
        <p className="text-[11px] font-black uppercase tracking-widest ink-mid mb-2">Buyer protection fee</p>
        {cfg ? (
          <div className="text-xs space-y-1 border border-black/10 p-4">
            <p><span className="ink-mid">Percent:</span> {cfg.buyer_protection_percent}%</p>
            <p><span className="ink-mid">Floor:</span> {formatCurrency(cfg.buyer_protection_floor)}</p>
            <p><span className="ink-mid">Cap:</span> {cfg.buyer_protection_cap != null ? formatCurrency(cfg.buyer_protection_cap) : 'None'}</p>
            <p className="text-[11px] ink-mid pt-2">Fee = max(floor, percent × price), capped. Charged on every order server-side.</p>
          </div>
        ) : <p className="text-[11px] ink-mid">No pricing config.</p>}
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest ink-mid mb-2">Shipping rates</p>
        <div className="border border-black/10 divide-y divide-black/5">
          {cats.map((c) => (
            <div key={c.key} className="flex items-center justify-between px-4 py-2 text-xs">
              <span>{c.label}</span><span className="font-black tabular-nums">{formatCurrency(c.rate)}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] ink-mid pt-2">Edit rates directly in Supabase for now (they are the source of truth).</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer scaffolding
// ---------------------------------------------------------------------------

function DrawerShell({ title, subtitle, backLabel, onClose, children }: { title: string; subtitle?: string; backLabel: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => { document.querySelector('main')?.scrollTo(0, 0); }, [title]);
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <button onClick={onClose} className="self-start inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ink-mid hover:text-black">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to {backLabel}
      </button>
      <div className="min-w-0 border-b border-black pb-4">
        <h1 className="text-2xl font-black tracking-tighter uppercase">{title}</h1>
        {subtitle && <p className="text-sm ink-mid">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-8">{children}</div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] mb-3 border-b border-black/10 pb-2">{title}</h2>
      <div className="text-sm space-y-2">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <p className="flex justify-between gap-4"><span className="ink-mid">{k}</span><span className="text-right font-medium">{v || '-'}</span></p>;
}

// ---------------------------------------------------------------------------
// Order drawer
// ---------------------------------------------------------------------------

function OrderDrawer({ order, payouts, emails, audit, backLabel, onClose, onDone }: {
  order: Order; orders: Order[]; payouts: VendorPayout[]; emails: EmailLogRow[]; audit: AuditEntry[];
  backLabel: string; onClose: () => void; onDone: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
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

  const cancelUnpaidOrder = async () => {
    const reason = prompt('Reason for cancelling this order? (stored in the audit log)') ?? '';
    // No longer says "refund it manually in Razorpay". Money is never left to
    // an operator's memory: if a payment was captured, the database refuses
    // this action and the refund control is the only way through.
    if (!confirm('Cancel this order and put the item back on sale? No money is involved: this order has no captured payment.')) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      if (error) throw error;
      if (order.listing_id) await supabase.from('listings').update({ is_sold: false }).eq('id', order.listing_id);
      await writeAudit({ entity: 'order', entity_id: order.id, action: 'order.cancel', old_state: { status: order.status }, new_state: { status: 'cancelled' }, reason });
      void sendEmail({ template: 'order_cancelled_buyer', order_id: order.id });
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

  // Booking now happens per leg, from the hub console, against the item
  // rather than the order. The inbound leg books itself when the buyer pays;
  // the outbound leg is refused until the item has been accepted at the hub.
  const bookInbound = async () => {
    if (!order.listing_id) { alert('This order has no item.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('shiprocket-book-leg', {
        body: { listing_id: order.listing_id, leg: 'INBOUND' },
      });
      if (error) throw error;
      const r = data as { warnings?: string[] } | null;
      await writeAudit({ entity: 'order', entity_id: order.id, action: 'shipment.book_inbound', new_state: { leg: 'INBOUND' } });
      if (r?.warnings?.length) alert(`Booked, but: ${r.warnings.join(' ')}`);
      await onDone(); onClose();
    } catch (err: any) { alert(err?.message ?? 'Failed to book the inbound leg.'); } finally { setBusy(false); }
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
    <DrawerShell title={order.order_number} subtitle={order.listing_title ?? ''} backLabel={backLabel} onClose={onClose}>
      <div className="flex items-center gap-2"><StatusBadge status={order.status} audience="admin" />{order.claim_open && <span className="text-[11px] font-black uppercase text-red-600">Claim open</span>}</div>

      <Sec title="Timeline">
        {timeline.length === 0 ? <p className="ink-mid">-</p> : timeline.map((t, i) => (
          <p key={i} className="flex justify-between gap-3"><span>{t.label}</span><span className="ink-mid text-[11px]">{t.at ? new Date(t.at).toLocaleString() : ''}</span></p>
        ))}
      </Sec>

      <Sec title="Buyer">
        <Row k="Name" v={order.buyer_name} /><Row k="Email" v={order.buyer_email} /><Row k="Phone" v={order.buyer_phone} />
        <Row k="Ship to" v={[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')} />
        {order.buyer_note && <p className="mt-1 border-l-2 border-black/20 pl-2">{order.buyer_note}</p>}
      </Sec>

      <Sec title="Vendor">
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
        <Row k="Shipment status" v={shipmentStatusLabel(order.shipment_status) ?? '-'} />
        {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] underline">Track <ExternalLink className="h-3 w-3" /></a>}
      </Sec>

      <Sec title={`Emails sent (${orderEmails.length})`}>
        {orderEmails.length === 0 ? <p className="ink-mid">None.</p> : orderEmails.map((e) => (
          <p key={e.id} className="flex justify-between gap-3"><span className="truncate">{e.template}</span><span className={cn('text-[11px]', e.status === 'sent' ? 'text-emerald-700' : 'text-red-600')}>{e.status}</span></p>
        ))}
      </Sec>

      <Sec title="Internal notes">
        {orderAudit.filter((a) => a.action === 'order.note').map((a) => (
          <p key={a.id} className="border-l-2 border-black/20 pl-2">{a.reason}<span className="block text-[11px] ink-mid">{a.admin_email} · {new Date(a.created_at).toLocaleString()}</span></p>
        ))}
        <div className="flex gap-2 mt-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 border border-black/10 px-2 py-1 text-xs focus:outline-none focus:border-black" />
          <button onClick={addNote} className="border border-black px-2 py-1 text-[11px] font-black uppercase">Add</button>
        </div>
      </Sec>

      <Sec title="Admin actions">
        <div className="flex flex-col gap-2 pt-1">
          {order.status === 'awaiting_verification' && <ActBtn label="Mark Paid" onClick={() => setStatus('paid')} busy={busy} />}
          {order.status === 'paid' && <ActBtn label="Book inbound leg (vendor to hub)" onClick={bookInbound} busy={busy} />}
          {order.status === 'paid' && <ActBtn label="Mark Shipped" onClick={() => setStatus('shipped')} busy={busy} />}
          {order.status === 'shipped' && <ActBtn label="Mark Delivered" onClick={() => setStatus('delivered')} busy={busy} />}
          <ActBtn label={order.claim_open ? 'Close Claim' : 'Open Claim'} onClick={toggleClaim} busy={busy} />
          {/* Captured payment -> refund it via Razorpay (automated). */}
          {order.razorpay_payment_id && order.status !== 'refunded' && (
            <ActBtn label="Refund via Razorpay" danger onClick={refundViaRazorpay} busy={busy} />
          )}
          {/* No captured payment -> just cancel + relist (nothing to refund). */}
          {!order.razorpay_payment_id && order.status !== 'cancelled' && order.status !== 'refunded' && (
            <div className="flex flex-col gap-1.5">
              <ActBtn
                label="Cancel & relist"
                danger
                onClick={cancelUnpaidOrder}
                busy={busy}
                disabled={!!order.razorpay_payment_id}
              />
              {!!order.razorpay_payment_id && (
                <p className="text-[11px] leading-relaxed ink-mid max-w-[38ch]">
                  This order has money in it. Use "Refund via Razorpay" instead, which returns the
                  payment and then closes the order. Cancelling would leave the buyer paid out of pocket.
                </p>
              )}
            </div>
          )}
        </div>
      </Sec>
    </DrawerShell>
  );
}

function ActBtn({ label, onClick, busy, danger, disabled }: { label: string; onClick: () => void; busy: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy || disabled}
      className={cn('border px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-50',
        danger ? 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white' : 'border-black hover:bg-black hover:text-white')}>
      {busy ? '…' : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Listing drawer
// ---------------------------------------------------------------------------

function ListingDrawer({ listing, acq, orders, payouts, audit, backLabel, onClose, onDone, onOpenOrder }: {
  listing: Listing; acq?: AcqRow; orders: Order[]; payouts: VendorPayout[]; audit: AuditEntry[];
  backLabel: string; onClose: () => void; onDone: () => Promise<void> | void; onOpenOrder: (id: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const order = orders.find((o) => o.listing_id === listing.id && o.status !== 'cancelled' && o.status !== 'refunded');
  // Via the acquisition, never via the order: the payout exists because we
  // bought this item, not because someone bought it from us.
  const payout = payouts.find((p) => p.acquisition_id === listing.id);
  const modHistory = audit.filter((a) => a.entity === 'listing' && a.entity_id === listing.id);

  const setStatus = async (status: ListingStatus, label: string) => {
    if (!confirm(`${label} "${listing.title}"?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('listings').update({ status }).eq('id', listing.id);
      if (error) throw error;
      await writeAudit({ entity: 'listing', entity_id: listing.id, action: `listing.${status}`, old_state: { status: listing.status }, new_state: { status }, reason: listing.title });
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

  const toggleInstant = async () => {
    const next = !listing.is_verified;
    if (next && !confirm('Turn on Instant ship? Only for items already in our hub: buyers are promised dispatch within 48 hours.')) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('listings').update({ is_verified: next }).eq('id', listing.id);
      if (error) throw error;
      await writeAudit({
        entity: 'listing', entity_id: listing.id,
        action: next ? 'listing.instant_ship.on' : 'listing.instant_ship.off',
        old_state: { is_verified: !!listing.is_verified }, new_state: { is_verified: next }, reason: listing.title,
      });
      await onDone();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };

  // "Authenticity: Confirmed" on the listing page is a claim we make in our
  // own name, so it is only ever switched on here. The vendor's own answer
  // from the sell form is shown beside it; it never sets this by itself.
  const toggleAuthentic = async () => {
    const next = !listing.authenticity_confirmed;
    if (next && !confirm('Mark this item confirmed authentic? The listing page will say "Authenticity: Confirmed".')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('listings').update({ authenticity_confirmed: next }).eq('id', listing.id).select('authenticity_confirmed');
      if (error) throw error;
      if (data?.[0]?.authenticity_confirmed !== next) throw new Error('Not saved. Check you are signed in as an admin.');
      await writeAudit({
        entity: 'listing', entity_id: listing.id,
        action: next ? 'listing.authenticity.confirmed' : 'listing.authenticity.unconfirmed',
        old_state: { authenticity_confirmed: !!listing.authenticity_confirmed }, new_state: { authenticity_confirmed: next }, reason: listing.title,
      });
      await onDone();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusy(false); }
  };
  const vendorSaysAuthentic = listing.vendor_confirms_authentic == null ? 'Not asked' : listing.vendor_confirms_authentic ? 'Yes' : 'No';

  return (
    <DrawerShell title={listing.title} subtitle={listing.brand ?? ''} backLabel={backLabel} onClose={onClose}>
      {/* Full control of the listing, whatever the vendor sent: photos,
          words, filing, condition, measurements and price. */}
      {editing ? (
        <ListingEditor
          listing={listing}
          onCancel={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await onDone(); }}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {listing.image_urls.slice(0, 10).map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-[3/4] overflow-hidden bg-zinc-100 border border-black/5">
                <img src={variantUrl(u, 'thumb')} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="self-start bg-black px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800"
          >
            Edit listing
          </button>
        </>
      )}

      <div className="flex items-center gap-2">
        <span className={cn('text-[11px] font-black uppercase tracking-widest', listing.is_sold ? 'text-red-600' : listing.status === 'approved' ? 'text-emerald-700' : 'ink-mid')}>
          {listing.is_sold ? 'Sold' : listing.status === 'approved' ? 'Live' : listing.status}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <StatePill listing={listing} acq={acq} large />
        {/* Instant ship: the item is already in our hub, so it can leave
            within 48 hours of an order. Only ever set here, by an operator:
            it is a claim about where the item physically is. */}
        <button
          type="button"
          disabled={busy}
          onClick={toggleInstant}
          aria-pressed={!!listing.is_verified}
          className={cn('inline-flex items-center gap-2 border px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50',
            listing.is_verified ? 'border-black bg-black text-white' : 'border-black/20 hover:border-black')}
        >
          <Zap className="h-4 w-4" />
          {listing.is_verified ? 'Instant ship: on' : 'Instant ship: off'}
        </button>
      </div>
      <p className="-mt-4 text-xs ink-mid">
        Turn on Instant ship only for items already in our hub. Buyers can filter for them, and they are promised dispatch within 48 hours.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm">Vendor says authentic: <span className="font-bold">{vendorSaysAuthentic}</span></p>
        <button
          type="button"
          disabled={busy}
          onClick={toggleAuthentic}
          aria-pressed={!!listing.authenticity_confirmed}
          className={cn('inline-flex items-center gap-2 border px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50',
            listing.authenticity_confirmed ? 'border-black bg-black text-white' : 'border-black/20 hover:border-black')}
        >
          <ShieldCheck className="h-4 w-4" />
          {listing.authenticity_confirmed ? 'Authentic: confirmed' : 'Authentic: not confirmed'}
        </button>
      </div>
      <p className="-mt-4 text-xs ink-mid">
        When confirmed, the listing page shows "Authenticity: Confirmed". Leave it off unless we have checked.
      </p>

      {/* The decision first: it is why anyone opens a pending item. */}
      <AcquisitionPanel listingId={listing.id} listingTitle={listing.title} vendorEmail={listing.seller_email ?? null} askingPriceFallback={listing.sale_price ?? listing.price} onDone={onDone} />

      <Sec title="Item">
        <Row k="Price" v={formatCurrency(listing.price)} />
        {listing.sale_price && <Row k="Sale price" v={formatCurrency(listing.sale_price)} />}
        <Row k="Category" v={listing.category} /><Row k="Size" v={`${listing.size ?? ''} (${listing.size_type ?? ''})`} />
        <Row k="Condition" v={listing.condition} /><Row k="Shipping cat" v={listing.shipping_category} />
        <Row k="Delivery" v={listing.free_shipping ? 'Free to the buyer (we pay)' : 'Buyer pays'} />
        <Row k="Flaws" v={listing.has_flaws ? 'Disclosed' : 'None'} />
        <Row k="Authenticity" v={`${listing.authenticity_confirmed ? 'Confirmed by us' : 'Not confirmed'} (vendor says: ${vendorSaysAuthentic})`} />
        {listing.has_flaws && listing.flaws_description && <p className="ink-mid mt-1">"{listing.flaws_description}"</p>}
      </Sec>

      <Sec title="Vendor">
        <Row k="Email" v={listing.seller_email} /><Row k="UPI" v={listing.seller_upi_vpa} />
        {listing.seller_instagram && <a href={listing.seller_instagram} target="_blank" rel="noreferrer" className="text-[11px] underline">Instagram</a>}
      </Sec>

      {listing.is_sold && (
        <Sec title="Sale">
          <Row k="Order" v={order ? <button className="underline" onClick={() => onOpenOrder(order.id)}>{order.order_number}</button> : '-'} />
          <Row k="Buyer" v={order?.buyer_email} />
          <Row k="Shipment" v={order ? (order.tracking_number ? `${order.courier ?? ''} ${order.tracking_number}` : order.status) : '-'} />
        </Sec>
      )}

      <Sec title={`Moderation history (${modHistory.length})`}>
        {modHistory.length === 0 ? <p className="ink-mid">None.</p> : modHistory.map((a) => (
          <p key={a.id} className="flex justify-between gap-2"><span className="font-mono text-[11px]">{a.action}</span><span className="text-[11px] ink-mid">{new Date(a.created_at).toLocaleDateString()}</span></p>
        ))}
      </Sec>

      <Sec title="Admin actions">
        <div className="flex flex-col gap-2 pt-1">
          {/* Approving is only ever the last step after a vendor accepts
              (acceptance normally puts the item live by itself). Rejecting a
              new item is done from the offer panel above, which also tells the
              vendor why; a bare status change here never did. */}
          {listing.status !== 'approved' && acq?.offer_status === 'accepted' && (
            <ActBtn label="Approve, put it live" onClick={() => setStatus('approved', 'Approve')} busy={busy} />
          )}
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
                await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
                await supabase.from('listings').update({ is_sold: false }).eq('id', listing.id);
                await writeAudit({ entity: 'order', entity_id: order.id, action: 'order.cancel', old_state: { status: order.status }, new_state: { status: 'cancelled' }, reason });
                void sendEmail({ template: 'order_cancelled_buyer', order_id: order.id });
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

// The rejections that actually recur. Ticking one is faster than typing it,
// reads identically to every vendor who gets it, and keeps free text as the
// exception - a note written in a hurry is where a resale figure or a
// negotiating phrase would end up, and neither belongs in front of a vendor.
const REJECTION_REASONS: string[] = [
  'The photos are too dark. Please reshoot in daylight, near a window.',
  'We need a clear photo of the size tag.',
  'We need more angles: front, back, and any detail that matters.',
  'The description does not match what the photos show.',
  'The condition is not clear enough from these photos.',
  'The item needs a clean or a press before we can take it.',
  'This is not something we are able to resell right now.',
];

/**
 * Operator triage. A submitted item gets one of two answers: an offer, or a
 * rejection. A rejection is never final - the vendor can fix what we named and
 * send the item straight back - so there is no third "ask for changes" verb.
 * The reasons live on the rejection, which is where they were always useful.
 *
 * The offer amount is typed by hand, because condition is a judgement made by
 * looking at photographs and no formula sees those. The spread model runs
 * against an expected resale and shows what it would have paid, next to the
 * box - it does not fill the box in. Both numbers are stored, so where we
 * override the model and by how much is answerable later.
 */
function AcquisitionPanel({ listingId, listingTitle, vendorEmail, askingPriceFallback, onDone }: {
  listingId: string;
  listingTitle: string;
  vendorEmail: string | null;
  askingPriceFallback: number | null;
  onDone: () => Promise<void> | void;
}) {
  const [acq, setAcq] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [resale, setResale] = React.useState('');
  const [offer, setOffer] = React.useState('');
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [note, setNote] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from('listing_acquisitions').select('*').eq('listing_id', listingId).maybeSingle();
    setAcq(data ?? null);
    setLoading(false);
  }, [listingId]);

  React.useEffect(() => { void load(); }, [load]);

  // What the model would pay, refreshed as a resale figure is typed.
  React.useEffect(() => {
    const amount = Number(resale);
    if (!(amount > 0)) { setSuggestion(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      // We carry both freight legs on every item, so there is nothing about
      // this vendor that changes the arithmetic.
      const { data } = await supabase.rpc('compute_acquisition_offer', { resale: amount });
      if (alive && data) setSuggestion(Number((data as any).offer_amount));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [resale]);

  // make_acquisition_offer raises on both of these. The operator should be
  // told by the form, not by a Postgres exception after they hit send.
  const resaleNum = Number(resale);
  const offerNum = Number(offer);
  const problem =
    !(resaleNum > 0) ? 'Set the listed price first. It is what the item goes live at.'
    : !(offerNum > 0) ? 'Type the amount we will pay the vendor.'
    : offerNum >= resaleNum ? 'The offer has to be below the listed price.'
    : null;

  const toggleReason = (r: string) =>
    setReasons((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const sendOffer = async () => {
    if (problem) { setErr(problem); return; }
    const amount = offerNum;
    if (!confirm(`Offer the vendor ${formatCurrency(amount)}? Once they accept, this amount is locked and cannot be changed.`)) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc('make_acquisition_offer', {
        p_listing_id: listingId,
        p_offer: amount,
        p_expected_resale: resaleNum,
      });
      if (error) throw error;
      // The vendor email is enqueued by make_acquisition_offer itself, into
      // vendor_notifications. It is not sent from here: this call used to hit
      // the "Unknown template" branch of send-email and silently deliver
      // nothing, which is exactly the failure the outbox exists to prevent.
      await load(); await onDone();
    } catch (e: any) { setErr(e?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  };

  // An operator could reject but never undo it: only the vendor could call
  // resubmit_listing. Kept as its own RPC rather than reusing the vendor's,
  // because "I was wrong to reject this" and "I fixed what you asked for" are
  // different facts and the first is worth being able to count.
  const reopen = async () => {
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc('reopen_declined_item', {
        p_listing_id: listingId,
        p_reason: note.trim() || null,
      });
      if (error) throw error;
      setNote('');
      await load(); await onDone();
    } catch (e: any) { setErr(e?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    if (reasons.length === 0 && !note.trim()) {
      setErr('Pick at least one reason, or write one. The vendor is told why.');
      return;
    }
    if (!confirm('Reject this item? The vendor can fix what you have named and send it back.')) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.rpc('reject_listing', {
        p_listing_id: listingId,
        p_reasons: reasons.length ? reasons : null,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      // Enqueued by reject_listing. See the note above.
      await load(); await onDone();
    } catch (e: any) { setErr(e?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Sec title="Acquisition"><p className="ink-mid">Loading.</p></Sec>;

  if (!acq) {
    return (
      <Sec title="Acquisition">
        <p className="ink-mid">
          No acquisition record. This listing predates the vendor flow and cannot be priced.
        </p>
      </Sec>
    );
  }

  const b = acq.offer_breakdown ?? {};
  const openForReview = acq.offer_status === 'pending_pricing';
  const waitingHours = openForReview
    ? Math.round((Date.now() - new Date(acq.updated_at ?? acq.created_at).getTime()) / 36e5)
    : null;

  return (
    <Sec title="Acquisition">
      {/* Only on rows from when the form still asked. A vendor names no price
          now, so on anything recent this is absent rather than Rs. 0. */}
      {(acq.asking_price ?? askingPriceFallback) != null && (
        <Row k="Vendor asked (legacy)" v={formatCurrency(Number(acq.asking_price ?? askingPriceFallback))} />
      )}
      <Row k="Status" v={acq.offer_status} />
      {acq.offer_round > 1 && <Row k="Round" v={String(acq.offer_round)} />}
      {acq.intake_status && <Row k="Intake" v={acq.intake_status} />}
      {waitingHours != null && (
        <Row
          k="Waiting"
          v={<span className={waitingHours >= 24 ? 'font-black text-red-700' : ''}>
            {waitingHours}h{waitingHours >= 24 ? ' - past 24h' : ''}
          </span>}
        />
      )}
      {acq.review_reasons?.length > 0 && <Row k="Reasons sent" v={acq.review_reasons.join(' / ')} />}
      {acq.review_note && <Row k="Note sent" v={acq.review_note} />}

      {openForReview ? (
        <div className="flex flex-col gap-5 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-widest">Listed price</span>
              <input
                type="number" inputMode="numeric" value={resale}
                onChange={(e) => setResale(e.target.value)}
                placeholder="Rs."
                className="border border-black px-3 py-2.5 text-base font-bold focus:outline-none"
              />
              <span className="text-xs ink-mid">What the buyer pays.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-widest">Our offer</span>
              <input
                type="number" inputMode="numeric" value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="Rs."
                className="border border-black px-3 py-2.5 text-base font-bold focus:outline-none"
              />
              {suggestion != null ? (
                <button
                  type="button" onClick={() => setOffer(String(suggestion))}
                  className="self-start text-xs font-semibold underline underline-offset-4 ink-mid hover:text-black"
                >
                  Suggested {formatCurrency(suggestion)}, use it
                </button>
              ) : (
                <span className="text-xs ink-mid">The only number the vendor sees.</span>
              )}
            </label>
          </div>
          {problem && (resale || offer) && <p className="text-xs font-semibold ink-mid">{problem}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <ActBtn label="Send offer" onClick={sendOffer} busy={busy} disabled={!!problem} />
            <button
              type="button" onClick={() => setRejecting((v) => !v)}
              className="text-[11px] font-black uppercase tracking-widest ink-mid hover:text-black"
            >
              {rejecting ? 'Cancel reject' : 'Reject instead'}
            </button>
          </div>

          {rejecting && (
            <div className="flex flex-col gap-3 border-t border-black/10 pt-4">
              <span className="text-[11px] font-black uppercase tracking-widest">What needs fixing?</span>
              <div className="flex flex-col gap-1.5">
                {REJECTION_REASONS.map((r) => {
                  const on = reasons.includes(r);
                  return (
                    <button
                      key={r} type="button" onClick={() => toggleReason(r)}
                      className={cn(
                        'flex items-start gap-2.5 border px-3 py-2.5 text-left text-sm leading-snug transition-colors',
                        on ? 'border-black bg-black text-white' : 'border-black/10 hover:border-black/40',
                      )}
                    >
                      <span className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 border', on ? 'border-white bg-white' : 'border-black/30')} />
                      <span>{r}</span>
                    </button>
                  );
                })}
              </div>
              <textarea
                value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="Anything else (optional). The vendor reads this word for word, so never mention a resale price."
                className="border border-black/15 px-3 py-2 text-sm leading-relaxed focus:border-black focus:outline-none"
              />
              <ActBtn label="Reject and tell the vendor" danger onClick={reject} busy={busy} />
            </div>
          )}
        </div>
      ) : acq.offer_status === 'declined' || acq.offer_status === 'expired' ? (
        <div className="flex flex-col gap-3 pt-3">
          <p className="text-[11px] leading-relaxed ink-mid max-w-[44ch]">
            {acq.offer_status === 'declined'
              ? 'Declined. The vendor can fix what was named and send it back. Nothing happens to this item until they do, or until you reopen it here.'
              : 'The offer lapsed unanswered. Reopening puts it back in the queue for a fresh offer.'}
          </p>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Why are you reopening it? (recorded for us, the vendor never sees this)"
            className="border border-black/15 px-3 py-2 text-xs font-medium leading-relaxed focus:border-black focus:outline-none"
          />
          <ActBtn label="Reopen for a fresh offer" onClick={reopen} busy={busy} />
          {err && <p className="text-[11px] text-red-600 leading-relaxed">{err}</p>}
        </div>
      ) : (
        <>
          {acq.expected_resale != null && (
            <Row k="Expected resale" v={formatCurrency(Number(acq.expected_resale))} />
          )}
          {acq.offer_amount != null && (
            <Row k="Offered to vendor" v={formatCurrency(Number(acq.offer_amount))} />
          )}
          {acq.model_offer_amount != null && (
            <Row
              k="Model would have paid"
              v={`${formatCurrency(Number(acq.model_offer_amount))}${acq.offer_manually_set ? ' (overridden)' : ''}`}
            />
          )}
          {/* Operator-only, and the only place any of this is ever rendered.
              The old breakdown listed five cost lines; MODEL.md's formula has
              three terms, so it shows three. Rows from before the change still
              carry the old keys, which is why both shapes are handled. */}
          {(b.contribution_tier || b.margin_tier) && (
            <div className="mt-2 border-t border-black/5 pt-2 flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-widest ink-mid">
                {b.contribution_tier ? 'Offer model' : 'Model spread (legacy)'}
              </span>
              {b.contribution_tier ? (
                <>
                  <Row k="Payment gateway" v={formatCurrency(Number(b.gateway ?? 0))} />
                  <Row k="Fixed cost per item" v={formatCurrency(Number(b.fixed_cost ?? 0))} />
                  <Row
                    k="Required contribution"
                    v={`${formatCurrency(Number(b.required_contribution ?? 0))}${b.contribution_at_floor ? ' (at floor)' : ''}`}
                  />
                  <Row k="Tier" v={String(b.contribution_tier)} />
                  {b.below_resale_floor === true && (
                    <Row k="Below resale floor" v={`Min ${formatCurrency(Number(b.min_resale ?? 0))}`} />
                  )}
                </>
              ) : (
                <>
                  <Row k="Inbound shipping" v={formatCurrency(Number(b.inbound_shipping ?? 0))} />
                  <Row k="Outbound shipping" v={formatCurrency(Number(b.outbound_shipping ?? 0))} />
                  <Row k="Payment processing" v={formatCurrency(Number(b.payment_processing ?? 0))} />
                  <Row k="RTO / damage reserve" v={formatCurrency(Number(b.rto_damage_reserve ?? 0))} />
                  <Row k="Target margin" v={formatCurrency(Number(b.target_margin ?? 0))} />
                  <Row k="Tier" v={b.margin_tier} />
                </>
              )}
            </div>
          )}
        </>
      )}

      {err && <p className="text-[11px] font-bold text-red-700 pt-2">{err}</p>}
    </Sec>
  );
}
