// Checkout via Razorpay. Payment status is never set by this page — only the
// razorpay-webhook edge function (verified server-side) ever writes
// orders.status = 'paid' / 'payment_failed'. This page only:
//   1. Address - collect shipping. Creates one order row per cart item.
//   2. Pay - asks create-razorpay-order for a Razorpay order, opens
//      Razorpay Checkout, then polls the order rows until the webhook has
//      flipped their status (or the buyer cancels/it fails).
//   3. Success / Failed.

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { CartItem, Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, ArrowLeft, ShieldCheck, CheckCircle2, XCircle, Package } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { RequireAuth } from '../components/RequireAuth';
import { LaunchOfferBanner } from '../components/LaunchOfferBanner';
import { log } from '../lib/log';

const clog = log('checkout');
const RESUME_KEY = 'zk_checkout_v3';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

type Step = 'address' | 'pay' | 'confirming' | 'success' | 'failed';

interface ResumeState {
  step: Step;
  order_numbers: string[];
  amount: number;
}

function snapshotFromListing(l: Listing): CartItem {
  return {
    listing_id: l.id, sku: l.sku, added_at: new Date().toISOString(),
    title: l.title, brand: l.brand, price: l.price, sale_price: l.sale_price,
    image_url: l.image_url, size: l.size,
    seller_id: l.seller_id, seller_email: l.seller_email,
    seller_upi_vpa: l.seller_upi_vpa, seller_display_name: l.seller_display_name,
    shipping_mode: l.shipping_mode, shipping_cost: l.shipping_cost,
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
        const { data, error } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
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

  const [step, setStep] = React.useState<Step>('address');
  const [orderNumbers, setOrderNumbers] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [shippingAddress, setShippingAddress] = React.useState({
    fullName: '', email: '', phone: '', address: '', city: '', pincode: '',
  });

  React.useEffect(() => {
    if (!user) return;
    const addr = (profile?.default_address ?? {}) as Record<string, string>;
    setShippingAddress((prev) => ({
      fullName: prev.fullName || profile?.full_name || addr.fullName || '',
      email: user.email ?? prev.email,
      phone: prev.phone || profile?.phone || addr.phone || '',
      address: prev.address || addr.address || '',
      city: prev.city || addr.city || '',
      pincode: prev.pincode || addr.pincode || '',
    }));
  }, [user, profile]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const r = JSON.parse(raw) as ResumeState;
      if (r?.order_numbers?.length && ['pay', 'confirming', 'failed'].includes(r.step)) {
        setOrderNumbers(r.order_numbers);
        setStep(r.step);
      }
    } catch {}
  }, []);

  const subtotal = items.reduce((s, i) => s + (i.sale_price ?? i.price ?? 0), 0);
  const shipping = items.reduce((s, i) => s + (i.shipping_mode === 'paid' ? (i.shipping_cost || 0) : 0), 0);
  const total = subtotal + shipping;

  const persistResume = (state: Partial<ResumeState>) => {
    try {
      const merged: ResumeState = {
        step, order_numbers: orderNumbers, amount: total, ...state,
      };
      localStorage.setItem(RESUME_KEY, JSON.stringify(merged));
    } catch {}
  };
  const clearResume = () => { try { localStorage.removeItem(RESUME_KEY); } catch {} };

  const submitAddress = async () => {
    setErrorMsg(null);
    if (!user) return;
    if (items.length === 0) { setErrorMsg('Your cart is empty.'); return; }
    const required: Array<[string, string]> = [
      ['fullName', shippingAddress.fullName], ['email', shippingAddress.email],
      ['phone', shippingAddress.phone], ['address', shippingAddress.address],
      ['city', shippingAddress.city], ['pincode', shippingAddress.pincode],
    ];
    const missing = required.filter(([, v]) => !v?.trim()).map(([k]) => k);
    if (missing.length) { setErrorMsg(`Please fill in: ${missing.join(', ')}`); return; }

    setSubmitting(true);
    try {
      await supabase.from('profiles').update({
        full_name: profile?.full_name || shippingAddress.fullName,
        phone: profile?.phone || shippingAddress.phone,
        default_address: shippingAddress,
      }).eq('id', user.id);
      await refreshProfile();

      const rows = items.map((i) => {
        const itemPrice = Number(i.sale_price ?? i.price ?? 0);
        const itemShip = i.shipping_mode === 'paid' ? Number(i.shipping_cost || 0) : 0;
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
          seller_email: (i.seller_email ?? '').toLowerCase() || null,
          seller_upi_vpa_snapshot: i.seller_upi_vpa ?? null,
          shipping_address: shippingAddress as unknown as Record<string, string>,
          billing_address: shippingAddress as unknown as Record<string, string>,
          amount: itemPrice,
          shipping_cost: itemShip,
          total_amount: itemPrice + itemShip,
          status: 'awaiting_payment',
        };
      });

      const { data, error } = await supabase.from('orders').insert(rows).select('order_number');
      if (error) throw error;
      const nums = (data ?? []).map((r: { order_number: string }) => r.order_number);

      setOrderNumbers(nums);
      setStep('pay');
      persistResume({ step: 'pay', order_numbers: nums });
    } catch (err: any) {
      clog.error('createOrders failed', err);
      setErrorMsg(err?.message || 'Failed to create order.');
    } finally {
      setSubmitting(false);
    }
  };

  // Polls the order rows until razorpay-webhook has flipped their status.
  // The webhook is the only thing that ever writes 'paid'/'payment_failed' —
  // this never trusts Razorpay Checkout's client-side success callback on
  // its own.
  const waitForConfirmation = React.useCallback(async () => {
    const POLL_INTERVAL_MS = 2000;
    const POLL_MAX_ATTEMPTS = 30; // ~60s
    let result: 'paid' | 'payment_failed' | 'timeout' = 'timeout';
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const { data } = await supabase.from('orders').select('status').in('order_number', orderNumbers);
      const statuses = (data ?? []).map((r: { status: string }) => r.status);
      if (statuses.length > 0 && statuses.every((s) => s === 'paid')) { result = 'paid'; break; }
      if (statuses.some((s) => s === 'payment_failed')) { result = 'payment_failed'; break; }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (result === 'paid') {
      setStep('success');
      clearResume();
      if (!id) await cart.clear();
    } else if (result === 'payment_failed') {
      setErrorMsg('Payment failed. You can try again.');
      setStep('failed');
      persistResume({ step: 'failed' });
    } else {
      setErrorMsg('Still confirming your payment with the bank. Check My Orders in a minute, or try again.');
      setStep('failed');
      persistResume({ step: 'failed' });
    }
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumbers, id]);

  React.useEffect(() => {
    if (step === 'confirming') void waitForConfirmation();
  }, [step, waitForConfirmation]);

  const startPayment = async (buyerNote: string) => {
    setErrorMsg(null);
    if (!user) return;
    setSubmitting(true);
    try {
      if (buyerNote.trim()) {
        await supabase.from('orders').update({ buyer_note: buyerNote.trim() }).in('order_number', orderNumbers);
      }

      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: { order_numbers: orderNumbers },
      });
      if (error) throw error;
      const { razorpay_order_id, amount, currency, key_id } = data as {
        razorpay_order_id: string; amount: number; currency: string; key_id: string;
      };

      const rzp = new window.Razorpay({
        key: key_id,
        amount,
        currency,
        order_id: razorpay_order_id,
        name: 'zarketplace',
        description: `Order ${orderNumbers.join(', ')}`,
        prefill: {
          name: shippingAddress.fullName,
          email: shippingAddress.email,
          contact: shippingAddress.phone,
        },
        notes: { order_numbers: orderNumbers.join(',') },
        handler: () => {
          // Razorpay says the payment went through, but we don't trust that
          // claim on its own — move to a waiting screen until the webhook
          // (server-verified) confirms it.
          setStep('confirming');
          persistResume({ step: 'confirming' });
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            setErrorMsg('Payment was not completed. You can try again.');
          },
        },
      });
      rzp.on('payment.failed', () => {
        setSubmitting(false);
        setErrorMsg('Payment failed. You can try again.');
      });
      rzp.open();
    } catch (err: any) {
      clog.error('startPayment failed', err);
      setErrorMsg(err?.message || 'Failed to start payment.');
      setSubmitting(false);
    }
  };

  if (loadingBuyNow) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black/20" />
      </div>
    );
  }

  if (items.length === 0 && step === 'address') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center flex flex-col items-center gap-8">
        <h1 className="text-5xl font-black tracking-tighter uppercase">Nothing to check out</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 max-w-md">
          Your cart is empty.
        </p>
        <Link to="/browse" className="bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800">
          Browse
        </Link>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-32 text-center flex flex-col items-center gap-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="h-24 w-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="h-12 w-12" />
        </motion.div>
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-600">Payment confirmed</span>
        <h1 className="text-5xl font-black tracking-tighter uppercase">Your order has been confirmed</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-black/40">
          Order{orderNumbers.length > 1 ? 's' : ''}: {orderNumbers.join(', ')}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 max-w-md leading-relaxed">
          Your payment has been received. The seller has been notified to ship your item. Track everything in My Orders.
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 max-w-md leading-relaxed">
          For any questions or concerns, email{' '}
          <a href="mailto:contact@zarketplace.com" className="text-black underline">contact@zarketplace.com</a>.
        </p>
        <div className="flex gap-3">
          <Link to="/browse" className="bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800">Continue Shopping</Link>
          <Link to="/track-order" className="border border-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-black hover:bg-black hover:text-white">My Orders</Link>
        </div>
      </div>
    );
  }

  if (step === 'confirming') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-32 text-center flex flex-col items-center gap-8">
        <Loader2 className="h-16 w-16 animate-spin text-black/20" />
        <h1 className="text-3xl font-black tracking-tighter uppercase">Confirming your payment…</h1>
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 max-w-md leading-relaxed">
          This usually takes a few seconds. Please don't close this tab.
        </p>
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-32 text-center flex flex-col items-center gap-8">
        <div className="h-24 w-24 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
          <XCircle className="h-12 w-12" />
        </div>
        <h1 className="text-4xl font-black tracking-tighter uppercase">Payment not confirmed</h1>
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 max-w-md leading-relaxed">
          {errorMsg || 'We could not confirm your payment. No charge was completed for a failed attempt.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setErrorMsg(null); setStep('pay'); persistResume({ step: 'pay' }); }}
            className="bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800"
          >
            Try Again
          </button>
          <Link to="/track-order" className="border border-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-black hover:bg-black hover:text-white">My Orders</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <Link to={id ? `/product/${id}` : '/cart'} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      <StepHeader step={step} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 mt-12">
        <div className="lg:col-span-7 flex flex-col gap-10">
          {step === 'address' && (
            <AddressStep addr={shippingAddress} onChange={setShippingAddress}
              onSubmit={submitAddress} submitting={submitting} errorMsg={errorMsg} />
          )}
          {step === 'pay' && (
            <RazorpayPayStep
              amount={total}
              onPay={startPayment} submitting={submitting} errorMsg={errorMsg}
            />
          )}
        </div>

        <div className="lg:col-span-5">
          <Summary items={items} subtotal={subtotal} shipping={shipping} total={total} />
        </div>
      </div>
    </div>
  );
}

function StepHeader({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'address', label: '1 · Address' },
    { key: 'pay', label: '2 · Payment' },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <img src="/images/zarketplace-tp.png" alt="zarketplace" className="h-6 w-auto" referrerPolicy="no-referrer" />
        <span className="lowercase font-black tracking-tighter text-2xl">zarketplace</span>
      </div>
      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Checkout</span>
      <h1 className="text-5xl font-black tracking-tighter uppercase">Finalize Order</h1>
      <div className="flex gap-3 mt-4">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-3">
            <div className={cn(
              'px-4 py-2 text-[10px] font-black uppercase tracking-widest border',
              i < idx ? 'bg-emerald-50 border-emerald-600 text-emerald-700' :
              i === idx ? 'bg-black border-black text-white' :
              'border-black/10 text-black/40',
            )}>
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="h-px w-6 bg-black/20" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddressStep({
  addr, onChange, onSubmit, submitting, errorMsg,
}: {
  addr: { fullName: string; email: string; phone: string; address: string; city: string; pincode: string };
  onChange: (a: typeof addr) => void;
  onSubmit: () => void;
  submitting: boolean;
  errorMsg: string | null;
}) {
  return (
    <section className="flex flex-col gap-8">
      <h2 className="text-xs font-black uppercase tracking-widest border-b border-black pb-4">Shipping Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="Full Name" value={addr.fullName} onChange={(v) => onChange({ ...addr, fullName: v })} placeholder="John Doe" />
        <Field label="Email Address" type="email" value={addr.email} onChange={(v) => onChange({ ...addr, email: v })} placeholder="hello@example.com" />
        <Field label="Phone Number" type="tel" value={addr.phone} onChange={(v) => onChange({ ...addr, phone: v })} placeholder="+91 98765 43210" />
        <Field label="Pincode" value={addr.pincode} onChange={(v) => onChange({ ...addr, pincode: v })} placeholder="400001" />
        <div className="md:col-span-2">
          <Field label="Address" value={addr.address} onChange={(v) => onChange({ ...addr, address: v })} placeholder="House No, Street, Area" />
        </div>
        <div className="md:col-span-2">
          <Field label="City" value={addr.city} onChange={(v) => onChange({ ...addr, city: v })} placeholder="Mumbai" />
        </div>
      </div>
      {errorMsg && <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{errorMsg}</p>}
      <button type="button" onClick={onSubmit} disabled={submitting}
        className="w-full bg-black py-6 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-3">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        <span>Continue to Payment</span>
      </button>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[9px] font-black uppercase tracking-widest text-black">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" />
    </div>
  );
}

function RazorpayPayStep({
  amount, onPay, submitting, errorMsg,
}: {
  amount: number; onPay: (note: string) => void; submitting: boolean; errorMsg: string | null;
}) {
  const [note, setNote] = React.useState('');

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2 border-b border-black pb-4">
        <h2 className="text-xs font-black uppercase tracking-widest">Complete Payment</h2>
        <p className="text-[11px] text-black/60 font-medium leading-relaxed">
          Pay {formatCurrency(amount)} securely via Razorpay — cards, UPI, netbanking and wallets all supported.
        </p>
        <div className="mt-2"><LaunchOfferBanner variant="inline" /></div>
      </div>

      <div className="bg-zinc-50 border border-black/5 p-6 flex flex-col items-center gap-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-black/40">Amount Due</p>
        <p className="text-4xl font-black tracking-tighter">{formatCurrency(amount)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="buyer-note" className="text-[9px] font-black uppercase tracking-widest text-black/40">
          Any comments or specific requests for the seller? (optional)
        </label>
        <textarea
          id="buyer-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="e.g. please pack securely, deliver after 6pm…"
          className="w-full border border-black/10 bg-white p-3 text-sm font-medium leading-relaxed focus:border-black focus:outline-none transition-all resize-y"
        />
        <p className="text-[10px] font-medium text-black/40 leading-relaxed">
          Please note: the seller may or may not be able to fulfill all requests or concerns — that's up to them.
        </p>
      </div>

      {errorMsg && <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{errorMsg}</p>}

      <button type="button" onClick={() => onPay(note)}
        disabled={submitting}
        className="w-full bg-black py-5 text-xs font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 disabled:opacity-30 flex items-center justify-center gap-3">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        <span>Pay {formatCurrency(amount)}</span>
      </button>
      <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-black/30">
        <ShieldCheck className="h-4 w-4" />
        <span>Payments secured by Razorpay</span>
      </div>
    </section>
  );
}

function Summary({ items, subtotal, shipping, total }: {
  items: CartItem[]; subtotal: number; shipping: number; total: number;
}) {
  return (
    <div className="sticky top-32 flex flex-col gap-8 p-10 bg-zinc-50 border border-black/5">
      <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
        <Package className="h-4 w-4" /> Order Summary
      </h2>
      <LaunchOfferBanner variant="badge" className="self-start" />

      <div className="flex flex-col gap-4 max-h-72 overflow-y-auto">
        {items.map((i) => (
          <div key={i.listing_id} className="flex gap-4">
            <div className="h-20 w-16 bg-zinc-200 overflow-hidden border border-black/5 flex-shrink-0">
              {i.image_url && <img src={i.image_url} alt={i.title} className="h-full w-full object-cover" />}
            </div>
            <div className="flex flex-col justify-center gap-0.5 min-w-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-black/60">{i.brand}</span>
              <span className="text-xs font-bold uppercase tracking-widest truncate">{i.title}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-black/60">Size {i.size}</span>
              <span className="text-xs font-black mt-1">{formatCurrency(i.sale_price ?? i.price ?? 0)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-y border-black/5 py-6">
        <Row label="Subtotal" value={formatCurrency(subtotal)} />
        <Row label="Shipping" value={shipping > 0 ? formatCurrency(shipping) : 'Free'} />
        <Row label="Platform fee" value="₹0" />
      </div>

      <div className="flex justify-between items-end">
        <span className="text-xs font-black uppercase tracking-widest">Total</span>
        <span className="text-3xl font-black tracking-tighter">{formatCurrency(total)}</span>
      </div>

      <div className="flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-black/30">
        <ShieldCheck className="h-4 w-4" />
        <span>Secure UPI payment</span>
      </div>
    </div>
  );
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className={cn('flex justify-between text-xs font-bold uppercase tracking-widest', dim && 'text-black/40 text-[10px]')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
