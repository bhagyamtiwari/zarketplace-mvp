import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function RefundPolicy() {
  useDocumentTitle('Refund Policy');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Refund Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">When you get your money back, and how long it takes</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <p>This page covers what happens to your money. For the process of cancelling an order or flagging an item to send back, see our <Link to="/returns" className="font-bold text-black underline">Returns</Link> page.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">When a Refund Applies</h2>
            <p>zarketplace is a final-sale marketplace. Purchases are not refunded simply due to change of mind. We issue a refund only when:</p>
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li>An order is cancelled before the seller marks it shipped</li>
              <li>The item is materially misrepresented compared to its listing</li>
              <li>The item has undisclosed damage not shown or mentioned in the listing</li>
              <li>You received the wrong item</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Timeline</h2>
            <p>Pre-shipment cancellations are refunded within 5-7 business days of the cancellation request. Exception claims (misrepresented, damaged, or wrong item) are refunded within 5-7 business days of our support team approving the claim, which itself happens within 48 hours of you submitting your order number and photos.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How You're Refunded</h2>
            <p>Refunds are issued to the original payment method used at checkout via Razorpay. We cannot issue refunds to a different card, account, or UPI ID than the one used to pay.</p>
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
