import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function Privacy() {
  usePageMeta(META.privacy);

  return (
    <div className="mx-auto max-w-[64ch] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to zarketplace
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-12"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Privacy Policy</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black">Last updated: July 29, 2026</p>
        </div>

        <div className="flex flex-col gap-14 text-black body-longform">
          <p>This Privacy Policy explains how zarketplace ("we", "us", or "our") collects, uses, and shares your personal information when you use our services, including visiting zarketplace.com or contacting us. By using our site or services, you agree to this policy. If you disagree, please don’t use our services. We may update this policy from time to time, and the latest version will always be on our site with the updated date.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Information We Collect</h2>
            <p>When you create an account we collect your email address and, if you set one, a display name. When you buy, we collect the delivery address and contact number you enter at checkout. When you sell, we collect your pickup address, your Instagram handle, and the UPI ID we pay you out to. Card and UPI payment details are entered on our payment provider's screen and are never stored by us.</p>
            <p>If, and only if, you accept analytics, we also record which pages you view and which actions you take, tied to a random identifier rather than your name.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How We Use Your Information</h2>
            <p>We use your information to process orders, manage your account, communicate with you, and improve our services. We may also use it for legal compliance and fraud prevention.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Sharing Your Information</h2>
            <p>We share only what a transaction needs. If you buy, your delivery address goes to the courier so the parcel can reach you. If you sell us an item, your address goes to the courier collecting it, and your payout details go to our payment provider so we can pay you. Buyers and the people we buy from are never shown each other's details, because they are not party to each other's transaction. We do not sell your personal information to anyone.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Cookies and Browser Storage</h2>
            <p>zarketplace sets no advertising or cross-site tracking cookies. Almost everything we keep is stored in your browser's local storage on this device, not sent to us as a cookie, and you can clear all of it at any time from your browser settings.</p>
            <p>Always on, because the site cannot work without them: your sign-in session (so you stay logged in), your cart, your saved items, an in-progress checkout, and your answer to the cookie banner itself.</p>
            <p>Only after you accept: product analytics (PostHog) and page-performance measurement (Vercel Analytics and Speed Insights). If you reject, the analytics script is never loaded at all, and nothing is recorded. You can change your answer by clearing this site's data in your browser.</p>
            <p>During payment, our payment provider may set its own cookies on its own checkout screen, under its own privacy policy, to complete the transaction and prevent fraud.</p>
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
