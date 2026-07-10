import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, ArrowRight, ArrowLeft, Package, AlertTriangle } from 'lucide-react';
import { useCart } from '../lib/cart';
import { formatCurrency } from '../lib/utils';
import { RequireAuth } from '../components/RequireAuth';
import { getShippingCategories, shippingRateFor, type ShippingCategory } from '../lib/pricing';

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

  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  React.useEffect(() => { getShippingCategories().then(setShippingCategories); }, []);

  const subtotal = items.reduce((sum, i) => sum + (i.sale_price ?? i.price ?? 0), 0);
  const shipping = items.reduce((sum, i) => sum + shippingRateFor(i.shipping_category, shippingCategories), 0);
  const total = subtotal + shipping;
  const sellerIds = new Set(items.map((i) => i.seller_id).filter(Boolean));
  const hasMultipleSellers = sellerIds.size > 1;

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:py-32 text-center flex flex-col items-center gap-8">
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
          Browse All
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-24 sm:pt-28 pb-16 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-6">
        <ArrowLeft className="h-3 w-3" /> Continue Shopping
      </Link>

      <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase mb-8">Your Cart</h1>

      {hasMultipleSellers && (
        <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 mb-6">
          <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800 leading-relaxed">
            As of now, purchases from different sellers cannot be combined into a single order. Please complete each purchase separately.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-8 p-8 sm:p-10 bg-zinc-50 border border-black/5">
        <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
          <Package className="h-4 w-4" /> Order Summary ({count})
        </h2>

        <div className="flex flex-col gap-5">
          {items.map((item) => (
            <div key={item.listing_id} className="flex gap-4 items-center">
              <Link
                to={item.sku ? `/item/${item.sku.toLowerCase()}` : `/product/${item.listing_id}`}
                className="h-20 w-16 bg-zinc-200 overflow-hidden border border-black/5 flex-shrink-0"
              >
                {item.image_url && (
                  <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                <Link
                  to={item.sku ? `/item/${item.sku.toLowerCase()}` : `/product/${item.listing_id}`}
                  className="text-xs font-bold uppercase tracking-widest truncate"
                >
                  {item.title}
                </Link>
                <span className="text-[9px] font-black uppercase tracking-widest text-black/40">{item.brand}</span>
                {item.size && <span className="text-[9px] font-black uppercase tracking-widest text-black/40">Size {item.size}</span>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-sm font-black">{formatCurrency(item.sale_price ?? item.price ?? 0)}</span>
                <button
                  type="button"
                  onClick={() => remove(item.listing_id)}
                  className="text-black/30 hover:text-red-600 transition-colors"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-y border-black/10 py-6">
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
            <span>Shipping</span>
            <span>{shippingCategories.length === 0 ? 'Calculating...' : formatCurrency(shipping)}</span>
          </div>
        </div>

        <div className="flex justify-between items-end">
          <span className="text-xs font-black uppercase tracking-widest">Total</span>
          <span className="text-3xl font-black tracking-tighter">{formatCurrency(total)}</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/checkout')}
          disabled={hasMultipleSellers}
          className="w-full bg-black py-6 text-xs font-black uppercase tracking-[0.4em] text-white transition-all hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          Checkout <ArrowRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => clear()}
          className="self-center text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black underline"
        >
          Clear cart
        </button>
      </div>
    </div>
  );
}
