import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function Trademark() {
  usePageMeta(META.trademark);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Trademark &amp; Brand Notice</h1>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          <p>
            zarketplace is a pre-owned fashion retailer operated by ADNIZ Private Limited. We buy items from individuals and resell them under our own name. Please read the following carefully: it explains what we sell, how brand names appear on our site, and how rights holders can reach us.
          </p>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What we sell</h2>
            <p>
              Everything we sell is second-hand. Each item was bought by us from an individual who owned it, even when it has never been worn. We do not buy from brands, their distributors or their retailers, and we do not buy new stock to resell at a markup.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">How items are priced</h2>
            <p>
              The people we buy from do not set a price. We make each of them a fixed offer for their item, which they accept or decline. Once we have bought it, we resell it in our own name, at a price we set. We are not a marketplace for other sellers and we do not sell anything on anyone's behalf.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Brand names</h2>
            <p>
              We are not affiliated with, associated with, or endorsed by any of the brands we
              sell. All brand names, trademarks, and logos belong to their respective
              owners. zarketplace claims no rights to any third-party trademarks or intellectual
              property.
            </p>
            <p>
              We use a brand's name only to describe, accurately, the genuine item being sold. A logo appears in our photos because it is on the item itself. We never use a brand's name or logo as our own branding, or to suggest a connection with that brand.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Genuine items only</h2>
            <p>
              Every item comes to our hub and is checked before it ships. Counterfeits and replicas are refused, are not paid for, and the person who sent one cannot sell to us again. We resell genuine goods that were lawfully sold on the market, which Indian trade mark law permits.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Why we do this</h2>
            <p>
              Reselling clothes that already exist keeps them in use and out of landfill, and it means one less new piece has to be made. We are against fast, disposable consumption, and pre-owned is how we act on it. <Link to="/our-mission" className="font-bold text-black underline">Read our mission</Link>.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">For rights holders</h2>
            <p>
              If you are a trademark owner or authorized representative and have questions or concerns
              about anything we have listed, please contact us at{' '}
              <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>. Tell us which item and what the concern is, and we will review it promptly and take the listing down where the concern is valid.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
