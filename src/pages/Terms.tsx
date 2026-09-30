import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function Terms() {
  usePageMeta(META.terms);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Terms of Service</h1>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What zarketplace Is</h2>
            <p>zarketplace buys pre-owned and one-of-one fashion from individuals and resells it under its own GST registration. When you buy from zarketplace you are buying from zarketplace: we are the seller of record for every listing, and every order is sold and shipped by us. When you sell to zarketplace you are selling us the item outright, for an amount agreed before the item is listed. These are two separate transactions.</p>
            {/* The Consumer Protection (E-Commerce) Rules 2020 apply to us: being a
              principal rather than a marketplace keeps us out of the GST ECO and
              TCS regime, it does not put us outside consumer law. Rule 4(2) wants
              legal name, principal geographic address and customer care details
              displayed, and the Grievance page tells people to look for them here.

              TODO: the registered office reads "temporarily relocating" until
              the new address is settled. Replace it with the full address as
              soon as it is, and add the GSTIN in the same block once issued. */}
            <p>zarketplace is a trading name of <strong>ADNIZ Private Limited</strong>, a company incorporated in India.</p>
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <dt className="font-bold">Legal name</dt>
                <dd>ADNIZ Private Limited</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="font-bold">CIN</dt>
                <dd>U47711DL2023PTC418107</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="font-bold">Registered office</dt>
                <dd>Temporarily relocating. Email us and we will send you our current postal address.</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="font-bold">Customer care</dt>
                <dd>
                  <a href="mailto:contact@zarketplace.com" className="underline underline-offset-4">contact@zarketplace.com</a>
                  {' '}&middot;{' '}
                  <a href="tel:+918505927538" className="underline underline-offset-4">+91 85059 27538</a>
                </dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your Account</h2>
            <p>You're responsible for the accuracy of the information on your account and for any activity that happens under it. Keep your login credentials secure.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Prohibited Items & Conduct</h2>
            <p>Counterfeit goods, stolen items and anything illegal to sell are prohibited, and we do not buy them. Fraud and abuse of our staff may result in your account being closed.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payments & Policies</h2>
            <p>All payments are processed securely through Razorpay. Shipping, vendor, and refund terms are governed by our <Link to="/shipping-policy" className="font-bold text-black underline">Shipping Policy</Link>, <Link to="/how-it-works" className="font-bold text-black underline">Vendor Policy</Link>, and <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
          </section>

          {/* Kept in step with the server: one code per order, a fixed rupee
              amount, released if the order is cancelled or refunded, and a
              refund is of what was actually paid (razorpay-refund refunds
              total_amount, which is after the code). */}
          <section id="promo-codes" className="flex flex-col gap-4 scroll-mt-28">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Promo Codes</h2>
            <p>From time to time we give out promo codes: to make up for something that went wrong with an order, to thank or reward a customer, or as a special offer. We decide when to issue a code and who receives one.</p>
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li>A promo code takes a fixed rupee amount off an order. One code can be used per order.</li>
              <li>A code may be limited to one person's account, a minimum order, a number of uses or an end date. Checkout tells you if a code cannot be used.</li>
              <li>Codes have no cash value and cannot be exchanged for cash, credit or another code.</li>
              <li>If an order that used a code is cancelled or refunded, we refund the amount you actually paid, and the code can be used again until it expires.</li>
              <li>We may withdraw a code that was issued by mistake, obtained through fraud, or shared beyond the person it was meant for.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Disputes</h2>
            <p>If something goes wrong with an order, contact us first at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> so our support team can review it before any other action is taken.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Changes to These Terms</h2>
            <p>We may update these terms as the business changes. Continuing to use zarketplace after an update means you accept the revised version. An acquisition price you have already accepted is not affected by any later change.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
