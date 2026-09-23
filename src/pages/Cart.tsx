import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCart } from '../lib/cart';
import type { CartItem } from '../types';
import { formatCurrency } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { RequireAuth } from '../components/RequireAuth';
import { getShippingCategories, shippingRateFor, type ShippingCategory } from '../lib/pricing';

export function Cart() {
  return (
    <RequireAuth message="Sign in to see your cart.">
      <CartInner />
    </RequireAuth>
  );
}

function CartInner() {
  const { items, remove, clear } = useCart();
  const navigate = useNavigate();
  return (
    <CartView
      items={items}
      onRemove={(id) => { void remove(id); }}
      onClear={() => { void clear(); }}
      onCheckout={() => navigate('/checkout')}
    />
  );
}

/** The page itself, from the cart's items. Separate from the cart context so it can be looked at. */
export function CartView({ items, onRemove, onClear, onCheckout }: {
  items: CartItem[];
  onRemove: (listingId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  const count = items.length;
  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  React.useEffect(() => { getShippingCategories().then(setShippingCategories); }, []);

  const subtotal = items.reduce((sum, i) => sum + (i.sale_price ?? i.price ?? 0), 0);
  const shipping = items.reduce((sum, i) => sum + (i.free_shipping ? 0 : shippingRateFor(i.shipping_category, shippingCategories)), 0);
  const total = subtotal + shipping;

  const itemPath = (i: { sku?: string | null; listing_id: string }) =>
    i.sku ? `/item/${i.sku.toLowerCase()}` : `/product/${i.listing_id}`;

  // A centred column, like the sell form: a cart is one short task, and on a
  // wide screen a list pinned to the left edge looked unfinished. The same
  // type as the item page: bold for what matters, regular for the rest, the
  // tracked label only on the buttons. A list with hairlines between items,
  // not a grey panel.
  if (count === 0) {
    return (
      <div className="shell-form pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Your cart is empty</h1>
        <p className="text-sm">Find something you like and add it here.</p>
        <Link
          to="/browse"
          className="self-start bg-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800"
        >
          Shop now
        </Link>
      </div>
    );
  }

  return (
    <div className="shell-form pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Continue shopping
      </Link>

      <div className="flex flex-col gap-8">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Your Cart</h1>

        <ul className="flex flex-col border-t border-black/10">
          {items.map((item) => (
            <li key={item.listing_id} className="flex gap-4 border-b border-black/10 py-4">
              <Link to={itemPath(item)} className="h-24 w-[72px] shrink-0 overflow-hidden bg-zinc-100">
                {item.image_url && (
                  <img src={variantUrl(item.image_url, 'thumb')} alt={item.title} className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <Link to={itemPath(item)} className="font-bold leading-snug hover:underline underline-offset-4">
                  {item.title}
                </Link>
                {item.sku && <span>{item.sku}</span>}
                <button
                  type="button"
                  onClick={() => onRemove(item.listing_id)}
                  className="mt-auto self-start underline underline-offset-4 decoration-black/30 hover:decoration-black"
                >
                  Remove
                </button>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums">
                {formatCurrency(item.sale_price ?? item.price ?? 0)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt>Subtotal ({count} {count === 1 ? 'item' : 'items'})</dt>
          <dd className="text-right tabular-nums">{formatCurrency(subtotal)}</dd>
          <dt>Shipping</dt>
          <dd className="text-right tabular-nums">
            {shippingCategories.length === 0 ? 'Calculating...' : shipping === 0 ? 'Free' : formatCurrency(shipping)}
          </dd>
          <div className="col-span-2 mt-3 flex items-baseline justify-between border-t border-black/10 pt-4">
            <dt className="font-bold">Total</dt>
            <dd className="text-lg font-black tabular-nums">{formatCurrency(total)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onCheckout}
            className="w-full bg-black py-5 text-xs font-black uppercase tracking-[0.3em] text-white transition-colors hover:bg-zinc-800"
          >
            Checkout
          </button>
          {/* Clearing also lets go of any checkout hold, so the items are back
              on sale for everyone straight away. */}
          <button
            type="button"
            onClick={() => { if (confirm('Clear your cart? Anything you were checking out goes back on sale.')) onClear(); }}
            className="self-center text-sm underline underline-offset-4 decoration-black/30 hover:decoration-black"
          >
            Clear cart
          </button>
        </div>
      </div>
    </div>
  );
}
