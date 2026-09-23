import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';
import { ProcessFlow, type FlowStep } from '../components/ProcessFlow';

// The seller's guide. Buyers have their own version on Buyer Protection, so
// this page speaks to one reader: someone deciding whether to sell to us.
const SELLING: FlowStep[] = [
  { label: 'Add your item', detail: 'Photos, size and an honest condition. It takes a minute.' },
  { label: 'Accept our offer', detail: 'A fixed amount in rupees. Once you accept, it is locked.' },
  { label: 'We collect it', detail: 'When someone buys it, we send a prepaid label and a courier collects it.' },
  { label: 'Get paid', detail: 'Once we have checked it at our hub. The amount you accepted, in full.' },
];

export function SellerPolicy() {
  usePageMeta(META.howItWorks);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">How Selling Works</h1>
        </div>

        <ProcessFlow steps={SELLING} />

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          {/* One thought in two paragraphs, so paragraph spacing, not the
              gap between sections. */}
          <div className="flex flex-col gap-4">
            <p>zarketplace buys your item and resells it. You tell us about it, and we make you an offer: a fixed amount in rupees, which you accept or decline. Once you accept, that amount is locked and it does not change. This is what we will pay you. We cover shipping both ways, payment processing and handling, and we carry the risk if it does not sell.</p>
            <p>The item stays with you until someone buys it. Then we send you a prepaid label, a courier collects it from your door, and you are paid once it reaches us and has been checked.</p>
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Accurate descriptions</h2>
            <p>What you tell us must accurately reflect the item's condition, size, measurements, and any flaws. When your item reaches us we check it against what you described and photographed, so <strong>send the exact item in your photos</strong>.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Photos</h2>
            <p>Shoot in natural light against a plain background, ideally white, with the whole item in frame. Screenshots and stock photos are not allowed. Every item needs at least a front and a back shot, and a close-up of any flaw you have disclosed.</p>
            <p>To clear a busy background, a free tool like <a href="https://www.photoroom.com/tools/background-remover" target="_blank" rel="noreferrer" className="font-bold text-black underline">Photoroom</a> does the job in one step.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Authentic items only</h2>
            <p>We only buy authentic, genuine items. Counterfeit or replica items are strictly prohibited, are refused at our hub, and are not paid for.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">The item stays with you until someone buys it</h2>
            <p>Accepting an offer does not mean posting anything. Your item stays with you, at home, and nothing moves until someone buys it.</p>
            <p>Two things are on you in the meantime. <strong>Keep it packed and unworn</strong>, in the condition you described, and do not sell it anywhere else. <strong>Watch your email</strong> for your shipping label. If we cannot reach you, we may message you on WhatsApp too.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Changed your mind?</h2>
            <p>Withdraw your item from your vendor portal any time <strong>until someone buys it</strong>. It comes off the site straight away and your offer ends. There is no charge, it does not count against you, and you can send it to us again later for a fresh offer.</p>
            <p>Once someone has bought it, it can no longer be withdrawn: it has been sold to a customer.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">30 days, and we check in</h2>
            <p>If we have not sold your item within <strong>30 days</strong> of you accepting, or you withdraw it, your offer ends and it comes off the site. Nothing is owed either way, and you can send it to us again for a fresh look.</p>
            <p>Every couple of weeks we email you one question: do you still have it? It is two buttons, yes or no, and it takes a second. Saying no costs you nothing and is far better than a courier arriving for something that has gone.</p>
            <p>If we ask twice and hear nothing back, we take it off the site. That is not a penalty. We just cannot leave something on sale when we are no longer sure we can send it.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Hand it over within 5 days</h2>
            <p>Once your item is bought, we email you a prepaid label. Print it and attach it to the parcel. A courier will collect it from your door, <strong>usually within 48 hours</strong>, and it must be handed over within <strong>5 days</strong>. You never arrange a pickup, buy a label, or pay for postage.</p>
            <p>If it does not go in that time we cancel the order, refund the buyer, and the item stays yours. It counts against your account.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Tax</h2>
            <p>You do not need a GSTIN, and you are not registering a business anywhere. You are selling us one item, and we resell it under our own GST registration. That is what makes this simple for you.</p>
            <p>We may ask for your PAN before a payout, which is a standard requirement on payments of this kind.</p>
            <p className="">This is a plain-language summary of how we operate, not tax advice. If your situation is unusual, check with your accountant.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If the item does not match what you described</h2>
            <p>When your item reaches us we check it against what you wrote and photographed. What happens next is decided in advance, so the same finding gives the same result for everyone.</p>
            <p><strong>A small difference.</strong> Something we can describe honestly and still send on. We take the item and <strong>you are paid in full</strong>. Sorting it out is our cost, not yours.</p>
            <p><strong>A real difference.</strong> Anything that changes what the item is, what size it is, or what condition it is in, including a flaw you did not mention. We can refuse it, and no payout is due. You can have it back and <strong>you cover the return postage</strong>.</p>
            <p><strong>A fake, or not the item in the photos.</strong> We keep it, nothing is paid, and you will not be able to sell to us again. We do not send counterfeits back.</p>
            <p>For a refused item we hold it for <strong>60 days</strong> from the day we tell you. After that we may donate or dispose of it, and it is no longer yours to claim. You agree to this when you accept an offer.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your account standing</h2>
            <p>We keep track of how things go. Missing a handover, or sending something that is not what you described, counts against your account, and enough of it means we stop buying from you. Withdrawing an item before anyone buys it does not count at all.</p>
            <p>None of this affects a payout you have already been promised.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payout timing</h2>
            <p>Your payout is released once your item reaches our hub and we accept it. It is the amount you agreed to when you accepted our offer, in full, and it does not depend on anything that happens after we have accepted it.</p>
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
