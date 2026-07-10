// Admin portal: listings approval, orders verification, user management.
// MVP: buyer pays admin UPI. Admin verifies payment manually (e.g. in UPI
// app), marks "paid", then marks "delivered" once the item has arrived
// (the Shiprocket webhook takes over this last step once it exists). Marking
// delivered starts a 48-hour review window; a payout row is created
// automatically and can only be paid out once that window has closed with
// no open claim on the order (enforced in the DB, not just here).

import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing, ListingStatus, Order, OrderStatus, SellerPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, Check, X, ExternalLink, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { StatusBadge } from '../components/StatusBadge';
import { log } from '../lib/log';
import { sendEmail } from '../lib/email';

const adlog = log('admin');

type AdminTab = 'listings' | 'orders' | 'payouts' | 'users';

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
}

const ORDER_STATUSES: OrderStatus[] = [
  'awaiting_payment', 'awaiting_verification', 'paid', 'payment_failed', 'payment_conflict', 'shipped', 'delivered', 'cancelled', 'refunded',
];

export function Admin() {
  return (
    <RequireAuth requireAdmin message="Sign in with an admin account.">
      <AdminInner />
    </RequireAuth>
  );
}

function AdminInner() {
  const { user } = useAuth();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [payouts, setPayouts] = React.useState<SellerPayout[]>([]);
  const [users, setUsers] = React.useState<AdminProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actioningId, setActioningId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<AdminTab>('listings');

  const fetchPendingListings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings').select('*').eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setListings((data as Listing[]) || []);
    } catch (err) { adlog.error('fetchListings', err); }
    finally { setLoading(false); }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      setOrders((data as Order[]) ?? []);
    } finally { setLoading(false); }
  };

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('seller_payouts').select('*').order('created_at', { ascending: false });
      setPayouts((data as SellerPayout[]) ?? []);
    } finally { setLoading(false); }
  };

  const markPaidOut = async (id: string) => {
    // The DB also enforces this (see migration 20260710000001) - the
    // releasable_at check here is just so the admin gets an immediate,
    // readable error instead of a raw RLS rejection.
    const payout = payouts.find((p) => p.id === id);
    if (payout?.releasable_at && new Date(payout.releasable_at) > new Date()) {
      alert(`This payout is held until ${new Date(payout.releasable_at).toLocaleString()} (48 hours after delivery).`);
      return;
    }
    const { error } = await supabase.from('seller_payouts')
      .update({ status: 'paid_out', paid_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { alert(error.message); return; }
    if (payout?.order_id) {
      void sendEmail({ template: 'payout_released_seller', order_id: payout.order_id });
    }
    fetchPayouts();
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('profiles')
        .select('id, email, full_name, phone, is_admin, created_at')
        .order('created_at', { ascending: false });
      setUsers((data as AdminProfile[]) ?? []);
    } finally { setLoading(false); }
  };

  const toggleAdmin = async (uid: string, makeAdmin: boolean) => {
    if (uid === user?.id && !makeAdmin && !confirm('Revoke your own admin access?')) return;
    const { error } = await supabase.from('profiles').update({ is_admin: makeAdmin }).eq('id', uid);
    if (error) { alert(error.message); return; }
    fetchUsers();
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const update: Record<string, unknown> = { status };
    if (status === 'shipped') update.shipped_at = new Date().toISOString();
    const { error } = await supabase.from('orders').update(update).eq('id', orderId);
    if (error) { alert(error.message); return; }

    // Listing visibility follows order status:
    //   cancelled / refunded -> relist (is_sold = false)
    //   anything else        -> stay sold (is_sold = true)
    const order = orders.find((o) => o.id === orderId);
    if (order?.listing_id) {
      const isSold = !(status === 'cancelled' || status === 'refunded');
      const { error: lerr } = await supabase
        .from('listings')
        .update({ is_sold: isSold })
        .eq('id', order.listing_id);
      if (lerr) console.warn('listing visibility sync failed', lerr);
    }

    fetchOrders();
  };

  const refresh = () => {
    if (tab === 'listings') fetchPendingListings();
    if (tab === 'orders') fetchOrders();
    if (tab === 'payouts') fetchPayouts();
    if (tab === 'users') fetchUsers();
  };

  React.useEffect(() => {
    if (tab === 'listings') fetchPendingListings();
    else if (tab === 'orders') fetchOrders();
    else if (tab === 'payouts') { fetchPayouts(); fetchOrders(); }
    else if (tab === 'users') fetchUsers();
  }, [tab]);

  const handleListingAction = async (id: string, status: ListingStatus) => {
    setActioningId(id);
    try {
      const { error } = await supabase.from('listings').update({ status }).eq('id', id);
      if (error) throw error;
      setListings(listings.filter((l) => l.id !== id));
    } catch (err: any) {
      alert(err?.message ?? `Failed to ${status} listing.`);
    } finally { setActioningId(null); }
  };

  const handleListingDelete = async (id: string, title: string) => {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone. Existing orders keep their record.`)) return;
    setActioningId(id);
    try {
      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) throw error;
      setListings(listings.filter((l) => l.id !== id));
    } catch (err: any) {
      alert(err?.message ?? 'Failed to delete listing.');
    } finally { setActioningId(null); }
  };

  const awaitingVerification = orders.filter((o) => o.status === 'awaiting_verification').length;
  const awaitingPayouts = payouts.filter((p) => p.status === 'awaiting_payout').length;

  const NAV: Array<{ key: AdminTab; label: string; count: number; needsAction: boolean }> = [
    { key: 'listings', label: 'Listings', count: listings.length, needsAction: listings.length > 0 },
    { key: 'orders', label: 'Orders', count: orders.length, needsAction: awaitingVerification > 0 },
    { key: 'payouts', label: 'Payouts', count: payouts.length, needsAction: awaitingPayouts > 0 },
    { key: 'users', label: 'Users', count: users.length, needsAction: false },
  ];

  const TAB_TITLE: Record<AdminTab, string> = {
    listings: 'Listings Queue',
    orders: 'Orders',
    payouts: 'Payouts',
    users: 'Users',
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-14 sm:pb-20">
      <div className="flex flex-col md:flex-row gap-10 md:gap-14">
        {/* Sidebar */}
        <aside className="md:w-[220px] md:shrink-0 md:border-r md:border-black/10 md:pr-10 flex flex-col gap-8">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-black uppercase tracking-tight">Admin</span>
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

          <button
            onClick={refresh}
            className="border border-black py-3 text-center text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
          >
            Refresh
          </button>
        </aside>

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-black tracking-tighter uppercase mb-10">{TAB_TITLE[tab]}</h1>

          {tab === 'listings' && (loading ? (
            <Spinner />
          ) : listings.length === 0 ? (
            <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">Queue is empty.</p>
          ) : (
            <ListingsTable listings={listings} actioningId={actioningId} onAction={handleListingAction} onDelete={handleListingDelete} />
          ))}

          {tab === 'orders' && <OrdersPanel orders={orders} loading={loading} onUpdate={updateOrderStatus} />}
          {tab === 'payouts' && <PayoutsPanel payouts={payouts} orders={orders} loading={loading} onMarkPaid={markPaidOut} />}
          {tab === 'users' && <UsersPanel users={users} loading={loading} currentUserId={user!.id} onToggleAdmin={toggleAdmin} />}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>;
}

function ListingsTable({ listings, actioningId, onAction, onDelete }: {
  listings: Listing[]; actioningId: string | null;
  onAction: (id: string, status: ListingStatus) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-black/10">
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Item</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Details</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Price</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Seller</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <tr key={listing.id} className="border-b border-black/5">
              <td className="py-4 px-3">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-12 flex-shrink-0 overflow-hidden bg-zinc-100 border border-black/5">
                    <img src={listing.image_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <p className="font-black text-xs uppercase tracking-tight">{listing.title}</p>
                    <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest">{listing.brand}</p>
                  </div>
                </div>
              </td>
              <td className="py-4 px-3">
                <div className="text-[10px] font-bold uppercase tracking-widest space-y-1">
                  <p><span className="text-black/40">Size:</span> {listing.size} ({listing.size_type})</p>
                  <p><span className="text-black/40">Cat:</span> {listing.category}</p>
                  <p><span className="text-black/40">Cond:</span> {listing.condition}</p>
                </div>
              </td>
              <td className="py-4 px-3">
                <p className="font-black text-xs">{formatCurrency(listing.price)}</p>
                {listing.sale_price && <p className="text-[10px] font-bold uppercase tracking-widest text-black/60">Sale: {formatCurrency(listing.sale_price)}</p>}
              </td>
              <td className="py-4 px-3">
                <p className="text-xs font-medium">{listing.seller_email}</p>
                <p className="text-[10px] text-black/40 font-mono">{listing.seller_upi_vpa}</p>
                {listing.seller_instagram && (
                  <a href={listing.seller_instagram} target="_blank" rel="noreferrer" className="text-[10px] underline">IG</a>
                )}
              </td>
              <td className="py-4 px-3">
                <div className="flex items-center justify-end gap-4">
                  <button onClick={() => onAction(listing.id, 'approved')} disabled={actioningId === listing.id}
                    className="text-black/50 hover:text-black disabled:opacity-50" title="Approve">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => onAction(listing.id, 'rejected')} disabled={actioningId === listing.id}
                    className="text-black/50 hover:text-black disabled:opacity-50" title="Reject">
                    <X className="h-4 w-4" />
                  </button>
                  <Link to={`/product/${listing.id}`} className="text-black/50 hover:text-black" title="View">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <button onClick={() => onDelete(listing.id, listing.title)} disabled={actioningId === listing.id}
                    className="text-black/50 hover:text-black disabled:opacity-50" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersPanel({ orders, loading, onUpdate }: {
  orders: Order[]; loading: boolean; onUpdate: (id: string, status: OrderStatus) => void;
}) {
  const [filter, setFilter] = React.useState<'all' | OrderStatus>('all');
  const filtered = orders.filter((o) => filter === 'all' || o.status === filter);
  if (loading) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-black/10 pb-4">
        {(['all', ...ORDER_STATUSES] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('text-[10px] font-black uppercase tracking-widest',
              filter === f ? 'text-black underline' : 'text-black/40 hover:text-black')}>
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-black/10">
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Order</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Item</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Buyer</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Seller</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Total</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Confirmed</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Status</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-black/5 align-top">
                <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest">
                  {o.order_number}<br /><span className="text-black/40">{new Date(o.created_at).toLocaleDateString()}</span>
                </td>
                <td className="py-4 px-3 text-xs font-bold">{o.listing_title}<br /><span className="text-[10px] font-normal text-black/40">{o.listing_sku}</span></td>
                <td className="py-4 px-3 text-[10px] font-bold">
                  {o.buyer_name}<br /><span className="text-black/40">{o.buyer_email}</span>
                  {o.buyer_note && (
                    <p className="mt-2 max-w-[200px] whitespace-pre-wrap font-medium normal-case tracking-normal text-black/70 border-l-2 border-black/20 pl-2">
                      <span className="block text-[8px] font-black uppercase tracking-widest text-black/40">Buyer note</span>
                      {o.buyer_note}
                    </p>
                  )}
                </td>
                <td className="py-4 px-3 text-[10px] font-bold">{o.seller_email}<br /><span className="font-mono font-black text-black">{o.seller_upi_vpa_snapshot}</span></td>
                <td className="py-4 px-3 text-xs font-black">{formatCurrency(Number(o.total_amount))}</td>
                <td className="py-4 px-3 text-[10px] leading-relaxed">
                  <ProofCell utr={o.payment_utr} receiptPath={o.payment_receipt_url} submittedAt={o.payment_submitted_at} />
                </td>
                <td className="py-4 px-3"><StatusBadge status={o.status} audience="seller" /></td>
                <td className="py-4 px-3 text-right">
                  <div className="flex flex-col gap-2 items-end">
                    {o.status === 'awaiting_verification' && (
                      <button onClick={() => onUpdate(o.id, 'paid')}
                        className="border border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white">
                        Mark Paid
                      </button>
                    )}
                    <select value={o.status} onChange={(e) => onUpdate(o.id, e.target.value as OrderStatus)}
                      className="text-[10px] font-bold uppercase tracking-widest border border-black/10 px-2 py-1 bg-white">
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 py-6">No orders.</p>}
      </div>
    </div>
  );
}

function PayoutsPanel({ payouts, orders, loading, onMarkPaid }: {
  payouts: SellerPayout[]; orders: Order[]; loading: boolean; onMarkPaid: (id: string) => void;
}) {
  if (loading) return <Spinner />;
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const awaiting = payouts.filter((p) => p.status === 'awaiting_payout');
  const paidOut = payouts.filter((p) => p.status === 'paid_out');

  const renderTable = (rows: SellerPayout[], showAction: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead><tr className="border-b border-black/10">
          <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Order</th>
          <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Seller</th>
          <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">UPI</th>
          <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Amount</th>
          <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Delivered</th>
          {showAction ? (
            <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Action</th>
          ) : (
            <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Paid On</th>
          )}
        </tr></thead>
        <tbody>
          {rows.map((p) => {
            const order = orderById.get(p.order_id);
            const held = showAction && p.releasable_at && new Date(p.releasable_at) > new Date();
            return (
              <tr key={p.id} className="border-b border-black/5">
                <td className="py-3 px-3 text-xs font-bold">{order?.order_number ?? p.order_id.slice(0, 8)}<br /><span className="text-[10px] font-normal text-black/40">{order?.listing_title}</span></td>
                <td className="py-3 px-3 text-[10px] font-bold">{order?.seller_email ?? '-'}</td>
                <td className="py-3 px-3 text-[10px] font-mono font-black">{order?.seller_upi_vpa_snapshot ?? '-'}</td>
                <td className="py-3 px-3 text-xs font-black">{formatCurrency(p.amount)}</td>
                <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest text-black/60">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="py-3 px-3 text-right">
                  {showAction ? (
                    held ? (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
                        Held until {new Date(p.releasable_at as string).toLocaleDateString()}
                      </span>
                    ) : (
                      <button onClick={() => onMarkPaid(p.id)}
                        className="border border-black px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white">
                        Mark Paid Out
                      </button>
                    )
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '-'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 py-6">No payouts.</p>}
    </div>
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 mb-4">Awaiting Payout ({awaiting.length})</h3>
        {renderTable(awaiting, true)}
      </div>
      <div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 mb-4">Paid Out ({paidOut.length})</h3>
        {renderTable(paidOut, false)}
      </div>
    </div>
  );
}

function ProofCell({ submittedAt }: {
  utr: string | null; receiptPath: string | null; submittedAt: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      {submittedAt
        ? <span className="text-black/60">Buyer confirmed {new Date(submittedAt).toLocaleString()}</span>
        : <span className="text-black/30">Not yet</span>}
    </div>
  );
}

function UsersPanel({ users, loading, currentUserId, onToggleAdmin }: {
  users: AdminProfile[]; loading: boolean; currentUserId: string;
  onToggleAdmin: (uid: string, makeAdmin: boolean) => void;
}) {
  const [filter, setFilter] = React.useState('');
  const filtered = users.filter((u) =>
    !filter || (u.email ?? '').toLowerCase().includes(filter.toLowerCase()) || (u.full_name ?? '').toLowerCase().includes(filter.toLowerCase()),
  );
  if (loading) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <input type="text" placeholder="Search by name or email…" value={filter} onChange={(e) => setFilter(e.target.value)}
        className="border-b border-black/10 py-3 text-sm font-bold focus:border-black outline-none max-w-md" />
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/10">
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Joined</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Email</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Name</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Role</th>
              <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-black/5">
                <td className="py-3 px-3 text-[10px] font-bold uppercase tracking-widest">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-3 px-3 text-[11px] font-bold">{u.email}{u.id === currentUserId && <span className="ml-2 text-[9px] text-black/40">(you)</span>}</td>
                <td className="py-3 px-3 text-[11px] font-bold">{u.full_name ?? '-'}</td>
                <td className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">
                  {u.is_admin ? <span className="text-black">Admin</span> : <span className="text-black/40">User</span>}
                </td>
                <td className="py-3 px-3 text-right">
                  {u.is_admin ? (
                    <button onClick={() => onToggleAdmin(u.id, false)} className="border border-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-black">Revoke Admin</button>
                  ) : (
                    <button onClick={() => onToggleAdmin(u.id, true)} className="border border-black px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white">Make Admin</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 py-6">No users.</p>}
      </div>
    </div>
  );
}
