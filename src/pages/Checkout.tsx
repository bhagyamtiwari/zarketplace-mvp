import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Loader2, ArrowLeft, CreditCard, Truck, ShieldCheck, CheckCircle2, Package } from 'lucide-react';
import { handleCashfreePayment } from '../lib/cashfree';

export function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [paymentMethod, setPaymentMethod] = React.useState<'online' | 'cod'>('online');
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [orderNumber, setOrderNumber] = React.useState('');
  const [isBillingSameAsShipping, setIsBillingSameAsShipping] = React.useState(true);

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
  const shipping = listing.shipping_cost || 0;
  const total = subtotal + shipping;

  const handleCheckout = async () => {
    if (paymentMethod === 'cod') {
      return; // Should not happen as button is disabled or logic prevents it
    }

    if (!shippingAddress.fullName || !shippingAddress.email || !shippingAddress.address) {
      alert("Please fill in all required shipping details.");
      return;
    }

    // Generate a random order number for demo
    const newOrderNumber = `ZKT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    setOrderNumber(newOrderNumber);

    try {
      // In a real app, you would call your backend to create a Cashfree order session
      // const response = await fetch('/api/create-cashfree-session', { ... });
      // const { payment_session_id } = await response.json();
      
      // For demo purposes, we'll simulate the Cashfree popup
      console.log("Initiating Cashfree Payment...");
      
      // Simulating a successful payment flow
      // In reality, you'd call handleCashfreePayment(payment_session_id)
      // and handle the callback/redirect
      
      setIsSuccess(true);
      window.scrollTo(0, 0);
      
      // Simulate sending emails
      console.log(`Email sent to customer: ${shippingAddress.email} with order ${newOrderNumber}`);
      console.log(`Order summary sent to seller for item: ${listing.title}`);
      
    } catch (error) {
      console.error("Payment failed:", error);
      alert("Payment failed. Please try again.");
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

            <button 
              onClick={handleCheckout}
              disabled={paymentMethod === 'cod'}
              className={cn(
                "w-full py-6 text-xs font-black uppercase tracking-[0.4em] transition-all active:scale-[0.98]",
                paymentMethod === 'cod' ? "bg-zinc-200 text-black/20 cursor-not-allowed" : "bg-black text-white hover:bg-zinc-800"
              )}
            >
              {paymentMethod === 'online' ? 'Place Order' : 'Select Online Payment'}
            </button>

            <div className="flex items-center justify-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-black/30">
              <ShieldCheck className="h-4 w-4" />
              <span>Secure Transaction</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
