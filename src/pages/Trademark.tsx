import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function Trademark() {
  useDocumentTitle('Trademark & Brand Notice');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Trademark &amp; Brand Notice</h1>
        </div>

        <div className="flex flex-col gap-8 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <p>
            zarketplace is a peer-to-peer resale marketplace operated by ADNIZ Private Limited.
          </p>

          <p>
            We are not affiliated with, associated with, or endorsed by any of the brands listed or
            sold on our platform. All brand names, trademarks, and logos belong to their respective
            owners. zarketplace claims no rights to any third-party trademarks or intellectual
            property.
          </p>

          <p>
            Listings on zarketplace are for secondhand/resale items only.
          </p>

          <p>
            If you are a trademark owner or authorized representative and have questions or concerns
            regarding content on the platform, please contact us at{' '}
            <a href="mailto:contact@zarketplace.com" className="font-bold text-black underline">contact@zarketplace.com</a>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
