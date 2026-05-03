import React from 'react';
import { supabase } from '../lib/supabase';
import { Listing, ListingStatus, Order, SellerPayout } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, Check, X, ExternalLink, ShieldAlert, Database, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { log } from '../lib/log';

const adlog = log('admin');

type AdminTab = 'listings' | 'orders' | 'payouts' | 'campaigns' | 'users';

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
}

export function Admin() {
  const { user, profile, loading: authLoading } = useAuth();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [payouts, setPayouts] = React.useState<SellerPayout[]>([]);
  const [users, setUsers] = React.useState<AdminProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actioningId, setActioningId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<AdminTab>('listings');
  const [showAuth, setShowAuth] = React.useState(false);
  const isAuthenticated = !!user && !!profile?.is_admin;

  const fetchPendingListings = async () => {
    const t = adlog.time('fetchPendingListings');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      t.end({ count: data?.length, error });
      if (error) throw error;
      setListings(data || []);
    } catch (err) {
      adlog.error('fetchPendingListings THREW', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    const t = adlog.time('fetchOrders');
    setLoading(true);
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      t.end({ count: data?.length, error });
      setOrders((data as Order[]) ?? []);
    } finally { setLoading(false); }
  };

  const fetchPayouts = async () => {
    const t = adlog.time('fetchPayouts');
    setLoading(true);
    try {
      const { data, error } = await supabase.from('seller_payouts').select('*').order('created_at', { ascending: false });
      t.end({ count: data?.length, error });
      setPayouts((data as SellerPayout[]) ?? []);
    } finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    const t = adlog.time('fetchUsers');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, is_admin, created_at')
        .order('created_at', { ascending: false });
      t.end({ count: data?.length, error });
      setUsers((data as AdminProfile[]) ?? []);
    } finally { setLoading(false); }
  };

  const toggleAdmin = async (uid: string, makeAdmin: boolean) => {
    if (uid === user?.id && !makeAdmin) {
      if (!confirm('Revoke your own admin access?')) return;
    }
    const { error } = await supabase.from('profiles').update({ is_admin: makeAdmin }).eq('id', uid);
    if (error) { alert(error.message); return; }
    fetchUsers();
  };

  const releasePayout = async (payoutId: string, action: 'release' | 'hold' | 'reset') => {
    let update: Partial<SellerPayout>;
    if (action === 'release') {
      const ref = prompt('Enter UPI ref / bank UTR / Cashfree transfer ID for this payout (required):') ?? '';
      if (!ref.trim()) { alert('Reference required.'); return; }
      update = { status: 'released', released_at: new Date().toISOString(), released_by: 'admin', payout_reference: ref.trim() };
    } else if (action === 'hold') {
      update = { status: 'held', hold_reason: prompt('Reason for hold?') ?? 'Held by admin' };
    } else {
      update = { status: 'pending', released_at: undefined, released_by: undefined, hold_reason: undefined, payout_reference: undefined };
    }
    const { error } = await supabase.from('seller_payouts').update(update).eq('id', payoutId);
    if (error) { alert(error.message); return; }

    if (action === 'release') {
      // Mark related order delivered if not already
      const { data: payout } = await supabase.from('seller_payouts').select('order_id').eq('id', payoutId).single();
      if (payout?.order_id) {
        await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', payout.order_id).is('delivered_at', null);
        // Send payout-released email (best effort)
        const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
        const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
          body: JSON.stringify({ template: 'payout_released_seller', order_id: payout.order_id }),
        }).catch(() => {});
      }
    }
    fetchPayouts();
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    const update: any = { status };
    if (status === 'delivered') update.delivered_at = new Date().toISOString();
    if (status === 'shipped') update.shipped_at = new Date().toISOString();
    const { error } = await supabase.from('orders').update(update).eq('id', orderId);
    if (error) { alert(error.message); return; }
    fetchOrders();
  };

  // Switch tabs and load data lazily
  React.useEffect(() => {
    if (!isAuthenticated) return;
    adlog('tab change', { tab });
    if (tab === 'listings') fetchPendingListings();
    else if (tab === 'orders') fetchOrders();
    else if (tab === 'payouts') fetchPayouts();
    else if (tab === 'users') fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAuthenticated]);

  const handleAction = async (id: string, status: ListingStatus) => {
    setActioningId(id);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      setListings(listings.filter(l => l.id !== id));
    } catch (err) {
      console.error(`Error updating listing to ${status}:`, err);
      alert(`Failed to ${status} listing.`);
    } finally {
      setActioningId(null);
    }
  };

  const seedSampleData = async () => {
    setLoading(true);
    try {
      const samples = [
        {
          title: 'Weekday Astro Loose Baggy Jeans',
          brand: 'Weekday',
          price: 3500,
          sale_price: 2900,
          category: 'Bottoms',
          size_type: 'Pants',
          size: '34x30 (Actual)',
          condition: 'Great',
          description: 'Stonewashed wash, subtle fade throughout\nLoose fit with baggy leg and extended length\nCrafted from organic rigid denim with recycled cotton\nZip fly with button closure\nFive-pocket design with oversized back pockets\nMade in India\n\n* Item Condition: (LEARN MORE)',
          image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=1000',
          image_urls: [
            'https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=1000',
            'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=1000',
            'https://images.unsplash.com/photo-1555689502-c4b22d76c56f?q=80&w=1000'
          ],
          seller_email: 'contact@zarketplace.com',
          shipping_cost: 0,
          status: 'approved'
        },
        {
          title: 'Vintage 90s Carhartt Detroit Jacket',
          brand: 'Carhartt',
          price: 8500,
          sale_price: 7900,
          category: 'Outerwear',
          size_type: 'Outerwear',
          size: 'XL',
          condition: 'Fair',
          description: 'Classic Detroit jacket with beautiful sun fade and distressing. Blanket lined. Heavyweight canvas.\n\n* Item Condition: (LEARN MORE)',
          image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=1000',
          image_urls: [
            'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=1000',
            'https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?q=80&w=1000'
          ],
          seller_email: 'contact@zarketplace.com',
          shipping_cost: 150,
          status: 'approved'
        },
        {
          title: 'Premium Linen Shirt',
          brand: 'Uniqlo',
          price: 2499,
          sale_price: 1999,
          category: 'Tops',
          size_type: 'Tops',
          size: 'L',
          condition: 'Pristine',
          description: '100% Premium linen. Never worn. Perfect for summer.\n\n* Item Condition: (LEARN MORE)',
          image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=1000',
          image_urls: [
            'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=1000',
            'https://images.unsplash.com/photo-1624372333454-24198e332441?q=80&w=1000'
          ],
          seller_email: 'contact@zarketplace.com',
          shipping_cost: 0,
          status: 'approved'
        }
      ];

      const { error } = await supabase.from('listings').insert(samples);
      if (error) throw error;
      alert('Sample data added successfully!');
      fetchPendingListings();
    } catch (err) {
      console.error('Error seeding data:', err);
      alert('Failed to seed data.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-black/30" /></div>;
  }

  if (!user) {
    return (
      <>
        <div className="mx-auto max-w-md px-4 py-32 flex flex-col items-center gap-8 text-center">
          <div className="h-16 w-16 rounded-full bg-black text-white flex items-center justify-center">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Admin Access</h1>
          <p className="text-xs font-bold text-black/40 uppercase tracking-widest">Sign in with an admin account.</p>
          <button onClick={() => setShowAuth(true)} className="bg-black px-12 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800">
            Sign In
          </button>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} message="Sign in with an admin account." />
      </>
    );
  }

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 flex flex-col items-center gap-8 text-center">
        <div className="h-16 w-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tighter">Not Authorised</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/50 max-w-sm leading-relaxed">
          Signed in as <span className="text-black">{user.email}</span>, but this account is not an admin.
        </p>
        <Link to="/" className="text-[10px] font-black uppercase tracking-widest underline">Back home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/40">Admin Portal</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Operations</h1>
        </div>
        <div className="flex gap-4">
          {tab === 'listings' && (
            <button 
              onClick={seedSampleData}
              className="flex items-center gap-3 border border-black px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
            >
              <Database className="h-4 w-4" /> Seed Sample Data
            </button>
          )}
          <button 
            onClick={() => { if (tab === 'listings') fetchPendingListings(); if (tab === 'orders') fetchOrders(); if (tab === 'payouts') fetchPayouts(); }}
            className="flex items-center gap-3 border border-black/10 px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:border-black transition-all"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-black/10 mb-12 overflow-x-auto">
        {([['listings', 'Listings'], ['orders', 'Orders'], ['payouts', 'Payouts'], ['campaigns', 'Email Campaigns'], ['users', 'Users']] as const).map(([k, label]) => (

          <button key={k} onClick={() => setTab(k)} className={cn(
            'px-6 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b-2 -mb-px whitespace-nowrap',
            tab === k ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black',
          )}>{label}</button>
        ))}
      </div>

      {tab === 'campaigns' && <CampaignsPanel />}
      {tab === 'orders' && <OrdersPanel orders={orders} loading={loading} onUpdate={updateOrderStatus} />}
      {tab === 'payouts' && <PayoutsPanel payouts={payouts} loading={loading} onAction={releasePayout} />}
      {tab === 'users' && <UsersPanel users={users} loading={loading} currentUserId={user.id} onToggleAdmin={toggleAdmin} />}

      {tab === 'listings' && (loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-black/20" />
        </div>
      ) : listings.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-6 border border-black/5 bg-zinc-50">
          <p className="text-xs font-black text-black/30 uppercase tracking-[0.2em]">Queue is empty</p>
        </div>
      ) : (
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
                        <img 
                          src={listing.image_url || 'https://picsum.photos/seed/clothing/100/133'} 
                          alt="" 
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
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
                    {listing.sale_price && (
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Sale: {formatCurrency(listing.sale_price)}</p>
                    )}
                  </td>
                  <td className="py-6 px-4">
                    <p className="text-xs font-medium">{listing.seller_email}</p>
                  </td>
                  <td className="py-6 px-4">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => handleAction(listing.id, 'approved')}
                        disabled={actioningId === listing.id}
                        className="h-10 w-10 flex items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all disabled:opacity-50"
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleAction(listing.id, 'rejected')}
                        disabled={actioningId === listing.id}
                        className="h-10 w-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <Link 
                        to={`/product/${listing.id}`}
                        className="h-10 w-10 flex items-center justify-center rounded-full bg-black/5 text-black hover:bg-black hover:text-white transition-all"
                        title="View Details"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---------------- Sub-panels ----------------

function OrdersPanel({ orders, loading, onUpdate }: { orders: Order[]; loading: boolean; onUpdate: (id: string, status: Order['status']) => void }) {
  const [filter, setFilter] = React.useState<'all' | Order['status']>('all');
  const filtered = orders.filter((o) => filter === 'all' || o.status === filter);
  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('px-4 py-2 text-[10px] font-black uppercase tracking-widest border', filter === f ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10 hover:border-black')}>{f}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-black/10">
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Order</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Item / SKU</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Buyer</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Seller</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Total</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Status</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-black/5">
                <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest">{o.order_number}<br /><span className="text-black/40">{new Date(o.created_at).toLocaleDateString()}</span></td>
                <td className="py-4 px-3 text-xs font-bold">{o.listing_title}<br /><span className="text-[10px] font-normal text-black/40">{o.listing_sku}</span></td>
                <td className="py-4 px-3 text-[10px] font-bold">{o.buyer_name}<br /><span className="text-black/40">{o.buyer_email}</span></td>
                <td className="py-4 px-3 text-[10px] font-bold">{o.seller_email}</td>
                <td className="py-4 px-3 text-xs font-black">{formatCurrency(Number(o.total_amount))}</td>
                <td className="py-4 px-3 text-[10px] font-black uppercase tracking-widest">{o.status}</td>
                <td className="py-4 px-3 text-right">
                  <select value={o.status} onChange={(e) => onUpdate(o.id, e.target.value as Order['status'])} className="text-[10px] font-bold uppercase tracking-widest border border-black/10 px-2 py-1 bg-white">
                    <option value="pending">pending</option>
                    <option value="paid">paid</option>
                    <option value="shipped">shipped</option>
                    <option value="delivered">delivered</option>
                    <option value="cancelled">cancelled</option>
                    <option value="refunded">refunded</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="border border-black/5 bg-zinc-50 p-12 text-center text-xs font-bold uppercase tracking-widest text-black/30">No orders.</div>}
      </div>
    </div>
  );
}

function PayoutsPanel({ payouts, loading, onAction }: { payouts: SellerPayout[]; loading: boolean; onAction: (id: string, action: 'release' | 'hold' | 'reset') => void }) {
  const [filter, setFilter] = React.useState<'all' | SellerPayout['status']>('pending');
  const filtered = payouts.filter((p) => filter === 'all' || p.status === filter);
  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'released', 'held', 'cancelled'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('px-4 py-2 text-[10px] font-black uppercase tracking-widest border', filter === f ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10 hover:border-black')}>{f}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-black/10">
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Created</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Seller</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Send To</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Amount</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Status / Ref</th>
            <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-black/5 align-top">
                <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="py-4 px-3 text-[10px] font-bold">{p.seller_email}</td>
                <td className="py-4 px-3 text-[10px] font-bold leading-relaxed">
                  {p.destination_upi && <div>UPI: <span className="font-mono">{p.destination_upi}</span></div>}
                  {p.destination_account && (
                    <div>
                      A/C: <span className="font-mono">{p.destination_account}</span><br />
                      IFSC: <span className="font-mono">{p.destination_ifsc}</span><br />
                      {p.destination_holder}
                    </div>
                  )}
                  {!p.destination_upi && !p.destination_account && <span className="text-red-600">Not provided</span>}
                </td>
                <td className="py-4 px-3 text-xs font-black">{formatCurrency(Number(p.amount))}</td>
                <td className="py-4 px-3 text-[10px] font-black uppercase tracking-widest">
                  {p.status}
                  {p.hold_reason && <div className="text-amber-700 normal-case">— {p.hold_reason}</div>}
                  {p.payout_reference && <div className="text-emerald-700 normal-case font-mono">Ref: {p.payout_reference}</div>}
                </td>
                <td className="py-4 px-3 text-right">
                  <div className="flex gap-2 justify-end">
                    {p.status !== 'released' && (
                      <button onClick={() => onAction(p.id, 'release')} className="bg-emerald-600 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700">Release</button>
                    )}
                    {p.status === 'pending' && (
                      <button onClick={() => onAction(p.id, 'hold')} className="bg-amber-100 text-amber-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-200">Hold</button>
                    )}
                    {(p.status === 'released' || p.status === 'held') && (
                      <button onClick={() => onAction(p.id, 'reset')} className="bg-zinc-100 text-zinc-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200">Reset</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="border border-black/5 bg-zinc-50 p-12 text-center text-xs font-bold uppercase tracking-widest text-black/30">No payouts.</div>}
      </div>
    </div>
  );
}

function CampaignsPanel() {
  const [subject, setSubject] = React.useState('');
  const [bodyHtml, setBodyHtml] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [recipientCount, setRecipientCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    supabase.from('subscribers').select('id', { count: 'exact', head: true }).eq('is_active', true).then(({ count }) => setRecipientCount(count ?? 0));
  }, []);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const { data: subs } = await supabase.from('subscribers').select('email').eq('is_active', true);
      const emails = (subs ?? []).map((s: any) => s.email).filter(Boolean);
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

      // Log campaign first
      const { data: campaign } = await supabase.from('email_campaigns').insert({
        subject, body_html: bodyHtml, recipient_count: emails.length, sent_at: new Date().toISOString(),
        sent_by: 'admin', status: 'sending',
      }).select().single();

      // Fire one send-email call per recipient (best-effort, no batching for MVP)
      let ok = 0;
      for (const to of emails) {
        const r = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
          body: JSON.stringify({ template: 'custom', to, extra: { subject, html: bodyHtml } }),
        }).catch(() => null);
        if (r?.ok) ok++;
      }
      if (campaign) await supabase.from('email_campaigns').update({ status: 'sent' }).eq('id', campaign.id);
      setResult(`Sent ${ok} of ${emails.length}`);
    } catch (err: any) {
      setResult(err?.message ?? 'Failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <p className="text-[11px] font-bold uppercase tracking-widest text-black/60">
        Promotional emails — sent to <strong>{recipientCount ?? '...'}</strong> active subscribers via Resend.
      </p>
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="border-b border-black/10 py-3 text-sm font-bold focus:border-black outline-none" />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest">HTML Body</label>
        <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10} className="border border-black/10 p-4 text-sm font-mono focus:border-black outline-none" />
      </div>
      <button onClick={send} disabled={sending || !subject || !bodyHtml} className="bg-black text-white py-4 text-[11px] font-black uppercase tracking-[0.3em] disabled:opacity-50">
        {sending ? 'Sending...' : 'Send Campaign'}
      </button>
      {result && <p className="text-[11px] font-bold uppercase tracking-widest">{result}</p>}
    </div>
  );
}

// Users panel — list all profiles, toggle admin flag.
function UsersPanel({ users, loading, currentUserId, onToggleAdmin }: {
  users: AdminProfile[];
  loading: boolean;
  currentUserId: string;
  onToggleAdmin: (uid: string, makeAdmin: boolean) => void;
}) {
  const [filter, setFilter] = React.useState('');
  const filtered = users.filter((u) =>
    !filter || u.email.toLowerCase().includes(filter.toLowerCase()) || (u.full_name ?? '').toLowerCase().includes(filter.toLowerCase()),
  );
  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-black/20" /></div>;
  return (
    <div className="flex flex-col gap-6">
      <input
        type="text"
        placeholder="Search by name or email…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="border-b border-black/10 py-3 text-sm font-bold focus:border-black outline-none max-w-md"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/10">
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Joined</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Email</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Name</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Phone</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40">Role</th>
              <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-black/40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-black/5">
                <td className="py-4 px-3 text-[10px] font-bold uppercase tracking-widest">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-4 px-3 text-[11px] font-bold">{u.email}{u.id === currentUserId && <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-black/40">(you)</span>}</td>
                <td className="py-4 px-3 text-[11px] font-bold">{u.full_name ?? '—'}</td>
                <td className="py-4 px-3 text-[11px] font-bold">{u.phone ?? '—'}</td>
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
        {filtered.length === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 py-12 text-center">No users found.</p>}
      </div>
    </div>
  );
}
