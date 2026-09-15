import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function SellerPolicy() {
  usePageMeta(META.vendorPolicy);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to browse
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
          <p>zarketplace buys your item outright and resells it. You send us the item and we make you an offer: a fixed amount we will pay you, which you accept or decline. Once you accept, that number is locked and it does not move. This is what we will pay you. We cover shipping both ways, payment fees and handling, and we carry the risk if it does not sell.</p>

          <p>The item stays with you while it is listed. When somebody buys it we send a prepaid label and book a courier to your door, and you are paid once it reaches us and has been checked.</p>

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
            <h2 className="text-xl font-black uppercase tracking-tight text-black">You keep the item while it is listed</h2>
            <p>Accepting an offer does not mean posting anything. Your item stays with you, at home, for the whole time it is listed. Nothing moves until somebody buys it.</p>
            <p>Two things are on you in the meantime. <strong>Keep the item</strong>, in the condition you described, and do not sell it anywhere else. <strong>Stay reachable</strong>, so we can tell you the day it sells.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">45 days, and we check in</h2>
            <p>A listing runs for <strong>45 days</strong> from the day you accept. If it has not sold by then it simply comes off the site. Nothing is owed either way, and you can send it to us again for a fresh look.</p>
            <p>Every couple of weeks we email you one question: do you still have it? It is two buttons, yes or no, and it takes a second. Saying no costs you nothing and is far better than a courier arriving for something that has gone.</p>
            <p>If we ask twice and hear nothing back, we take the listing down. That is not a penalty. We just cannot leave something on sale when we are no longer sure we can send it.</p>
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
            <p className="">This is a plain-language summary of how we operate, not tax advice. If your situation is unusual, check with your accountant.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If the item does not match its listing</h2>
            <p>When your item reaches us we check it against what you wrote and photographed. What happens next is decided in advance, so the same finding gives the same result for everyone.</p>
            <p><strong>A small difference.</strong> Something we can describe honestly and still send on. We take the item and <strong>you are paid in full</strong>. Sorting it out is our cost, not yours.</p>
            <p><strong>A real difference.</strong> Anything that changes what the item is, what size it is, or what condition it is in, including a flaw you did not mention. We can refuse it, and no payout is due. You can have it back and <strong>you cover the return postage</strong>.</p>
            <p><strong>A fake, or not the item in the photos.</strong> We keep it, nothing is paid, and you will not be able to sell with us again. We do not send counterfeits back.</p>
            <p>For a refused item we hold it for <strong>60 days</strong> from the day we tell you. After that we may donate or dispose of it, and it is no longer yours to claim. You agree to this when you accept an offer.</p>
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
