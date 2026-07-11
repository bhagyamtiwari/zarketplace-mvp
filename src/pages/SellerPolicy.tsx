import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function SellerPolicy() {
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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Seller Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">What's expected of every seller on zarketplace</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Accurate Descriptions</h2>
            <p>Listings must accurately reflect the item's condition, size, measurements, and any flaws. Misrepresenting an item is grounds for removal from the platform.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Authentic Products Only</h2>
            <p>Only authentic, genuine items may be listed. Counterfeit or replica items are strictly prohibited and will be removed on discovery.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Pack and Hand Off for Pickup</h2>
            <p>When your item sells, pack it well and hand it off for pickup within 72 hours. Buyers pay shipping at checkout and zarketplace arranges the label, so you never book or pay for a courier yourself.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payout Timing</h2>
            <p>Your payout is released after the item is delivered and the buyer's 48-hour review window closes with no open claim. It reflects 100% of your asking price. There are no selling fees.</p>
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
