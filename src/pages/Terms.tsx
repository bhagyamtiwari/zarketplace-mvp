import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function Terms() {
  useDocumentTitle('Terms');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Terms of Service</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">The basics of using zarketplace</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What zarketplace Is</h2>
            <p>zarketplace is a peer-to-peer (P2P/C2C) marketplace for pre-owned and one-of-one fashion. We connect individual buyers and sellers; we are not the seller of record for any listing.</p>
            <p>Operated by ADNIZ Private Limited.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your Account</h2>
            <p>You're responsible for the accuracy of the information on your account and for any activity that happens under it. Keep your login credentials secure.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Prohibited Items & Conduct</h2>
            <p>Counterfeit goods, stolen items, and anything illegal to sell are prohibited. Harassment, fraud, and circumventing the platform's payment system are also prohibited and may result in account suspension.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Payments & Policies</h2>
            <p>All payments are processed securely through Razorpay. Shipping, seller, and refund terms are governed by our <Link to="/shipping-policy" className="font-bold text-black underline">Shipping Policy</Link>, <Link to="/seller-policy" className="font-bold text-black underline">Seller Policy</Link>, and <Link to="/refund-policy" className="font-bold text-black underline">Refund Policy</Link>.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Disputes</h2>
            <p>If something goes wrong with an order, contact us first at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a> so our support team can review it before any other action is taken.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Changes to These Terms</h2>
            <p>We may update these terms as the platform evolves. Continued use of zarketplace after an update means you accept the revised terms.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
