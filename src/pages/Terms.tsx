import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function Terms() {
  usePageMeta(META.terms);

  return (
    <div className="mx-auto max-w-[64ch] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to zarketplace
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-12"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Terms of Service</h1>
        </div>

        <div className="flex flex-col gap-14 text-black body-longform">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What zarketplace Is</h2>
            <p>zarketplace buys pre-owned and one-of-one fashion from individuals and resells it under its own GST registration. When you buy from zarketplace you are buying from zarketplace: we are the seller of record for every listing, and every order is sold and shipped by us. When you sell to zarketplace you are selling us the item outright, for an amount agreed before the item is listed. These are two separate transactions.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your Account</h2>
            <p>You're responsible for the accuracy of the information on your account and for any activity that happens under it. Keep your login credentials secure.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Prohibited Items & Conduct</h2>
            <p>Counterfeit goods, stolen items and anything illegal to sell are prohibited, and we do not buy them. Fraud and abuse of our staff may result in your account being closed.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payments & Policies</h2>
            <p>All payments are processed securely through Razorpay. Shipping, vendor, and refund terms are governed by our <Link to="/shipping-policy" className="font-bold text-black underline">Shipping Policy</Link>, <Link to="/vendor-policy" className="font-bold text-black underline">Vendor Policy</Link>, and <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Disputes</h2>
            <p>If something goes wrong with an order, contact us first at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> so our support team can review it before any other action is taken.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Changes to These Terms</h2>
            <p>We may update these terms as the business changes. Continuing to use zarketplace after an update means you accept the revised version. An acquisition price you have already accepted is not affected by any later change.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
