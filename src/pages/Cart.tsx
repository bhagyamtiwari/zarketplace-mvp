import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useCart } from '../lib/cart';
import { formatCurrency } from '../lib/utils';
import { RequireAuth } from '../components/RequireAuth';
import { LaunchOfferBanner } from '../components/LaunchOfferBanner';

export function Cart() {
  return (
    <RequireAuth message="Sign in to view your cart.">
      <CartInner />
    </RequireAuth>
  );
}

function CartInner() {
  const { items, remove, clear, count } = useCart();
  const navigate = useNavigate();

  const subtotal = items.reduce((sum, i) => sum + (i.sale_price ?? i.price ?? 0), 0);
  const shipping = items.reduce((sum, i) => sum + (i.shipping_mode === 'paid' ? (i.shipping_cost || 0) : 0), 0);
  const total = subtotal + shipping;

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center flex flex-col items-center gap-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-100 text-black/40">
          <ShoppingBag className="h-10 w-10" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter uppercase">Cart is empty</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 max-w-md">
          Find something you love and add it here.
        </p>
        <Link
          to="/browse"
          className="bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800"
        >
          Browse the Drop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Continue Shopping
      </Link>

      <div className="flex flex-col gap-4 mb-16">
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Your Bag</span>
        <h1 className="text-5xl font-black tracking-tighter uppercase">Cart ({count})</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-7 flex flex-col gap-6">
          {items.map((item) => (
            <div key={item.listing_id} className="flex gap-6 border-b border-black/5 pb-6">
              <Link
                to={item.sku ? `/item/${item.sku.toLowerCase()}` : `/product/${item.listing_id}`}
                className="h-32 w-24 bg-zinc-50 overflow-hidden border border-black/5 flex-shrink-0"
              >
                {item.image_url && (
                  <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-widest text-black/60">{item.brand}</span>
                  <Link
                    to={item.sku ? `/item/${item.sku.toLowerCase()}` : `/product/${item.listing_id}`}
                    className="text-sm font-bold uppercase tracking-widest truncate"
                  >
                    {item.title}
                  </Link>
                  <span className="text-[10px] font-black uppercase tracking-widest text-black/60">
                    Size {item.size}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">
                    {item.shipping_mode === 'paid' && (item.shipping_cost || 0) > 0
                      ? `Shipping: ${formatCurrency(item.shipping_cost || 0)}`
                      : 'Free shipping'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black">{formatCurrency(item.sale_price ?? item.price ?? 0)}</span>
                  <button
                    type="button"
                    onClick={() => remove(item.listing_id)}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black/60 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => clear()}
            className="self-start text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black underline"
          >
            Clear cart
          </button>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-32 flex flex-col gap-8 p-10 bg-zinc-50 border border-black/5">
            <h2 className="text-xs font-black uppercase tracking-widest">Order Summary</h2>
            <LaunchOfferBanner variant="badge" className="self-start" />
            <div className="flex flex-col gap-4 border-y border-black/5 py-6">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span>Shipping</span>
                {shipping > 0 ? (
                  <span>{formatCurrency(shipping)}</span>
                ) : (
                  <span className="text-emerald-600">Free</span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-xs font-black uppercase tracking-widest">Total</span>
              <span className="text-3xl font-black tracking-tighter">{formatCurrency(total)}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/checkout')}
              className="w-full bg-black py-6 text-xs font-black uppercase tracking-[0.4em] text-white transition-all hover:bg-zinc-800 flex items-center justify-center gap-3"
            >
              Checkout <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-[9px] font-bold uppercase tracking-widest text-black/40 leading-relaxed text-center">
              Pay the seller directly via UPI on the next page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
