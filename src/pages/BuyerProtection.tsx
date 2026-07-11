import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { InfoPageNav } from '../components/InfoPageNav';

export function BuyerProtection() {
  useDocumentTitle('Buyer Protection');

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black hover:text-black/80 mb-8 lg:mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
        <InfoPageNav />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-12 flex-1 min-w-0"
        >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Buyer Protection</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">Every order is protected, so buying from a stranger feels as safe as buying from a store</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <p>Buyer Protection is added to every purchase at checkout, shown as its own line so you always know what you are paying for. It is what lets you buy from an individual seller without the risks of a DM sale.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What it covers</h2>
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li>Your payment is held securely by zarketplace, not sent straight to the seller</li>
              <li>The seller is only paid after your item is delivered and a 48-hour review window has passed</li>
              <li>A refund if your item does not arrive, or arrives significantly not as described</li>
              <li>Support that reviews your claim before any money moves</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What it costs</h2>
            <p>The Buyer Protection fee is 5% of the item price, with a minimum of Rs. 49. It is always shown separately at checkout, never hidden inside the item price or shipping.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How your payment is held</h2>
            <p>When you pay, your money goes into escrow. It stays there through pickup, transit, and delivery. Once the item is delivered you have 48 hours to check it and raise a problem. If you do not, or once any issue is resolved in the seller's favour, the seller is paid. Until then, your money is safe.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If something is wrong</h2>
            <p>If your item is significantly not as described, or the wrong item, contact us within 48 hours of delivery with your order number and photos. For how refunds are processed and when, see our <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Need help?</h2>
            <p>Reach out any time at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>.</p>
          </section>
        </div>
        </motion.div>
      </div>
    </div>
  );
}
