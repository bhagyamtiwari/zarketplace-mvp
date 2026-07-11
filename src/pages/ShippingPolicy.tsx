import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function ShippingPolicy() {
  useDocumentTitle('Shipping Policy');

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-12"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-black tracking-tighter uppercase">Shipping Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">How shipping works on zarketplace</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Buyer-Paid, Platform-Arranged Shipping</h2>
            <p>Buyers pay shipping at checkout, calculated from the item's shipping category. Sellers never book or pay for a courier themselves. zarketplace arranges the label so the seller only has to pack the item and hand it off for pickup.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">72-Hour Handoff Window</h2>
            <p>Once an item sells, the seller has 72 hours to pack it and hand it off for pickup. This keeps the marketplace fast and predictable for buyers.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Every Order Is Tracked</h2>
            <p>Every order carries tracking (courier and tracking number or link). Once an item is on its way, buyers receive an email and can follow live shipping status and the tracking link directly on their My Orders page.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Need help?</h2>
            <p>Reach out any time at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
