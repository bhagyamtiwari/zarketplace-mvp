import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function SellerPolicy() {
  usePageMeta(META.vendorPolicy);

  return (
    <div className="mx-auto max-w-[64ch] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to zarketplace
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-14"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Vendor Policy</h1>
        </div>

        <div className="flex flex-col gap-14 text-black body-longform">
          <p>zarketplace buys your item outright and resells it. You tell us your asking price, we come back with what we will pay for it, and you decide before anything goes live. Once you accept, that number is locked and it does not move.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Accurate descriptions</h2>
            <p>Your listing must accurately reflect the item's condition, size, measurements, and any flaws. When your item reaches us we check it against what you described and photographed.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Photos</h2>
            <p>Shoot in natural light against a plain background, ideally white, with the whole item in frame. Screenshots and stock photos are not allowed. Every listing needs at least a front and a back shot, and a close-up of any flaw you have disclosed.</p>
            <p>To clear a busy background, a free tool like <a href="https://www.photoroom.com/tools/background-remover" target="_blank" rel="noreferrer" className="font-bold text-black underline">Photoroom</a> does the job in one step.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Authentic items only</h2>
            <p>We only buy authentic, genuine items. Counterfeit or replica items are strictly prohibited, are refused at our hub, and are not paid for.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Pack and hand it over within 5 days</h2>
            <p>Once your item is bought, we send you a prepaid label and book the courier. Pack it well and hand it to them within 5 days. You never arrange a pickup, buy a label, or pay for the postage to us.</p>
            <p>If it does not go in that time we cancel the order, refund the buyer, and the item stays yours. It counts against your account.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Tax</h2>
            <p>You do not need a GSTIN, and you are not registering a business anywhere. You are selling us one item, and we resell it under our own GST registration. That is what makes this simple for you.</p>
            <p>We may ask for your PAN before a payout, which is a standard requirement on payments of this kind.</p>
            <p className="text-black/70">This is a plain-language summary of how we operate, not tax advice. If your situation is unusual, check with your accountant.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If we cannot accept an item</h2>
            <p>If it does not match its listing, we do not take it and no payout is due. We will tell you why.</p>
            <p>You can have it back. Tell us and we will send it, and <strong>you cover the return postage</strong>. We hold a refused item for <strong>60 days</strong> from the day we tell you. After that we may donate or dispose of it, and it is no longer yours to claim. You agree to this when you accept an offer.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your account standing</h2>
            <p>Every account starts at 100 points. A missed dispatch costs 25, an item refused on condition costs 20, and one refused on authenticity costs 60. Cancelling before the deadline, which we would rather you did, costs 10.</p>
            <p>Below 40 you cannot list until we lift it. Nothing here affects a payout you have already been promised.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payout timing</h2>
            <p>Your payout is released once your item reaches our hub and we accept it. It is the amount you agreed to when you listed the item, in full, and it does not depend on anything that happens after we have accepted it.</p>
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
