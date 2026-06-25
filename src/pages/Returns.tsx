import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function Returns() {
  useDocumentTitle('Returns');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Returns</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">The process for sending an item back, and for cancelling before it ships</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <p>Since most items sold on zarketplace are pre-owned, one-of-a-kind pieces, there is generally no physical return process: returns are not accepted simply because of a change of mind.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Cancelling Before Shipment</h2>
            <p>If you need to cancel an order, use the "Request Cancellation" option on your order page, or email us with your order number. This is only possible before the seller marks the item as shipped. Once an item has shipped, cancellation is no longer possible and the order proceeds as a normal delivery.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If You Need to Send an Item Back</h2>
            <p>Review all photos, descriptions, and measurements carefully before buying. If you have questions about an item, contact the seller directly via the information on the product page.</p>
            <p>If your item arrives as the wrong item, or materially different from how it was listed, email us at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> within 48 hours of delivery with your order number and photos. Our support team will tell you whether to ship the item back, and where, before any refund is processed. Do not return an item before we've confirmed the return is approved.</p>
            <p>For what happens to your money once a return is approved, see our <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Final Sale Items</h2>
            <p>Items marked as Final Sale, as well as underwear, swimwear, personal-use items, and digital products, are not eligible for return or cancellation.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Reporting a Seller</h2>
            <p>If you wish to report a seller for fraudulent activity or poor behavior, reach out to us immediately at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>. We take the integrity of our community seriously.</p>
          </section>
        </div>

        <div className="mt-12 pt-12 border-t border-black/5">
          <Link to="/conditions-guide" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1">
            View Conditions Guide <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
