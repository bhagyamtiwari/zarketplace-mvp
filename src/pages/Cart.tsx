import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCart } from '../lib/cart';
import type { CartItem } from '../types';
import { formatCurrency } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { AuthModal } from '../components/AuthModal';
import { useAuth } from '../lib/auth';
import { getShippingCategories, shippingRateFor, type ShippingCategory } from '../lib/pricing';
import { itemPath } from '../lib/pageMeta';
import { PromoCodeField } from '../components/PromoCodeField';
import { CODE_RE, checkDiscountCode, getPendingCode, normalizeCode, setPendingCode, type CheckResult } from '../lib/discounts';

// Open to everyone: a cart is kept on the device until sign-in, and signing
// in is asked for at checkout, where an account is actually needed.
export function Cart() {
  const { items, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [signIn, setSignIn] = React.useState(false);
  // Only a signed-in buyer can have a code checked. Signed out, the cart keeps
  // the code and checkout checks it once they have signed in.
  const checkCode = React.useCallback(
    (code: string, total: number) => checkDiscountCode(code, total, null),
    [],
  );
  return (
    <>
      <CartView
        items={items}
        checkCode={user ? checkCode : null}
        onRemove={(id) => { void remove(id); }}
        onClear={() => { void clear(); }}
        onCheckout={() => (user ? navigate('/checkout') : setSignIn(true))}
      />
      <AuthModal open={signIn} onClose={() => setSignIn(false)} redirectTo="/checkout" message="Sign in to check out." />
    </>
  );
}

/** The page itself, from the cart's items. Separate from the cart context so it can be looked at. */
export function CartView({ items, onRemove, onClear, onCheckout, checkCode = null }: {
  items: CartItem[];
  onRemove: (listingId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  /** Prices a code against this total. Null when signed out, where it cannot be checked yet. */
  checkCode?: ((code: string, total: number) => Promise<CheckResult>) | null;
}) {
  const count = items.length;
  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  React.useEffect(() => { getShippingCategories().then(setShippingCategories); }, []);

  const subtotal = items.reduce((sum, i) => sum + (i.sale_price ?? i.price ?? 0), 0);
  const shipping = items.reduce((sum, i) => sum + (i.free_shipping ? 0 : shippingRateFor(i.shipping_category, shippingCategories)), 0);
  const total = subtotal + shipping;
  const shippingReady = shippingCategories.length > 0;

  // The code, carried for this visit so checkout applies it. amountOff is
  // null until the server has priced it, which needs a signed-in buyer.
  const [promo, setPromo] = React.useState<{ code: string; amountOff: number | null } | null>(() => {
    const carried = getPendingCode();
    return carried ? { code: carried, amountOff: null } : null;
  });
  const [promoNotice, setPromoNotice] = React.useState<string | null>(null);

  // A code carried in from earlier is priced once the total is known.
  React.useEffect(() => {
    if (!checkCode || !promo || promo.amountOff != null || !shippingReady) return;
    let live = true;
    void checkCode(promo.code, total).then((r) => {
      if (!live) return;
      if (r.ok === false) { setPromo(null); setPendingCode(null); setPromoNotice(`${promo.code}: ${r.message}`); }
      else setPromo({ code: r.code, amountOff: r.amountOff });
    });
    return () => { live = false; };
  }, [checkCode, promo, shippingReady, total]);

  const applyPromo = async (raw: string): Promise<string | null> => {
    const code = normalizeCode(raw);
    if (!CODE_RE.test(code)) return 'We do not recognise that code.';
    setPromoNotice(null);
    if (!checkCode) {
      setPromo({ code, amountOff: null });
      setPendingCode(code);
      return null;
    }
    const r = await checkCode(code, total);
    if (r.ok === false) return r.message;
    setPromo({ code: r.code, amountOff: r.amountOff });
    setPendingCode(r.code);
    return null;
  };
  const removePromo = () => { setPromo(null); setPendingCode(null); setPromoNotice(null); };

  // Never more than the order less a rupee, the same rule as the server.
  const promoOff = promo?.amountOff != null ? Math.max(0, Math.min(promo.amountOff, total - 1)) : 0;

  const itemHref = (i: { sku?: string | null; listing_id: string; title?: string; brand?: string | null }) =>
    itemPath({ sku: i.sku, id: i.listing_id, title: i.title, brand: i.brand });

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
              <Link to={itemHref(item)} className="h-24 w-[72px] shrink-0 overflow-hidden bg-zinc-100">
                {item.image_url && (
                  <img src={variantUrl(item.image_url, 'thumb')} alt={item.title} className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <Link to={itemHref(item)} className="font-bold leading-snug hover:underline underline-offset-4">
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

        <PromoCodeField
          applied={promo?.code ?? null}
          appliedNote={promo && promo.amountOff == null ? 'applied at checkout' : 'applied'}
          onApply={applyPromo}
          onRemove={removePromo}
          notice={promoNotice}
          divider={false}
        />

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt>Subtotal ({count} {count === 1 ? 'item' : 'items'})</dt>
          <dd className="text-right tabular-nums">{formatCurrency(subtotal)}</dd>
          <dt>Shipping</dt>
          <dd className="text-right tabular-nums">
            {shippingCategories.length === 0 ? 'Calculating...' : shipping === 0 ? 'Free' : formatCurrency(shipping)}
          </dd>
          {promoOff > 0 && (
            <>
              <dt>Promo code</dt>
              <dd className="text-right tabular-nums">&minus;{formatCurrency(promoOff)}</dd>
            </>
          )}
          <div className="col-span-2 mt-3 flex items-baseline justify-between border-t border-black/10 pt-4">
            <dt className="font-bold">Total</dt>
            <dd className="text-lg font-black tabular-nums">{formatCurrency(total - promoOff)}</dd>
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
