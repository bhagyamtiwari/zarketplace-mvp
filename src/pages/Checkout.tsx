import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, ArrowLeft, CreditCard, Truck, ShieldCheck, CheckCircle2, Package, Lock } from 'lucide-react';
import { handleCashfreePayment, createCashfreeOrder } from '../lib/cashfree';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../components/AuthModal';
import { log } from '../lib/log';

const clog = log('checkout');

export function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [paymentMethod, setPaymentMethod] = React.useState<'online' | 'cod'>('online');
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [orderNumber, setOrderNumber] = React.useState('');
  const [isBillingSameAsShipping, setIsBillingSameAsShipping] = React.useState(true);
  const [isPaying, setIsPaying] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [showAuth, setShowAuth] = React.useState(false);

  const [shippingAddress, setShippingAddress] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    pincode: ''
  });

  const [billingAddress, setBillingAddress] = React.useState({
    fullName: '',
    address: '',
    city: '',
    pincode: ''
  });

  // Prefill from profile + saved default address whenever auth state settles.
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
    async function fetchListing() {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setListing(data);
      } catch (err) {
        console.error('Error fetching listing:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-black/20" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tighter">Listing not found</h1>
        <button onClick={() => navigate('/browse')} className="mt-8 text-xs font-bold uppercase tracking-widest underline">
          Back to marketplace
        </button>
      </div>
    );
  }

  const subtotal = listing.sale_price || listing.price;
  // Shipping is arranged directly between buyer and seller; we don't charge for it.
  const shipping = 0;
  const total = subtotal;

  const handleCheckout = async () => {
    clog('handleCheckout START', { paymentMethod, hasUser: !!user, listingId: listing?.id });
    if (paymentMethod === 'cod') { clog.warn('COD selected, ignoring'); return; }
    if (!user) { clog('no user, opening AuthModal'); setShowAuth(true); return; }
    setErrorMsg(null);

    // Basic validation
    const required: Array<[string, string]> = [
      ['fullName', shippingAddress.fullName],
      ['email', shippingAddress.email],
      ['phone', shippingAddress.phone],
      ['address', shippingAddress.address],
      ['city', shippingAddress.city],
      ['pincode', shippingAddress.pincode],
    ];
    const missing = required.filter(([, v]) => !v?.trim()).map(([k]) => k);
    if (missing.length) {
      setErrorMsg(`Please fill in: ${missing.join(', ')}`);
      return;
    }

    setIsPaying(true);
    const tCheckout = clog.time('full checkout');
    let tCheckoutEnded = false;
    const endCheckout = (extra: Record<string, unknown>) => { if (!tCheckoutEnded) { tCheckout.end(extra); tCheckoutEnded = true; } };
    try {
      // 1. Ask backend to create order + Cashfree session
      const tOrder = clog.time('createCashfreeOrder');
      const { order_number, payment_session_id } = await createCashfreeOrder({
        listing_id: listing!.id,
        buyer_id: user?.id,
        buyer: {
          name: shippingAddress.fullName,
          email: shippingAddress.email,
          phone: shippingAddress.phone,
          address: shippingAddress.address,
          city: shippingAddress.city,
          pincode: shippingAddress.pincode,
        },
        billing: isBillingSameAsShipping
          ? undefined
          : {
              name: billingAddress.fullName,
              email: shippingAddress.email,
              phone: shippingAddress.phone,
              address: billingAddress.address,
              city: billingAddress.city,
              pincode: billingAddress.pincode,
            },
      });
      tOrder.end({ order_number });

      setOrderNumber(order_number);

      // Persist this address as the buyer's default for next time.
      if (user) {
        await supabase.from('profiles').update({
          full_name: profile?.full_name || shippingAddress.fullName,
          phone: profile?.phone || shippingAddress.phone,
          default_address: {
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone,
            address: shippingAddress.address,
            city: shippingAddress.city,
            pincode: shippingAddress.pincode,
          },
        }).eq('id', user.id);
        await refreshProfile();
      }

      // 2. Open Cashfree modal (business name shown will be "Zivanta")
      const tPay = clog.time('cashfree modal');
      const result: any = await handleCashfreePayment(payment_session_id);
      tPay.end({ hasError: !!result?.error, hasPaymentDetails: !!result?.paymentDetails });

      // The SDK resolves with { error } on failure, { paymentDetails } on success,
      // or undefined when redirect mode. We poll our orders table to confirm.
      if (result?.error) {
        clog.warn('cashfree returned error', result.error);
        setErrorMsg(result.error.message || 'Payment was cancelled or failed.');
        setIsPaying(false);
        return;
      }

      // 3. Verify final state from our DB (webhook should have flipped to 'paid')
      // Poll up to ~10 seconds.
      const tPoll = clog.time('webhook poll');
      let confirmed = false;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: ord } = await supabase
          .from('orders')
          .select('status')
          .eq('order_number', order_number)
          .single();
        clog('poll attempt', { attempt: i + 1, status: ord?.status });
        if (ord?.status === 'paid' || ord?.status === 'shipped' || ord?.status === 'delivered') {
          confirmed = true;
          break;
        }
        if (ord?.status === 'cancelled') {
          tPoll.end({ confirmed: false, finalStatus: 'cancelled' });
          endCheckout({ outcome: 'cancelled' });
          setErrorMsg('Payment failed. Please try again.');
          setIsPaying(false);
          return;
        }
      }
      tPoll.end({ confirmed });
      endCheckout({ outcome: confirmed ? 'paid' : 'pending' });

      // Even if the webhook hasn't fired yet (sandbox can be slow), the SDK
      // returning without error means the user completed payment in the modal.
      // Show the success screen — the webhook will reconcile shortly.
      setIsSuccess(true);
      window.scrollTo(0, 0);
      if (!confirmed) {
        clog.warn('order not yet confirmed in DB; webhook will reconcile shortly');
      }
    } catch (error: any) {
      clog.error('handleCheckout THREW', error);
      endCheckout({ outcome: 'error' });
      setErrorMsg(error?.message || 'Payment failed. Please try again.');
    } finally {
      setIsPaying(false);
    }
  };

  if (isSuccess && listing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-32 text-center flex flex-col items-center gap-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="h-24 w-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4"
        >
          <CheckCircle2 className="h-12 w-12" />
        </motion.div>
        
        <div className="flex flex-col gap-4">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-600">Payment Confirmed</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Order Successful</h1>
          <p className="text-sm font-bold uppercase tracking-widest text-black/40">Order Number: {orderNumber}</p>
        </div>

        <div className="w-full bg-zinc-50 border border-black/5 p-10 flex flex-col gap-8 text-left mt-8">
          <div className="flex items-center gap-4 border-b border-black/5 pb-6">
            <Package className="h-5 w-5" />
            <h2 className="text-xs font-black uppercase tracking-widest">Order Summary</h2>
          </div>

          <div className="flex gap-6">
            <div className="h-24 w-18 bg-zinc-200 overflow-hidden border border-black/5">
              <img src={listing.image_url} alt={listing.title} className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col justify-center gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-black">{listing.brand}</span>
              <h3 className="text-xs font-bold uppercase tracking-widest">{listing.title}</h3>
              <span className="text-[10px] font-black uppercase tracking-widest">{listing.size}</span>
              <span className="text-xs font-black mt-2">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-6 border-t border-black/5">
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-black/40">Shipping To</h3>
              <div className="text-xs font-bold uppercase tracking-widest leading-relaxed">
                <p>{shippingAddress.fullName}</p>
                <p>{shippingAddress.address}</p>
                <p>{shippingAddress.city}, {shippingAddress.pincode}</p>
                <p>{shippingAddress.phone}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-black/40">Status</h3>
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Processing Order
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Link to="/browse" className="w-full bg-black py-6 text-[11px] font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-zinc-800 text-center">
            Continue Shopping
          </Link>
          <p className="text-[9px] font-bold uppercase tracking-widest text-black/30 leading-relaxed">
            A confirmation email has been sent to {shippingAddress.email}. The seller will be notified to ship your item.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <Link to={`/product/${listing.id}`} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Product
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
        {/* Checkout Form */}
        <div className="lg:col-span-7 flex flex-col gap-16">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-6 w-auto" referrerPolicy="no-referrer" />
              <span className="lowercase font-black tracking-tighter text-2xl">zarketplace</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Checkout</span>
            <h1 className="text-5xl font-black tracking-tighter uppercase">Finalize Order</h1>
          </div>

          <div className="flex flex-col gap-12">
            {/* Shipping Info */}
            <section className="flex flex-col gap-8">
              <h2 className="text-xs font-black uppercase tracking-widest border-b border-black pb-4">Shipping Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black">Full Name</label>
                  <input 
                    type="text" 
                    value={shippingAddress.fullName}
                    onChange={(e) => setShippingAddress({...shippingAddress, fullName: e.target.value})}
                    className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                    placeholder="John Doe" 
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black">Email Address</label>
                  <input 
                    type="email" 
                    value={shippingAddress.email}
                    onChange={(e) => setShippingAddress({...shippingAddress, email: e.target.value})}
                    className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                    placeholder="hello@example.com" 
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black">Phone Number</label>
                  <input 
                    type="tel" 
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({...shippingAddress, phone: e.target.value})}
                    className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                    placeholder="+91 98765 43210" 
                  />
                </div>
                <div className="md:col-span-2 flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black">Address</label>
                  <input 
                    type="text" 
                    value={shippingAddress.address}
                    onChange={(e) => setShippingAddress({...shippingAddress, address: e.target.value})}
                    className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                    placeholder="House No, Street, Area" 
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black">City</label>
                  <input 
                    type="text" 
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({...shippingAddress, city: e.target.value})}
                    className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                    placeholder="Mumbai" 
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black">Pincode</label>
                  <input 
                    type="text" 
                    value={shippingAddress.pincode}
                    onChange={(e) => setShippingAddress({...shippingAddress, pincode: e.target.value})}
                    className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                    placeholder="400001" 
                  />
                </div>
              </div>
            </section>

            {/* Billing Info Toggle */}
            <section className="flex flex-col gap-8">
              <div className="flex items-center justify-between border-b border-black pb-4">
                <h2 className="text-xs font-black uppercase tracking-widest">Billing Information</h2>
                <button 
                  onClick={() => setIsBillingSameAsShipping(!isBillingSameAsShipping)}
                  className="flex items-center gap-3 group"
                >
                  <div className={cn(
                    "h-4 w-4 border border-black flex items-center justify-center transition-all",
                    isBillingSameAsShipping ? "bg-black" : "bg-transparent"
                  )}>
                    {isBillingSameAsShipping && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-black/60 group-hover:text-black transition-colors">Same as shipping</span>
                </button>
              </div>

              {!isBillingSameAsShipping && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden"
                >
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-black">Full Name</label>
                    <input 
                      type="text" 
                      value={billingAddress.fullName}
                      onChange={(e) => setBillingAddress({...billingAddress, fullName: e.target.value})}
                      className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                      placeholder="John Doe" 
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-black">Address</label>
                    <input 
                      type="text" 
                      value={billingAddress.address}
                      onChange={(e) => setBillingAddress({...billingAddress, address: e.target.value})}
                      className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                      placeholder="House No, Street, Area" 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-black">City</label>
                    <input 
                      type="text" 
                      value={billingAddress.city}
                      onChange={(e) => setBillingAddress({...billingAddress, city: e.target.value})}
                      className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                      placeholder="Mumbai" 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-black">Pincode</label>
                    <input 
                      type="text" 
                      value={billingAddress.pincode}
                      onChange={(e) => setBillingAddress({...billingAddress, pincode: e.target.value})}
                      className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" 
                      placeholder="400001" 
                    />
                  </div>
                </motion.div>
              )}
            </section>

            {/* Payment Method */}
            <section className="flex flex-col gap-8">
              <h2 className="text-xs font-black uppercase tracking-widest border-b border-black pb-4">Payment Method</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button 
                  onClick={() => setPaymentMethod('online')}
                  className={cn(
                    "flex flex-col gap-4 p-6 border transition-all text-left",
                    paymentMethod === 'online' ? "border-black bg-black text-white" : "border-black/5 bg-zinc-50 hover:border-black/20"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <CreditCard className="h-5 w-5" />
                    <div className="flex gap-2">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Cashfree</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest">Online Payment</span>
                    <span className="text-[9px] opacity-60">UPI, Cards, Netbanking</span>
                  </div>
                </button>

                <div 
                  className="flex flex-col gap-4 p-6 border border-black/5 bg-zinc-100/50 text-black/30 cursor-not-allowed text-left relative overflow-hidden"
                >
                  <div className="absolute top-2 right-2 bg-black/5 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest">Unavailable</div>
                  <Truck className="h-5 w-5 opacity-20" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest">Cash on Delivery</span>
                    <span className="text-[9px]">Currently disabled</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-5">
          <div className="sticky top-32 flex flex-col gap-10 p-10 bg-zinc-50 border border-black/5">
            <h2 className="text-xs font-black uppercase tracking-widest">Order Summary</h2>
            
            <div className="flex gap-6">
              <div className="h-24 w-18 bg-zinc-200 overflow-hidden border border-black/5">
                <img src={listing.image_url} alt={listing.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col justify-center gap-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-black">{listing.brand}</span>
                <h3 className="text-xs font-bold uppercase tracking-widest">{listing.title}</h3>
                <span className="text-[10px] font-black uppercase tracking-widest">{listing.size}</span>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-y border-black/5 py-8">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-black">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-black">Shipping</span>
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

            {errorMsg && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 -mb-4">{errorMsg}</p>
            )}
            <button 
              onClick={handleCheckout}
              disabled={paymentMethod === 'cod' || isPaying}
              className={cn(
                "w-full py-6 text-xs font-black uppercase tracking-[0.4em] transition-all active:scale-[0.98] flex items-center justify-center gap-3",
                (paymentMethod === 'cod' || isPaying) ? "bg-zinc-200 text-black/20 cursor-not-allowed" : "bg-black text-white hover:bg-zinc-800"
              )}
            >
              {isPaying && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{isPaying ? 'Opening Payment...' : paymentMethod === 'online' ? 'Place Order' : 'Select Online Payment'}</span>
            </button>

            <div className="flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-black/30">
              <ShieldCheck className="h-4 w-4" />
              <span>Secure Transaction</span>
            </div>
          </div>
        </div>
      </div>
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} message="Sign in to complete your purchase." />
    </div>
  );
}
