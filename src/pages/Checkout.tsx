// Checkout via Razorpay, on one page. Payment status is never set by this
// page — only the razorpay-webhook edge function (verified server-side) ever
// writes orders.status = 'paid' / 'payment_failed'. This page only:
//   1. Collects the address, next to the order summary.
//   2. On "Complete purchase": creates one order row per item (which holds
//      them for 5 minutes), asks create-razorpay-order for a Razorpay order,
//      and opens Razorpay Checkout. Closing Razorpay leaves the hold in place,
//      and pressing the button again reuses it while it lasts and nothing on
//      the page has changed.
//   3. Polls the order rows until the webhook has flipped their status, then
//      shows Success or Failed.
//
// There used to be a separate Payment step between 1 and 2. All it did was
// repeat the address and ask for one more click before Razorpay, which shows
// the amount and takes the payment itself.

import React from 'react';
import { scrollToTop } from '../lib/scrollToTop';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CartItem, Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { variantUrl } from '../lib/images';
import { Loader2, ArrowLeft } from 'lucide-react';
import { ui } from '../lib/ui';
import { resolvePincode } from '../lib/pincode';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { RequireAuth } from '../components/RequireAuth';
import { log } from '../lib/log';
import { getPricingConfig, buyerProtectionFee, type PricingConfig, getShippingCategories, shippingRateFor, type ShippingCategory } from '../lib/pricing';
import { trackEvent } from '../lib/analytics';
import { itemPath } from '../lib/pageMeta';

const clog = log('checkout');
const RESUME_KEY = 'zk_checkout_v3';
const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_SCRIPT_SRC;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
      document.head.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

type Step = 'checkout' | 'confirming' | 'success' | 'failed';

interface ResumeState {
  step: Step;
  order_numbers: string[];
  amount: number;
  reservation_expires_at?: string | null;
}

// What the missing-field message calls each field.
const FIELD_NAMES: Record<string, string> = {
  fullName: 'full name', email: 'email', phone: 'phone', address: 'address', city: 'city', pincode: 'pincode',
  billingFullName: 'billing name', billingAddress: 'billing address', billingCity: 'billing city', billingPincode: 'billing pincode',
};

function snapshotFromListing(l: Listing): CartItem {
  return {
    listing_id: l.id, sku: l.sku, added_at: new Date().toISOString(),
    title: l.title, brand: l.brand, price: l.price, sale_price: l.sale_price,
    image_url: l.image_url, size: l.size,
    seller_id: l.seller_id, seller_display_name: l.seller_display_name,
    shipping_category: l.shipping_category,
    // Without these two, Buy it now priced every item as paid delivery: the
    // summary added the courier rate while the charge (server-side) did not.
    free_shipping: l.free_shipping,
    shipping_mode: l.shipping_mode ?? 'platform',
  };
}

export function Checkout() {
  return (
    <RequireAuth message="Sign in to complete your purchase.">
      <CheckoutInner />
    </RequireAuth>
  );
}

function CheckoutInner() {
  const { id } = useParams();
  const { user, profile, refreshProfile } = useAuth();
  const cart = useCart();

  const [buyNowItems, setBuyNowItems] = React.useState<CartItem[] | null>(null);
  const [loadingBuyNow, setLoadingBuyNow] = React.useState<boolean>(!!id);

  React.useEffect(() => {
    if (!id) { setBuyNowItems(null); setLoadingBuyNow(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingBuyNow(true);
      try {
        const { data, error } = await supabase.from('public_listings').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        if (!data) { setBuyNowItems([]); return; }
        setBuyNowItems([snapshotFromListing(data as Listing)]);
      } catch (err) {
        clog.error('buy-now fetch failed', err);
        if (!cancelled) setBuyNowItems([]);
      } finally {
        if (!cancelled) setLoadingBuyNow(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const items: CartItem[] = id ? (buyNowItems ?? []) : cart.items;


  const [step, setStep] = React.useState<Step>('checkout');

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const [orderNumbers, setOrderNumbers] = React.useState<string[]>([]);
  const [reservationExpiresAt, setReservationExpiresAt] = React.useState<string | null>(null);
  // What the held orders were created from (the items and both addresses), so
  // a second press of the button can tell whether they still match the page.
  const ordersKey = React.useRef<string | null>(null);
  // True while Razorpay's window is open. The hold running out then is the
  // server's to settle (a late payment is refunded), so the page leaves the
  // orders alone until the window closes.
  const paying = React.useRef(false);
  // What the server actually priced the orders at, once they exist. The
  // summary shows these rather than recomputing, so it and the Razorpay
  // charge are the same numbers by construction.
  const [serverTotals, setServerTotals] = React.useState<{ subtotal: number; shipping: number; fee: number; total: number } | null>(null);
  // Full order rows once payment is confirmed, so the success screen can show
  // exactly what was bought and for how much - not just an order number.
  const [confirmedOrders, setConfirmedOrders] = React.useState<Array<{
    order_number: string; listing_title: string | null; listing_image_url: string | null;
    amount: number; shipping_cost: number; buyer_protection_fee: number; total_amount: number;
    free_shipping: boolean; shipping_address: Record<string, string> | null;
  }>>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [shippingAddress, setShippingAddress] = React.useState({
    fullName: '', email: '', phone: '', address: '', landmark: '', city: '', state: '', pincode: '',
  });
  const [billingSameAsShipping, setBillingSameAsShipping] = React.useState(true);
  const [billingAddress, setBillingAddress] = React.useState({
    fullName: '', address: '', landmark: '', city: '', state: '', pincode: '',
  });

  // Which items this delivery address cannot legally receive, derived from the
  // pincode and never from a dropdown - see src/lib/pincode.ts. The buyer is
  // no longer asked for a state at all: one field cannot contradict itself,
  // and that contradiction was the bug. Before the seller's state has loaded
  // nothing is blocked here; the server refuses regardless, so the UI erring
  // toward "not yet known" costs a late message, not an illegal sale.
  const deliveryResolved = resolvePincode(shippingAddress.pincode);

  React.useEffect(() => {
    if (!user) return;
    const addr = (profile?.default_address ?? {}) as Record<string, string>;
    setShippingAddress((prev) => ({
      fullName: prev.fullName || profile?.full_name || addr.fullName || '',
      // What the buyer typed wins, like every other field. This runs again
      // when the profile refreshes mid-purchase, and with the account email
      // first it quietly swapped a typed address back on screen.
      email: prev.email || user.email || '',
      phone: prev.phone || profile?.phone || addr.phone || '',
      address: prev.address || addr.address || '',
      landmark: prev.landmark || addr.landmark || '',
      city: prev.city || addr.city || '',
      state: prev.state || addr.state || '',
      pincode: prev.pincode || addr.pincode || '',
    }));
  }, [user, profile]);

  // A reload in the middle of confirming or after a failure comes back to that
  // screen. An unpaid hold is not restored: the next press of the button makes
  // a fresh one, which replaces the old hold rather than competing with it.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const r = JSON.parse(raw) as ResumeState;
      if (r?.order_numbers?.length && (r.step === 'confirming' || r.step === 'failed')) {
        setOrderNumbers(r.order_numbers);
        setStep(r.step);
      }
    } catch {}
  }, []);

  // Pricing config drives the Buyer Protection line. It's read once; until it
  // loads (or if it's unavailable because the migration isn't applied yet) the
  // fee is treated as 0, which matches the server: the charge always comes from
  // orders.total_amount, and the trigger only adds the fee once the config row
  // exists. So display and charge never diverge.
  const [pricing, setPricing] = React.useState<PricingConfig | null>(null);
  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  React.useEffect(() => { getPricingConfig().then(setPricing); getShippingCategories().then(setShippingCategories); }, []);

  const subtotal = items.reduce((s, i) => s + (i.sale_price ?? i.price ?? 0), 0);
  // Mirrors orders_snapshot_from_listing: self-ship and seller-paid delivery
  // both cost the buyer nothing. Display only - the buyer is charged the
  // server-computed total_amount - but a summary that disagrees with the
  // charge is its own kind of broken.
  const shippingFor = (i: CartItem) =>
    i.shipping_mode === 'self_ship' || i.free_shipping
      ? 0
      : shippingRateFor(i.shipping_category, shippingCategories);
  const shipping = items.reduce((s, i) => s + shippingFor(i), 0);
  const anySelfShip = items.some((i) => i.shipping_mode === 'self_ship');
  const buyerProtection = items.reduce((s, i) => s + buyerProtectionFee(i.sale_price ?? i.price ?? 0, pricing), 0);
  const total = subtotal + shipping + buyerProtection;

  const persistResume = (state: Partial<ResumeState>) => {
    try {
      const merged: ResumeState = {
        step, order_numbers: orderNumbers, amount: total,
        reservation_expires_at: reservationExpiresAt, ...state,
      };
      localStorage.setItem(RESUME_KEY, JSON.stringify(merged));
    } catch {}
  };
  const clearResume = () => { try { localStorage.removeItem(RESUME_KEY); } catch {} };

  // Everything the order rows are made from. When this changes after a hold
  // was taken, the held orders no longer describe what the buyer is paying for.
  const checkoutKey = () => JSON.stringify([
    items.map((i) => i.listing_id), shippingAddress, billingSameAsShipping ? null : billingAddress,
  ]);

  const missingFields = (): string | null => {
    const required: Array<[string, string]> = [
      ['fullName', shippingAddress.fullName], ['email', shippingAddress.email],
      ['phone', shippingAddress.phone], ['address', shippingAddress.address],
      ['city', shippingAddress.city], ['pincode', shippingAddress.pincode],
    ];
    if (!billingSameAsShipping) {
      required.push(
        ['billingFullName', billingAddress.fullName], ['billingAddress', billingAddress.address],
        ['billingCity', billingAddress.city], ['billingPincode', billingAddress.pincode],
      );
    }
    const missing = required.filter(([, v]) => !v?.trim()).map(([k]) => FIELD_NAMES[k]);
    return missing.length ? `Please fill in your ${missing.join(', ')}.` : null;
  };

  // Saves the address to the profile and creates one order row per item,
  // which holds each item for 5 minutes. If this buyer already holds one of
  // them, the database replaces that hold rather than refusing.
  const createOrders = async (key: string): Promise<string[]> => {
    if (!user) throw new Error('Sign in to complete your purchase.');
    await supabase.from('profiles').update({
      full_name: profile?.full_name || shippingAddress.fullName,
      phone: profile?.phone || shippingAddress.phone,
      default_address: shippingAddress,
    }).eq('id', user.id);
    await refreshProfile();

    const billingToSave = billingSameAsShipping
      ? shippingAddress
      : { ...billingAddress, email: shippingAddress.email, phone: shippingAddress.phone };

    const rows = items.map((i) => {
      const itemPrice = Number(i.sale_price ?? i.price ?? 0);
      // The server trigger (orders_snapshot_from_listing) recomputes
      // amount/shipping_cost/buyer_protection_fee/total_amount from the
      // live listing + pricing config on insert - these client values are
      // only a display-matching best guess, never trusted for the charge.
      const itemShip = shippingFor(i);
      return {
        listing_id: i.listing_id,
        listing_sku: i.sku ?? null,
        listing_title: i.title ?? null,
        listing_image_url: i.image_url ?? null,
        buyer_id: user.id,
        buyer_email: shippingAddress.email.toLowerCase(),
        buyer_name: shippingAddress.fullName,
        buyer_phone: shippingAddress.phone,
        seller_id: i.seller_id ?? null,
        // Authoritative seller_email / seller_upi_vpa_snapshot are re-derived
        // server-side by the orders_snapshot_from_listing trigger from the
        // base listing; the client never carries seller PII.
        seller_email: null,
        seller_upi_vpa_snapshot: null,
        // The state written here is the one DERIVED from the pincode, not
        // one the buyer typed - so the address that reaches the courier,
        // the invoice and the emails agrees with the place of supply the
        // rule was decided on.
        shipping_address: {
          ...shippingAddress,
          state: deliveryResolved.stateName ?? '',
        } as unknown as Record<string, string>,
        billing_address: {
          ...billingToSave,
          state: resolvePincode((billingToSave as { pincode?: string }).pincode).stateName
            ?? deliveryResolved.stateName ?? '',
        } as unknown as Record<string, string>,
        // Snapshotted so a historical order stays readable after a pincode
        // table is widened.
        buyer_delivery_pincode: shippingAddress.pincode,
        buyer_delivery_state_code: deliveryResolved.stateCode,
        amount: itemPrice,
        shipping_cost: itemShip,
        total_amount: itemPrice + itemShip,
        status: 'awaiting_payment',
      };
    });

    const { data, error } = await supabase.from('orders').insert(rows).select('order_number, reservation_expires_at, amount, buyer_protection_fee, total_amount');
    if (error) throw error;
    {
      const r = (data ?? []) as Array<{ amount: number; buyer_protection_fee: number | null; total_amount: number }>;
      const sub = r.reduce((x, o) => x + Number(o.amount), 0);
      const fee = r.reduce((x, o) => x + Number(o.buyer_protection_fee ?? 0), 0);
      const tot = r.reduce((x, o) => x + Number(o.total_amount), 0);
      if (r.length) setServerTotals({ subtotal: sub, fee, total: tot, shipping: Math.max(0, tot - sub - fee) });
    }
    const nums = (data ?? []).map((r: { order_number: string }) => r.order_number);
    const expiresAt = (data ?? [])[0]?.reservation_expires_at ?? null;

    setOrderNumbers(nums);
    setReservationExpiresAt(expiresAt);
    ordersKey.current = key;
    persistResume({ step: 'checkout', order_numbers: nums, reservation_expires_at: expiresAt });
    return nums;
  };

  // Lets go of the held orders on this page (not in the database, where they
  // simply run out), so the next press of the button starts fresh.
  const forgetOrders = () => {
    clearResume();
    setOrderNumbers([]);
    setReservationExpiresAt(null);
    setServerTotals(null);
    ordersKey.current = null;
  };

  // Polls the order rows until razorpay-webhook has flipped their status.
  // The webhook is the only thing that ever writes 'paid'/'payment_failed' —
  // this never trusts Razorpay Checkout's client-side success callback on
  // its own.
  const waitForConfirmation = React.useCallback(async () => {
    const POLL_INTERVAL_MS = 2000;
    const POLL_MAX_ATTEMPTS = 30; // ~60s
    let result: 'paid' | 'payment_failed' | 'timeout' = 'timeout';
    let rows: typeof confirmedOrders = [];
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const { data } = await supabase.from('orders')
        .select('order_number, status, listing_title, listing_image_url, amount, shipping_cost, buyer_protection_fee, total_amount, free_shipping, shipping_address')
        .in('order_number', orderNumbers);
      const statuses = (data ?? []).map((r: { status: string }) => r.status);
      if (statuses.length > 0 && statuses.every((s) => s === 'paid')) {
        result = 'paid';
        rows = (data ?? []) as unknown as typeof confirmedOrders;
        break;
      }
      if (statuses.some((s) => s === 'payment_failed')) { result = 'payment_failed'; break; }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (result === 'paid') {
      // The conversion event. Revenue is taken from the server-confirmed rows,
      // never from the client's own total.
      trackEvent('order_completed', {
        order_count: rows.length,
        revenue: rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
        order_numbers: rows.map((r) => r.order_number).join(','),
      });
      setConfirmedOrders(rows);
      setStep('success');
      scrollToTop();
      clearResume();
      if (!id) await cart.clear();
    } else if (result === 'payment_failed') {
      trackEvent('order_payment_failed', { order_numbers: orderNumbers.join(',') });
      setErrorMsg('Payment failed. You can try again.');
      setStep('failed');
      scrollToTop();
      persistResume({ step: 'failed' });
    } else {
      // Distinct from an outright failure: the money may still land. Worth
      // watching separately, since a spike here means the webhook is lagging.
      trackEvent('order_confirmation_timeout', { order_numbers: orderNumbers.join(',') });
      setErrorMsg('Still confirming your payment with the bank. Check My Orders in a minute, or try again.');
      setStep('failed');
      scrollToTop();
      persistResume({ step: 'failed' });
    }
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumbers, id]);

  React.useEffect(() => {
    if (step === 'confirming') void waitForConfirmation();
  }, [step, waitForConfirmation]);

  // Opens Razorpay for these orders. Takes the order numbers as an argument
  // because it runs straight after createOrders, before the new numbers have
  // reached state.
  const openPayment = async (nums: string[]) => {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: { order_numbers: nums },
    });
    if (error) throw error;
    const { razorpay_order_id, amount, currency, key_id } = data as {
      razorpay_order_id: string; amount: number; currency: string; key_id: string;
    };

    await loadRazorpayScript();

    const rzp = new window.Razorpay({
      key: key_id,
      amount,
      currency,
      order_id: razorpay_order_id,
      name: 'zarketplace',
      description: `Order ${nums.join(', ')}`,
      prefill: {
        name: shippingAddress.fullName,
        email: shippingAddress.email,
        contact: shippingAddress.phone,
      },
      notes: { order_numbers: nums.join(',') },
      handler: () => {
        // Razorpay says the payment went through, but we don't trust that
        // claim on its own — move to a waiting screen until the webhook
        // (server-verified) confirms it.
        paying.current = false;
        setStep('confirming');
        persistResume({ step: 'confirming', order_numbers: nums });
      },
      modal: {
        ondismiss: () => {
          paying.current = false;
          setSubmitting(false);
          setErrorMsg('Payment was not completed. You can try again.');
        },
      },
    });
    rzp.on('payment.failed', () => {
      setSubmitting(false);
      setErrorMsg('Payment failed. You can try again.');
    });
    paying.current = true;
    rzp.open();
  };

  // The one button. Holds the items (or reuses the hold from a moment ago, if
  // nothing has changed and it has not run out) and opens Razorpay.
  const completePurchase = async () => {
    setErrorMsg(null);
    if (!user) return;
    if (items.length === 0) { setErrorMsg('Your cart is empty.'); return; }
    const missing = missingFields();
    if (missing) { setErrorMsg(missing); return; }

    setSubmitting(true);
    const key = checkoutKey();
    const holdLeft = reservationExpiresAt ? new Date(reservationExpiresAt).getTime() - Date.now() : 0;
    const reuse = orderNumbers.length > 0 && ordersKey.current === key && holdLeft > 15_000;
    try {
      let nums = reuse ? orderNumbers : await createOrders(key);
      // Buyer pressed pay. The gap between this and order_completed is the
      // payment-abandonment rate.
      trackEvent('payment_started', { order_count: nums.length, total });
      try {
        await openPayment(nums);
      } catch (err: any) {
        const status = err?.context?.status;
        // The held orders can no longer be paid (they ran out, or were
        // closed somewhere else). Hold the items again and carry on, once.
        if (reuse && (status === 403 || status === 404 || status === 409)) {
          nums = await createOrders(key);
          await openPayment(nums);
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      clog.error('completePurchase failed', err);
      paying.current = false;
      const status = err?.context?.status;
      if (status === 403 || status === 404 || status === 409) {
        // create-razorpay-order rejected these order numbers, most likely
        // stale state from an earlier session on this browser. Start clean
        // rather than retrying something that can never succeed.
        forgetOrders();
        setErrorMsg('Your checkout expired. Press Complete purchase to start again.');
      } else {
        setErrorMsg(err?.message || 'Could not start the payment. Please try again.');
      }
      setSubmitting(false);
    }
  };

  if (loadingBuyNow) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (items.length === 0 && step === 'checkout') {
    return (
      <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8 [&>*]:max-w-2xl">
        <h1 className={ui.pageTitle}>Nothing to check out</h1>
        <p className={ui.help}>Your cart is empty.</p>
        <Link to="/browse" className={cn(ui.btnPrimary, 'self-start')}>Shop now</Link>
      </div>
    );
  }

  if (step === 'success') {
    return <CheckoutSuccess orders={confirmedOrders} email={shippingAddress.email} />;
  }

  if (step === 'confirming') {
    return (
      <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8 [&>*]:max-w-2xl">
        <Loader2 className="h-6 w-6 animate-spin" />
        <h1 className={ui.pageTitle}>Confirming your payment</h1>
        <p className={ui.help}>This usually takes a few seconds. Please keep this tab open.</p>
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8 [&>*]:max-w-2xl">
        <h1 className={ui.pageTitle}>Payment not confirmed</h1>
        <p className={ui.help}>
          {errorMsg || 'We could not confirm your payment. No charge was completed for a failed attempt.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => { setErrorMsg(null); forgetOrders(); setStep('checkout'); }}
            className={ui.btnPrimary}
          >
            Try again
          </button>
          <Link to="/track-order" className={ui.btnSecondary}>My orders</Link>
        </div>
      </div>
    );
  }

  // One page: the address and the button on the left, the order summary box
  // and the good-to-know notes beside it.
  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to={id ? `/product/${id}` : '/cart'} className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <h1 className={ui.pageTitle}>Checkout</h1>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col gap-12 lg:col-span-7">
          <AddressFields
            addr={shippingAddress} onChange={setShippingAddress}
            billingSame={billingSameAsShipping} onBillingSameChange={setBillingSameAsShipping}
            billingAddr={billingAddress} onBillingChange={setBillingAddress}
            blockedNote={null}
          />
          <PlaceOrder
            amount={serverTotals?.total ?? total}
            itemCount={items.length}
            reservationExpiresAt={reservationExpiresAt}
            onExpire={() => {
              if (paying.current) return;
              forgetOrders();
              setErrorMsg(`Your hold ended and ${items.length === 1 ? 'the item is' : 'the items are'} back on sale. Press Complete purchase to hold ${items.length === 1 ? 'it' : 'them'} again.`);
            }}
            onPlace={completePurchase}
            submitting={submitting}
            errorMsg={errorMsg}
          />
        </div>
        <div className="flex flex-col gap-8 lg:col-span-5">
          <Summary
            items={items}
            subtotal={serverTotals?.subtotal ?? subtotal}
            shipping={serverTotals?.shipping ?? shipping}
            shippingLoading={!serverTotals && shippingCategories.length === 0}
            buyerProtection={serverTotals?.fee ?? buyerProtection}
            total={serverTotals?.total ?? total}
            selfShip={anySelfShip}
          />
          <Assurances />
        </div>
      </div>
    </div>
  );
}

type ConfirmedOrder = {
  order_number: string; listing_title: string | null; listing_image_url: string | null;
  amount: number; shipping_cost: number; buyer_protection_fee: number; total_amount: number;
  free_shipping: boolean; shipping_address: Record<string, string> | null;
};

/**
 * After payment: that it worked, where the confirmation went, what was
 * bought, and how to reach us. The email is sent by the payment webhook
 * (payment_confirmed_buyer) to the address on the order.
 */
export function CheckoutSuccess({ orders, email }: { orders: ConfirmedOrder[]; email: string }) {
  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-8 [&>*]:max-w-2xl">
      <div className="flex flex-col gap-4">
        <h1 className={ui.pageTitle}>Order placed</h1>
        <p className={ui.help}>
          Thank you. Your confirmation is on its way to{email ? <> <span className="font-bold">{email}</span></> : ' your email'}.
          {' '}Not in your inbox? Check your spam folder.
        </p>
      </div>

      {orders.length > 0 && (
        <ul className="flex flex-col border-b border-black/10">
          {orders.map((o) => (
            <li key={o.order_number} className="flex flex-col gap-4 border-t border-black/10 py-5">
              <div className="flex gap-4">
                <div className="h-24 w-[72px] shrink-0 overflow-hidden bg-zinc-100">
                  {o.listing_image_url && (
                    <img src={variantUrl(o.listing_image_url, 'thumb')} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <span className="text-[15px] font-bold leading-snug">{o.listing_title}</span>
                  <span>Order {o.order_number}</span>
                </div>
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                <dt>Item</dt><dd className="text-right tabular-nums">{formatCurrency(Number(o.amount))}</dd>
                <dt>Shipping</dt><dd className="text-right tabular-nums">{o.free_shipping ? 'Free' : formatCurrency(Number(o.shipping_cost))}</dd>
                {Number(o.buyer_protection_fee) > 0 && (
                  <><dt>Buyer Protection</dt><dd className="text-right tabular-nums">{formatCurrency(Number(o.buyer_protection_fee))}</dd></>
                )}
                <dt className="font-bold">Total paid</dt><dd className="text-right font-bold tabular-nums">{formatCurrency(Number(o.total_amount))}</dd>
              </dl>
              {o.shipping_address && (
                <p className="text-sm">
                  <span className="font-bold">Shipping to </span>
                  {[o.shipping_address.address, o.shipping_address.city, o.shipping_address.state, o.shipping_address.pincode].filter(Boolean).join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className={ui.help}>
        Questions? <Link to="/contact" className={cn(ui.link, 'font-bold')}>Contact us</Link>. Updates may also come on
        WhatsApp from <a href="https://wa.me/918505927538" target="_blank" rel="noreferrer" className={cn(ui.link, 'font-bold')}>8505-ZARKET</a>.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/track-order" className={ui.btnPrimary}>My orders</Link>
        <Link to="/browse" className={ui.btnSecondary}>Keep shopping</Link>
      </div>
    </div>
  );
}

type ShippingAddr = { fullName: string; email: string; phone: string; address: string; landmark: string; city: string; state: string; pincode: string };
type BillingAddr = { fullName: string; address: string; landmark: string; city: string; state: string; pincode: string };

// Where it is going and who it is billed to. The button that pays sits below
// these, in PlaceOrder, so this is fields only.
export function AddressFields({
  addr, onChange, billingSame, onBillingSameChange, billingAddr, onBillingChange, blockedNote,
}: {
  addr: ShippingAddr;
  onChange: (a: ShippingAddr) => void;
  billingSame: boolean;
  onBillingSameChange: (v: boolean) => void;
  billingAddr: BillingAddr;
  onBillingChange: (a: BillingAddr) => void;
  blockedNote: string | null;
}) {
  return (
    <section className="flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <h2 className={ui.sectionTitle}>Shipping address</h2>

        {/* Shown the moment the state is chosen, not held back until the
            button. Finding out at payment that the order was never possible
            is the worst version of this. */}
        {blockedNote && <p className={ui.error}>{blockedNote}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          <Field label="Full name" value={addr.fullName} onChange={(v) => onChange({ ...addr, fullName: v })} placeholder="Your name" autoComplete="name" />
          <Field label="Email" type="email" value={addr.email} onChange={(v) => onChange({ ...addr, email: v })} placeholder="you@example.com" autoComplete="email" />
          <Field label="Phone" type="tel" inputMode="tel" value={addr.phone} onChange={(v) => onChange({ ...addr, phone: v })} placeholder="98765 43210" autoComplete="tel" />
          <Field label="Pincode" inputMode="numeric" maxLength={6} value={addr.pincode} onChange={(v) => onChange({ ...addr, pincode: v.replace(/\D/g, '') })} placeholder="400001" autoComplete="postal-code" />
          <div className="md:col-span-2">
            <Field label="Address" value={addr.address} onChange={(v) => onChange({ ...addr, address: v })} placeholder="House number, street, area" autoComplete="street-address" />
          </div>
          <div className="md:col-span-2">
            <Field label="Landmark" optional value={addr.landmark} onChange={(v) => onChange({ ...addr, landmark: v })} placeholder="Near gate 4" />
          </div>
          <Field label="City" value={addr.city} onChange={(v) => onChange({ ...addr, city: v })} placeholder="Mumbai" autoComplete="address-level2" />
          {/* Derived from the pincode, never asked. A buyer picking "Delhi" and
              typing a Gurgaon pincode is not a contradiction they can be
              expected to notice - Gurgaon is Haryana, and one metro is three
              states to GST. Removing the question removes the contradiction. */}
          <StateFromPincode pincode={addr.pincode} />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className={ui.sectionTitle}>Billing address</h2>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={billingSame}
              onChange={(e) => onBillingSameChange(e.target.checked)}
              className="h-4 w-4 accent-black"
            />
            Same as shipping
          </label>
        </div>

        {!billingSame && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="md:col-span-2">
              <Field label="Full name" value={billingAddr.fullName} onChange={(v) => onBillingChange({ ...billingAddr, fullName: v })} placeholder="Name on the bill" />
            </div>
            <Field label="Pincode" inputMode="numeric" maxLength={6} value={billingAddr.pincode} onChange={(v) => onBillingChange({ ...billingAddr, pincode: v.replace(/\D/g, '') })} placeholder="400001" />
            <Field label="City" value={billingAddr.city} onChange={(v) => onBillingChange({ ...billingAddr, city: v })} placeholder="Mumbai" />
            <StateFromPincode pincode={billingAddr.pincode} lenient />
            <div className="md:col-span-2">
              <Field label="Address" value={billingAddr.address} onChange={(v) => onBillingChange({ ...billingAddr, address: v })} placeholder="House number, street, area" />
            </div>
            <div className="md:col-span-2">
              <Field label="Landmark" optional value={billingAddr.landmark} onChange={(v) => onBillingChange({ ...billingAddr, landmark: v })} placeholder="Near gate 4" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StateFromPincode({ pincode, lenient }: { pincode: string; lenient?: boolean }) {
  const name = pincode.length === 6 ? resolvePincode(pincode).stateName : null;
  return (
    <div className="flex flex-col gap-2">
      <span className={ui.label}>State</span>
      <span className="border-b border-black/10 py-3 text-base md:text-sm">
        {pincode.length !== 6
          ? <span className="text-black/35">From your pincode</span>
          : name ?? (lenient
            ? <span className="text-black/35">Unrecognised pincode</span>
            : <span className="text-red-600">We cannot place this pincode yet</span>)}
      </span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', inputMode, maxLength, autoComplete, optional }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: number; autoComplete?: string; optional?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={ui.label}>
        {label}{optional && <span className="font-normal"> (optional)</span>}
      </label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        inputMode={inputMode} maxLength={maxLength} autoComplete={autoComplete}
        className={ui.input}
      />
    </div>
  );
}

function useCountdown(expiresAt: string | null, onExpire?: () => void) {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!expiresAt) { setSecondsLeft(null); return; }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) onExpire?.();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  return secondsLeft;
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// The hold. Every item is one of one, so while you pay nobody else can buy
// it: that protects you, and it is said as a plain sentence rather than a
// ticking banner, which read as pressure. It appears once there is a hold (the
// first press of the button takes it), and the clock only in the last minute,
// so the end of the hold is never a surprise.
function HoldNote({ secondsLeft, count }: { secondsLeft: number | null; count: number }) {
  if (secondsLeft === null) return null;
  const one = count === 1;
  if (secondsLeft > 60) {
    return (
      <p className="text-sm">
        {one ? 'This piece is' : 'These pieces are'} held for you while you pay. Nobody else can buy {one ? 'it' : 'them'}.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm font-bold">
      Your hold ends in <span className="tabular-nums">{formatCountdown(secondsLeft)}</span>. After that {one ? 'it goes' : 'they go'} back on sale.
    </p>
  );
}

// Why buying here is safe: three short notes under the order summary box,
// side information rather than part of the form, so no heading and no rules.
export function Assurances() {
  return (
    <dl className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-0.5">
        <dt className="font-bold">Checked before it ships</dt>
        <dd>Every piece comes to our hub and is checked against its listing first.</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="font-bold">Refunded in full</dt>
        <dd>If anything changes or your order is delayed, you get all of your money back.</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="font-bold">A person answers</dt>
        <dd>
          Not heard from us?{' '}
          <a href="https://wa.me/918505927538" target="_blank" rel="noreferrer" className={cn(ui.link, 'font-bold')}>WhatsApp 8505-ZARKET</a>.
        </dd>
      </div>
    </dl>
  );
}

// The end of the page: the hold once there is one, the total (on a phone,
// where the summary box is further down), and the one button. It opens
// Razorpay, which shows the amount again and takes the payment.
export function PlaceOrder({
  amount, itemCount, reservationExpiresAt, onExpire, onPlace, submitting, errorMsg,
}: {
  amount: number; itemCount: number;
  reservationExpiresAt: string | null; onExpire?: () => void;
  onPlace: () => void; submitting: boolean; errorMsg: string | null;
}) {
  const secondsLeft = useCountdown(reservationExpiresAt, onExpire);

  return (
    <section className="flex flex-col gap-4" aria-label="Payment">
      <HoldNote secondsLeft={secondsLeft} count={itemCount} />
      <div className="flex items-baseline justify-between border-t border-black/10 pt-4 lg:hidden">
        <span className="text-sm font-bold">Total</span>
        <span className="text-xl font-black tabular-nums">{formatCurrency(amount)}</span>
      </div>
      {errorMsg && <p className={ui.error}>{errorMsg}</p>}
      <button type="button" onClick={onPlace} disabled={submitting} className={cn(ui.btnPrimary, 'w-full py-5')}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Complete purchase
      </button>
      <p className="text-center text-sm">Pay by card, UPI, netbanking or wallet, securely through Razorpay.</p>
    </section>
  );
}

// The prices, and the total that is charged.
function Totals({ subtotal, shipping, shippingLoading, buyerProtection, total, selfShip }: {
  subtotal: number; shipping: number; shippingLoading: boolean; buyerProtection: number; total: number; selfShip: boolean;
}) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
      <dt>Item price</dt>
      <dd className="text-right tabular-nums">{formatCurrency(subtotal)}</dd>
      <dt>Shipping</dt>
      <dd className="text-right tabular-nums">
        {shippingLoading
          ? 'Calculating...'
          // Legacy rows only: some listings predate every item coming in to
          // our hub. The buyer pays nothing extra on these, but the buyer
          // never sees anything about where an item came from, so the line
          // states the outcome rather than the route.
          : selfShip ? 'Included'
          : shipping === 0 ? 'Free'
          : formatCurrency(shipping)}
      </dd>
      {buyerProtection > 0 && (
        <>
          <dt>
            <Link to="/buyer-protection" className={ui.link}>Buyer Protection</Link>
          </dt>
          <dd className="text-right tabular-nums">{formatCurrency(buyerProtection)}</dd>
        </>
      )}
      <div className="col-span-2 mt-3 flex items-baseline justify-between border-t border-black/10 pt-4">
        <dt className="font-bold">Total</dt>
        <dd className="text-xl font-black tabular-nums">{formatCurrency(total)}</dd>
      </div>
    </dl>
  );
}

export function Summary({ items, subtotal, shipping, shippingLoading, buyerProtection, total, selfShip }: {
  items: CartItem[]; subtotal: number; shipping: number; shippingLoading: boolean; buyerProtection: number; total: number;
  selfShip: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 border border-black/15 p-6 sm:p-8">
      <h2 className={ui.sectionTitle}>Order summary</h2>
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {items.map((i) => <li key={i.listing_id} className="border-t border-black/10 py-4 first:border-t-0 first:pt-0"><SummaryItem item={i} /></li>)}
      </ul>
      <Totals subtotal={subtotal} shipping={shipping} shippingLoading={shippingLoading} buyerProtection={buyerProtection} total={total} selfShip={selfShip} />
      <p className="text-sm">Your order is covered by <Link to="/buyer-protection" className={cn(ui.link, 'font-bold')}>Buyer Protection</Link>.</p>
    </div>
  );
}

/**
 * One line per item in either summary: the photo and name link back to the
 * item, and the product code is there to quote if the buyer writes to us.
 */
function SummaryItem({ item }: { item: CartItem }) {
  const href = itemPath({ sku: item.sku, id: item.listing_id, title: item.title, brand: item.brand });
  return (
    <div className="flex items-center gap-4">
      <Link to={href} className="h-20 w-[60px] shrink-0 overflow-hidden bg-zinc-100">
        {item.image_url && <img src={variantUrl(item.image_url, 'thumb')} alt={item.title} className="h-full w-full object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <Link to={href} className="font-bold leading-snug hover:underline underline-offset-4">{item.title}</Link>
        {item.sku && <span>{item.sku}</span>}
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums">{formatCurrency(item.sale_price ?? item.price ?? 0)}</span>
    </div>
  );
}
