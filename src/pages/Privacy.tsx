import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function Privacy() {
  useDocumentTitle('Privacy');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Privacy Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">Last updated: May 19, 2026</p>
        </div>

        <div className="flex flex-col gap-10 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <p>This Privacy Policy explains how zarketplace ("we", "us", or "our") collects, uses, and shares your personal information when you use our services, including visiting zarketplace.com or contacting us. By using our site or services, you agree to this policy. If you disagree, please don’t use our services. We may update this policy from time to time, and the latest version will always be on our site with the updated date.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Information We Collect</h2>
            <p>We collect your personal information when you place an order, create an account, or contact us. This may include your name, email, phone number, address, and payment info. We also collect technical data like your IP address, device type, and browsing activity through cookies and analytics.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How We Use Your Information</h2>
            <p>We use your information to process orders, manage your account, communicate with you, and improve our services. We may also use it for legal compliance and fraud prevention.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Sharing Your Information</h2>
            <p>We may share your information with service providers like payment processors, shipping partners, and analytics tools. These providers are under strict confidentiality obligations.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Cookies</h2>
            <p>We use cookies to enhance your experience and understand how users interact with our site. You can manage cookie settings in your browser.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Data Security</h2>
            <p>We take security seriously but cannot guarantee complete protection. Please use the site at your own risk.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your Rights</h2>
            <p>You have the right to access, update, or delete your personal information. Depending on your location, you may also object to processing or withdraw consent.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Children’s Privacy</h2>
            <p>We do not knowingly collect data from individuals under 18. If you believe we have, contact us for prompt removal.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Contact Us</h2>
            <p>For privacy questions or rights requests, please contact us at <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>.</p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
