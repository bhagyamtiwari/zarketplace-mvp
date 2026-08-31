import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function BuyerProtection() {
  useDocumentTitle('Buyer Protection');

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Buyer Protection</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">Every order is handled by us, start to finish</p>
        </div>

        <div className="flex flex-col gap-14 text-black body-copy">
          <p>zarketplace buys the items it sells. When you order, you are buying from one company with one address and one standard, not from whoever happened to list it. Every order is sold and shipped by zarketplace.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What we do before it reaches you</h2>
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li>Every item comes to our hub first, never straight to you</li>
              <li>We check it against its listing and its photos, and we check its condition</li>
              <li>Anything that does not match does not ship</li>
              <li>We repack it in our own packaging and send it out the same day</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What it costs</h2>
            <p>Nothing extra. Buyer Protection is part of what you pay for the item, shown at checkout with your delivery cost. There is no separate charge to opt into and nothing to add on.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If something is wrong</h2>
            <p>If your item arrives significantly not as described, or it is the wrong item, contact us within 48 hours of delivery with your order number and photos. You are dealing with us directly, and we resolve it directly. For how refunds are processed and when, see our <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
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
