import React from 'react';
import { supabase } from '../lib/supabase';
import { Listing, ListingStatus } from '../types';
import { formatCurrency } from '../lib/utils';
import { Loader2, Check, X, ExternalLink, ShieldAlert, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Admin() {
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actioningId, setActioningId] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState('');
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  const fetchPendingListings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setListings(data || []);
    } catch (err) {
      console.error('Error fetching pending listings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'zarketplace2025') {
      setIsAuthenticated(true);
      fetchPendingListings();
    } else {
      alert('Incorrect password');
    }
  };

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

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 flex flex-col items-center gap-10">
        <div className="h-16 w-16 rounded-full bg-black text-white flex items-center justify-center">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Admin Access</h1>
          <p className="text-xs font-bold text-black/40 uppercase tracking-widest">Restricted Area</p>
        </div>
        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          <input 
            type="password" 
            placeholder="Enter Admin Password"
            className="w-full border-b border-black/10 py-4 text-center font-bold focus:border-black outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" className="w-full bg-black py-5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800">
            Authenticate
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/40">Admin Portal</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Moderation</h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={seedSampleData}
            className="flex items-center gap-3 border border-black px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all"
          >
            <Database className="h-4 w-4" /> Seed Sample Data
          </button>
          <button 
            onClick={fetchPendingListings}
            className="flex items-center gap-3 border border-black/10 px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:border-black transition-all"
          >
            Refresh Queue
          </button>
        </div>
      </div>

      {loading ? (
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
      )}
    </div>
  );
}
