import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function ShippingPolicy() {
  usePageMeta(META.shipping);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Shipping Policy</h1>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          {/* "Same-day dispatch" used to be the first and only number on this
              page. It is true, and it answers a question nobody asked: the clock
              it describes starts once an item is already in our hands, which on
              a one-of-one piece is most of the way through the journey. On its
              own it read as next-day delivery. The order of the page now matches
              the order things actually happen in. */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Shipped by zarketplace</h2>
            <p>Every order ships from our hub, in our packaging, under our name. We book and pay the courier. Your delivery cost is calculated from the item's shipping category and shown to you at checkout.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Why it is not next-day</h2>
            <p>Everything here is a single pre-owned piece that belonged to somebody before you. It is not sitting in a warehouse waiting, so an order does not simply get picked off a shelf.</p>
            <p>When you buy, we collect the item from the person who owned it, bring it in to our hub, check it against its listing and its photos, and repack it. Only then does it go out to you. That is the part that takes the time, and it is the part that means nothing reaches you unseen.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Once it is checked in, it goes out the same day</h2>
            <p>The moment an item passes our check and is accepted into inventory, it is packed and dispatched to you that day. You get an email with the courier and the tracking link at the same time.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Every order is tracked</h2>
            <p>Every order carries tracking, with a courier name and a tracking number or link. You can follow live shipping status on your My Orders page from the moment it leaves us, and we email you when it moves.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If something goes wrong on the way</h2>
            <p>If a parcel is delayed, damaged in transit or goes missing, that is ours to chase, not yours. Write to us with your order number and we deal with the courier. If an item arrives as the wrong item or materially different from its listing, tell us within 7 days of delivery and see our <Link to="/returns" className="font-bold text-black underline">Returns</Link> page.</p>
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
