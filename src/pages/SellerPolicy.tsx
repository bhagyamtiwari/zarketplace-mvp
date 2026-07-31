import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function SellerPolicy() {
  useDocumentTitle('Seller Policy');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Seller Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">What's expected of every seller on zarketplace</p>
        </div>

        <div className="flex flex-col gap-10 text-black body-copy">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Accurate Descriptions</h2>
            <p>Listings must accurately reflect the item's condition, size, measurements, and any flaws. Misrepresenting an item is grounds for removal from the platform.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Photos</h2>
            <p>Shoot in natural light against a plain background, ideally white, with the whole item in frame. Screenshots and stock photos are not allowed. Every listing needs at least a front and a back shot, and a close-up of any flaw you have disclosed.</p>
            <p>To clear a busy background, free tools like <a href="https://www.photoroom.com/tools/background-remover" target="_blank" rel="noreferrer" className="font-bold text-black underline">Photoroom</a> or <a href="https://www.remove.bg/" target="_blank" rel="noreferrer" className="font-bold text-black underline">Remove.bg</a> do the job in one step.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Authentic Products Only</h2>
            <p>Only authentic, genuine items may be listed. Counterfeit or replica items are strictly prohibited and will be removed on discovery.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Pack and Hand Off Within 72 Hours</h2>
            <p>When your item sells, pack it well and hand it off within 72 hours.</p>
            <p>You choose how shipping works on each listing. If the buyer pays shipping, or if you offer free shipping and let us arrange it, zarketplace books and pays the courier and you only pack the item. With buyer-paid shipping you keep your full asking price; with free shipping the shipping cost is deducted from your payout instead.</p>
            <p>If you choose to ship it yourself, you book and pay for your own courier and keep your full asking price. In the seller portal you must then supply the courier name, the tracking number, and a photo of the packed parcel with the shipping label visible. Your order cannot be marked shipped, and your payout cannot be released, until all three are there. That photo is also what we use to settle a dispute in your favour if a buyer says the parcel never arrived.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payout Timing</h2>
            <p>Your payout is released after the item is delivered and the buyer's 48-hour review window closes with no open claim. There are no selling fees, so you keep 100% of your asking price. The only deduction is shipping, and only on listings where you offered free shipping <em>and</em> asked us to arrange the courier. If you shipped it yourself, nothing is deducted.</p>
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
