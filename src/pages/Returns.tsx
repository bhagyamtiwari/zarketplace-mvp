import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';
import { ProcessFlow, type FlowStep } from '../components/ProcessFlow';

// The logistics only. Who qualifies and when is the written policy below, and
// the diagram must not say more than it does.
const RETURN_FLOW: FlowStep[] = [
  { label: 'We ship it', detail: 'From our hub, tracked to your door.' },
  { label: 'Tell us', detail: 'Within 7 days of delivery, with your order number and photos.' },
  { label: 'Send it back', detail: 'To our hub, once we have approved the return.' },
  { label: 'We refund you', detail: 'Within 5-7 business days of approval, to the way you paid.' },
];

export function Returns() {
  usePageMeta(META.returns);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Returns</h1>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-xl font-black uppercase tracking-tight">We sent it, so it comes back to us.</p>
              <p>For an item that is not as described, the wrong item, or has a flaw we did not disclose. What qualifies is set out below.</p>
            </div>
            <ProcessFlow steps={RETURN_FLOW} />
          </div>

          <p>Every item here is pre-owned and one of a kind. We are the seller, so this is our responsibility and there is nobody else for you to chase. What we will and will not refund is set out below, and we apply it the same way every time.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What we refund</h2>
            <p><strong>Not as described, the wrong item, or a flaw we did not disclose.</strong> Full refund, and we pay the return postage. This is our mistake and it costs you nothing.</p>
            <p><strong>It did not fit, or you changed your mind.</strong> No refund. These are single pieces we have already taken off the site for you, and we cannot restock them like a shop can. This is why every listing carries its measurements: measure something you already own and compare before you buy.</p>
            <p>Where we have got something genuinely wrong in spirit if not in letter, we may offer store credit instead. That is us choosing to, not something you can insist on.</p>
            <p>Anything else, write to us and we will look at it properly and tell you where we land.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Cancelling Before Shipment</h2>
            <p>If you need to cancel an order, email us at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> with your order number. This is only possible before we dispatch the item to you. Once an item has shipped, cancellation is no longer possible and the order proceeds as a normal delivery.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">If You Need to Send an Item Back</h2>
            <p>Review all photos, descriptions, and measurements carefully before buying. If you have a question about an item before ordering, email us and we will answer it. Every item is sold and shipped by zarketplace, so there is nobody else to ask and no sale is ever arranged in a DM.</p>
            <p>If your item arrives as the wrong item, or materially different from how it was listed, email us at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> within 7 days of delivery with your order number and photos. Our support team will tell you whether to ship the item back, and where, before any refund is processed. Do not return an item before we've confirmed the return is approved.</p>
            <p>For what happens to your money once a return is approved, see our <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Reporting a problem</h2>
            <p>If you need to report a problem with an order or a listing, write to us at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>. We acknowledge every complaint within 48 hours and resolve it within one month. Our grievance officer's details are on the <a href="/grievance-officer" className="font-bold text-black underline">Grievance Officer</a> page.</p>
          </section>
        </div>

      </motion.div>
    </div>
  );
}
