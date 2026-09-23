import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';
import { ProcessFlow, type FlowStep } from '../components/ProcessFlow';

// What Buyer Protection means, point by point, then where it comes from: the
// item is in our hands, and checked, before it is in yours.
const PROMISES = [
  { title: 'Checked before it ships', body: 'Every item comes to our hub first and is checked against its listing and photos. If it does not match, it does not ship.' },
  { title: 'Your details stay private', body: 'Your address and phone number go only to the courier delivering your order.' },
  { title: 'Secure payment', body: 'You pay zarketplace directly, through Razorpay. We never see or store your card details.' },
  { title: 'Refunds when we get it wrong', body: 'Not as described, or the wrong item? Tell us within 7 days of delivery for a full refund, and we pay the return postage.' },
];

const PROTECTION_FLOW: FlowStep[] = [
  { label: 'We source it', detail: 'We buy every item ourselves, and it comes to our hub first.' },
  { label: 'We check it', detail: 'Against its listing and photos. If it does not match, it does not ship.' },
  { label: 'We ship it to you', detail: 'Repacked in our own packaging, tracked to your door.' },
];

export function BuyerProtection() {
  usePageMeta(META.buyerProtection);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Buyer Protection</h1>
          <p className="body-longform font-bold">Every order on zarketplace is covered by Buyer Protection.</p>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          {/* The buyer's version of How selling works: the journey first. */}
          <ProcessFlow steps={PROTECTION_FLOW} />

          {/* What the promise is made of. Outlined like the steps above, so the
              page has one box style, not two. */}
          <div className="flex flex-col gap-4">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PROMISES.map((p) => (
                <li key={p.title} className="flex flex-col gap-2 border border-black/15 px-5 py-4">
                  <h2 className="text-[15px] font-bold leading-snug">{p.title}</h2>
                  <p>{p.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What it costs</h2>
            <p>Nothing extra. Buyer Protection is part of what you pay for the item, shown at checkout with your delivery cost. There is no separate charge to opt into and nothing to add on.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If something is wrong</h2>
            <p>If your item arrives significantly not as described, or it is the wrong item, contact us within 7 days of delivery with your order number and photos. You are dealing with us directly, and we resolve it directly. For how refunds are processed and when, see our <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
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
