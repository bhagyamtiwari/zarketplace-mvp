import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function ShippingPolicy() {
  useDocumentTitle('Shipping Policy');

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to zarketplace
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

        <div className="flex flex-col gap-10 text-black body-copy">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Who Pays, And Who Ships</h2>
            <p>Shipping is calculated from the item's shipping category. The seller picks one of three options when they list an item.</p>
            <p><strong>Buyer pays shipping.</strong> The buyer pays the shipping charge at checkout. zarketplace books and pays the courier, and the seller keeps their full asking price.</p>
            <p><strong>Free shipping, arranged by us.</strong> The buyer pays nothing for shipping. zarketplace books and pays the courier, and that cost is deducted from the seller's payout.</p>
            <p><strong>Free shipping, shipped by the seller.</strong> The buyer pays nothing for shipping. The seller books and pays for their own courier and keeps their full asking price. Before their payout is released they must give us the courier name, the tracking number, and a photo of the packed parcel with the shipping label visible.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">72-Hour Handoff Window</h2>
            <p>Once an item sells, the seller has 72 hours to pack it and hand it off, whether that means handing it to our courier at pickup or posting it themselves. This keeps the marketplace fast and predictable for buyers.</p>
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
