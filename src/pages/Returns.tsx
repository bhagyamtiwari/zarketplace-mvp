import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

export function Returns() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-12"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-2">
            <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-6 w-auto" referrerPolicy="no-referrer" />
            <span className="lowercase font-black tracking-tighter text-2xl">zarketplace</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Policy</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Returns & Cancellations</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">What you need to know before you buy or cancel</p>
        </div>

        <div className="prose prose-zinc max-w-none flex flex-col gap-10 text-black leading-relaxed">
          <p>At zarketplace, we prioritize transparency, trust, and sustainability.</p>
          <p>Since most items sold on our platform are pre-owned, one-of-a-kind pieces, our return and cancellation policies are designed to protect both buyers and sellers while keeping things fair.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Returns</h2>
            <p>On zarketplace, you are buying from individual sellers across India. Because of the unique, one-of-a-kind nature of pre-owned fashion, returns are generally not accepted.</p>
            <p>We encourage you to review all photos, descriptions, and measurements carefully before making a purchase. If you have questions about an item, you can reach out to the seller directly via the contact information provided on the product page.</p>
            <p>However, we will intervene if you received the wrong item or if the item is significantly not as described (e.g., undisclosed major damage). In such cases, please contact us at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> within 48 hours of delivery.</p>
            <p>If you wish to report a seller for fraudulent activity or poor behavior, please reach out to us immediately. We take the integrity of our community seriously.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Cancellations</h2>
            <p>Orders can be canceled only before the item is marked as shipped. To cancel an order, use the "Request Cancellation" option on your order page or email us directly with your order number. Once an item has shipped, cancellations are no longer possible.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Final Sale Items</h2>
            <p>Items marked as Final Sale, as well as underwear, swimwear, personal-use items, and digital products, are not eligible for return or cancellation.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Need help?</h2>
            <p>We’re here for you. Reach out any time at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>.</p>
          </section>
        </div>

        <div className="mt-12 pt-12 border-t border-black/5">
          <Link to="/condition" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest border-b-2 border-black pb-1">
            View Item Condition Standards <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
