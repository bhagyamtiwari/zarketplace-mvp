import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function Privacy() {
  usePageMeta(META.privacy);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Privacy Policy</h1>
          <p className="text-[11px] font-medium tracking-normal">Last updated 23 September 2026</p>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          <p>zarketplace is run by ADNIZ Private Limited (CIN U47711DL2023PTC418107). We decide what personal data is collected through this site and why, which makes us responsible for it under India's Digital Personal Data Protection Act, 2023.</p>

          <p>This Privacy Policy explains how zarketplace ("we", "us", or "our") collects, uses, and shares your personal information when you use our services, including visiting zarketplace.com or contacting us. By using our site or services, you agree to this policy. If you disagree, please don’t use our services. We may update this policy from time to time, and the latest version will always be on our site with the updated date.</p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Information We Collect</h2>
            <p>When you create an account we collect your email address and, if you set one, a name and phone number. When you buy, we collect the delivery address and contact number you enter at checkout. When you sell us an item, we collect the address we collect it from, and the payout details we pay you with, which may be a UPI ID or a bank account name, number and IFSC. We may also hold your PAN, which is a standard requirement on payments of this kind. We keep a record of items we have declined and why, which affects whether you can list again. Card details are entered on our payment provider's screen and are never stored by us.</p>
            <p>When you sell us an item, we also keep the photos, measurements and description you send. Photos of an item we buy may be published on its page on our site, so <strong>keep people, faces, addresses and anything else personal out of the frame</strong>. We do not publish your name or any other detail about you alongside them.</p>
            <p>If you write to us, we keep the message and our reply so we can follow up and resolve it.</p>
            <p>If, and only if, you accept analytics, we also record which pages you view and which actions you take, tied to a random identifier rather than your name.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How We Use Your Information</h2>
            <p>We use your information to process orders, make and honour offers, collect and deliver items, pay you, manage your account, communicate with you, and improve our services. We also use it to keep tax and accounting records, to meet our other legal obligations, and to prevent fraud, including counterfeit items and repeated failed handovers.</p>
            <p>Messages we send are about your account, your orders and your items: an offer, a shipping label, a delivery update, a payout. If we cannot reach you by email about something time-sensitive, we may message you on WhatsApp. We do not send marketing texts.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Sharing Your Information</h2>
            <p>We share only what a transaction or the law needs. If you buy, your delivery address goes to the courier so the parcel can reach you. If you sell us an item, your address goes to the courier collecting it, and your payout details go to our payment provider so we can pay you. Buyers and the people we buy from are never shown each other's details, because they are not party to each other's transaction. We do not sell your personal information to anyone.</p>
            <p>We use trusted service providers to run the site: to host it and store data, take payments and make payouts, book couriers, send emails, prepare item photos and, only if you accept analytics, measure how the site is used. Each receives only what its job needs and may use it for nothing else. Some of them process data outside India, under their own security and privacy commitments.</p>
            <p>We may also disclose information when the law requires it, in response to a valid request from a court, regulator or law enforcement, or where it is needed to prevent fraud, protect someone's safety, or establish or defend a legal claim. If zarketplace or its business is ever sold or merged, your information may pass to the new owner under this same policy.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How Long We Keep It</h2>
            <p>We keep your account information while your account is open. Records of orders, offers, payments and payouts are kept for as long as tax and accounting law requires, even after you close your account, because we are the seller in every one of those transactions and have to be able to show it. Messages to us are kept until the matter they concern is closed and any period for a complaint or claim has passed. When we no longer need something, we delete it or strip it of anything that identifies you.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Cookies and Browser Storage</h2>
            <p>zarketplace sets no advertising or cross-site tracking cookies. Almost everything we keep is stored in your browser's local storage on this device, not sent to us as a cookie, and you can clear all of it at any time from your browser settings.</p>
            <p>Always on, because the site cannot work without them: your sign-in session (so you stay logged in), your cart, your favorites, an in-progress checkout, and your answer to the cookie banner itself.</p>
            <p>Only after you accept: product analytics (PostHog) and page-performance measurement (Vercel Analytics and Speed Insights). If you reject, the analytics script is never loaded at all, and nothing is recorded. You can change your answer by clearing this site's data in your browser.</p>
            <p>During payment, our payment provider may set its own cookies on its own checkout screen, under its own privacy policy, to complete the transaction and prevent fraud.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Data Security</h2>
            <p>Payments are handled by Razorpay, so we never see or store your card details. Your account and order data are stored with access limited to the people who need it to run your order. No system is perfectly secure, and if we ever learn of a breach that affects you, we will tell you promptly.</p>
            <p>Your part is keeping your sign-in details to yourself. We will never ask for your password, your card details or a one-time passcode by email, phone or WhatsApp. If someone does, claiming to be us, it is not us: do not reply, and let us know.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Your Rights</h2>
            <p>You can ask us for a summary of the personal information we hold about you and who we have shared it with, ask us to correct or complete it, or ask us to delete it. You can withdraw your consent to analytics at any time by clearing this site's data in your browser. You can also nominate someone to exercise these rights for you if you are unable to.</p>
            <p>To make a request, email us from the address on your account. We may need to confirm it is you before acting on it. Deleting your information does not cancel an order in progress, and we will keep the records the law requires us to keep, as set out above.</p>
            <p>If you are unhappy with how we have handled your information, write to our <Link to="/grievance-officer" className="font-bold text-black underline">Grievance Officer</Link> first. If we do not resolve it, you may take it to the Data Protection Board of India.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Children’s Privacy</h2>
            <p>zarketplace is for people aged 18 and over. We do not knowingly collect data from anyone under 18. If you believe we have, contact us and we will remove it.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Other Sites</h2>
            <p>Our site links to other services, such as our payment provider's checkout and social media. What those services collect is governed by their own privacy policies, not this one.</p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Changes to This Policy</h2>
            <p>When we change this policy we update the date at the top of this page. If a change materially affects how we use information we already hold about you, we will tell you by email before it takes effect.</p>
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
