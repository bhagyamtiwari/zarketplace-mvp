import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';
import { ProcessFlow, type FlowStep } from '../components/ProcessFlow';

// The seller's guide, and the terms they agree to when they accept an offer.
// Buyers have their own version on Buyer Protection, so this page speaks to one
// reader: someone deciding whether to sell to us.
//
// Cut to what a vendor needs to decide and what they are agreeing to. Every
// commitment on the old, longer page is still here (7 days to accept, 30 days
// on sale, 5 days to hand over, the three outcomes at our hub, the 60-day
// hold, account standing, tax), each said once. The numbers match the
// database: acquisition_config.offer_valid_days, listing_window_days and
// fulfillment_config.ship_by_days.
const SELLING: FlowStep[] = [
  { label: 'Add your item', detail: 'Photos, size and an honest condition.' },
  { label: 'Accept our offer', detail: 'A fixed amount in rupees. You have 7 days to decide.' },
  { label: 'We collect it', detail: 'When someone buys it, a courier picks it up from your door.' },
  { label: 'Get paid', detail: 'Once it reaches us and passes our check.' },
];

const H2 = 'text-xl font-black uppercase tracking-tight text-black';
const LIST = 'list-disc pl-6 flex flex-col gap-2';

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
          <p className="body-longform measure">We buy your item for a fixed amount. You keep it until someone buys it from us.</p>
        </div>

        <ProcessFlow steps={SELLING} />

        <div className="flex flex-col gap-12 text-black body-longform">
          <section className="flex flex-col gap-4">
            <h2 className={H2}>Our offer</h2>
            {/* MODEL.md §2: the one permitted framing of what the payout
                covers. No breakdown, no share of anything, no link to our price. */}
            <p>We buy your item outright. Our offer is a fixed amount in rupees, and once you accept it, it does not change, whatever we later sell the item for. This is what we will pay you. We cover shipping both ways, payment processing and handling, and we carry the risk if it does not sell.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>Until someone buys it</h2>
            <ul className={LIST}>
              <li><strong>It stays with you.</strong> Keep it packed, unworn and as you described it, and do not sell it anywhere else.</li>
              <li><strong>It is on sale for 30 days</strong> from when you accept. If it does not sell, it comes off the site and nothing is owed either way. We may offer to try again at a new amount.</li>
              <li><strong>We check in.</strong> Every couple of weeks we email to ask if you still have it. If two go unanswered, we take it off the site.</li>
              <li><strong>You can change your mind.</strong> Withdraw it from Your items any time until someone buys it. There is no charge.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>When it is bought</h2>
            <ul className={LIST}>
              <li>We email you a prepaid label. A courier collects the parcel from your door, <strong>usually within 48 hours</strong>. You never pay for postage.</li>
              <li><strong>Hand it over within 5 days.</strong> If it does not go, we cancel the order and it counts against your account.</li>
              <li><strong>Send the exact item in your photos.</strong> Once someone has bought it, it can no longer be withdrawn.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>When it reaches us</h2>
            <p>We check it against what you described and photographed. The outcome is decided in advance, so the same finding gets the same result for everyone.</p>
            <ul className={LIST}>
              <li><strong>It matches, or the difference is small:</strong> you are paid the full amount by UPI.</li>
              <li><strong>A real difference</strong>, such as the size, the condition or a flaw you did not mention: we can refuse it and no payout is due. You can have it back if you cover the return postage. We hold it for 60 days from when we tell you, then may donate or dispose of it.</li>
              <li><strong>A fake, or not the item in your photos:</strong> we keep it, pay nothing, and stop buying from you.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>What we buy</h2>
            <p>Authentic items only. Counterfeits and replicas are refused. Photograph the real item in good light against a plain background, front and back, with a close-up of any flaw. No screenshots or stock photos.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>Tax</h2>
            <p>You do not need a GSTIN. You are selling us one item, and we resell it under our own GST registration. We may ask for your PAN before paying you. This is a plain summary, not tax advice.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>Your account</h2>
            <p>Missed handovers and items that do not match count against your account, and enough of them means we stop buying from you. Withdrawing before anyone buys never counts. None of this changes a payout you have already been promised.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={H2}>Need help?</h2>
            <p>Email <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> or WhatsApp <a href="https://wa.me/918505927538" target="_blank" rel="noreferrer" className="font-bold text-black underline">8505-ZARKET</a>. A person answers.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
