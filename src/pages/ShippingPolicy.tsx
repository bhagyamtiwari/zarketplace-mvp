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
        className="flex flex-col gap-14"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Shipping Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">How your order reaches you</p>
        </div>

        <div className="flex flex-col gap-14 text-black body-copy">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Shipped by zarketplace</h2>
            <p>Every order ships from our hub, in our packaging, under our name. We book and pay the courier. Your delivery cost is calculated from the item's shipping category and shown to you at checkout.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Two journeys, not one</h2>
            <p>An item travels twice: from the person who sold it to us, in to our hub, and from our hub out to you. You only ever see the second journey. By the time an item is on its way to you, we have already received it and checked it.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Same-day dispatch</h2>
            <p>Once we have accepted an item into our inventory, it goes out to you the same day.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Every order is tracked</h2>
            <p>Every order carries tracking (courier and tracking number or link). Once your order is on its way, you receive an email and can follow live shipping status and the tracking link directly on your My Orders page.</p>
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
