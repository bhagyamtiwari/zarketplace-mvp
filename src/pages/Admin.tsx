// Admin portal: listings approval, orders verification, user management.
// MVP: buyer pays admin UPI. Admin verifies payment manually (e.g. in UPI
// app), marks "paid", then pays the seller once shipping is confirmed.

import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Listing, ListingStatus, Order, OrderStatus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, Check, X, ExternalLink, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { log } from '../lib/log';

const adlog = log('admin');

type AdminTab = 'listings' | 'orders' | 'users';

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
}

const ORDER_STATUSES: OrderStatus[] = [
  'awaiting_payment', 'awaiting_verification', 'paid', 'shipped', 'cancelled', 'refunded',
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

  React.useEffect(() => {
    if (tab === 'listings') fetchPendingListings();
    else if (tab === 'orders') fetchOrders();
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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/40">Admin Portal</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Operations</h1>
        </div>
        <button
          onClick={() => { if (tab === 'listings') fetchPendingListings(); if (tab === 'orders') fetchOrders(); if (tab === 'users') fetchUsers(); }}
          className="border border-black/10 px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:border-black">
          Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-black/10 mb-12 overflow-x-auto">
        {([['listings', 'Listings'], ['orders', 'Orders'], ['users', 'Users']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn(
            'px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b-2 -mb-px whitespace-nowrap',
            tab === k ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black',
          )}>{label}</button>
        ))}
      </div>

      {tab === 'listings' && (loading ? (
        <Spinner />
      ) : listings.length === 0 ? (
        <Empty>Queue is empty</Empty>
      ) : (
        <ListingsTable listings={listings} actioningId={actioningId} onAction={handleListingAction} onDelete={handleListingDelete} />
      ))}

      {tab === 'orders' && <OrdersPanel orders={orders} loading={loading} onUpdate={updateOrderStatus} />}
      {tab === 'users' && <UsersPanel users={users} loading={loading} currentUserId={user!.id} onToggleAdmin={toggleAdmin} />}
    </div>
  );
}

function Spinner() {
  return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-64 flex-col items-center justify-center gap-6 border border-black/5 bg-zinc-50">
    <p className="text-xs font-black text-black/30 uppercase tracking-[0.2em]">{children}</p>
  </div>;
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
            <th className="py-6 px-4 text-[10px] font-black uppercase tracking-widest text-black/40">Item</th>
            <th className="py-6 px-4 text-[10px] font-black uppercase tracking-widest text-black/40">Details</th>
            <th className="py-6 px-4 text-[10px] font-black uppercase tracking-widest text-black/40">Price</th>
            <th className="py-6 px-4 text-[10px] font-black uppercase tracking-widest text-black/40">Seller</th>
            <th className="py-6 px-4 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <tr key={listing.id} className="border-b border-black/5 hover:bg-black/[0.01] transition-colors">
              <td className="py-6 px-4">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-16 flex-shrink-0 overflow-hidden bg-zinc-100 border border-black/5">
                    <img src={listing.image_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">{listing.title}</p>
                    <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest">{listing.brand}</p>
                  </div>
                </div>
              </td>
              <td className="py-6 px-4">
                <div className="text-[10px] font-bold uppercase tracking-widest space-y-1">
                  <p><span className="text-black/40">Size:</span> {listing.size} ({listing.size_type})</p>
                  <p><span className="text-black/40">Cat:</span> {listing.category}</p>
                  <p><span className="text-black/40">Cond:</span> {listing.condition}</p>
                </div>
              </td>
              <td className="py-6 px-4">
                <p className="font-black text-sm">{formatCurrency(listing.price)}</p>
                {listing.sale_price && <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Sale: {formatCurrency(listing.sale_price)}</p>}
              </td>
              <td className="py-6 px-4">
                <p className="text-xs font-medium">{listing.seller_email}</p>
                <p className="text-[10px] text-black/40 font-mono">{listing.seller_upi_vpa}</p>
                {listing.seller_instagram && (
                  <a href={listing.seller_instagram} target="_blank" rel="noreferrer" className="text-[10px] underline">IG</a>
                )}
              </td>
              <td className="py-6 px-4">
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => onAction(listing.id, 'approved')} disabled={actioningId === listing.id}
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-600 hover:text-white disabled:opacity-50" title="Approve">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => onAction(listing.id, 'rejected')} disabled={actioningId === listing.id}
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50" title="Reject">
                    <X className="h-4 w-4" />
                  </button>
                  <Link to={`/product/${listing.id}`} className="h-10 w-10 flex items-center justify-center rounded-full bg-black/5 text-black hover:bg-black hover:text-white" title="View">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <button onClick={() => onDelete(listing.id, listing.title)} disabled={actioningId === listing.id}
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50" title="Delete">
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
      <div className="flex flex-wrap gap-2">
        {(['all', ...ORDER_STATUSES] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-4 py-2 text-[10px] font-black uppercase tracking-widest border',
              filter === f ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10 hover:border-black')}>
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
                <td className="py-4 px-3 text-[10px] font-black uppercase tracking-widest">{o.status.replace(/_/g, ' ')}</td>
                <td className="py-4 px-3 text-right">
                  <div className="flex flex-col gap-1 items-end">
                    {o.status === 'awaiting_verification' && (
                      <button onClick={() => onUpdate(o.id, 'paid')}
                        className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700">
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
        {filtered.length === 0 && <Empty>No orders.</Empty>}
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
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Joined</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Email</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Name</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Role</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-black/5">
                <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-4 px-3 text-[11px] font-bold">{u.email}{u.id === currentUserId && <span className="ml-2 text-[9px] text-black/40">(you)</span>}</td>
                <td className="py-4 px-3 text-[11px] font-bold">{u.full_name ?? '-'}</td>
                <td className="py-4 px-3 text-[10px] font-black uppercase tracking-widest">
                  {u.is_admin ? <span className="text-emerald-700">Admin</span> : <span className="text-black/40">User</span>}
                </td>
                <td className="py-4 px-3 text-right">
                  {u.is_admin ? (
                    <button onClick={() => onToggleAdmin(u.id, false)} className="bg-zinc-100 text-zinc-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200">Revoke Admin</button>
                  ) : (
                    <button onClick={() => onToggleAdmin(u.id, true)} className="bg-black text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800">Make Admin</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 py-12 text-center">No users.</p>}
      </div>
    </div>
  );
}
