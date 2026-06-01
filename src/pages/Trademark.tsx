import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function Trademark() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-12"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-2">
            <img src="/images/zarketplace-tp.png" alt="zarketplace" className="h-6 w-auto" referrerPolicy="no-referrer" />
            <span className="lowercase font-black tracking-tighter text-2xl">zarketplace</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Legal</span>
          <h1 className="text-5xl font-black tracking-tighter uppercase">Trademark &amp; Brand Notice</h1>
        </div>

        <div className="prose prose-zinc max-w-none flex flex-col gap-8 text-black leading-relaxed">
          <p>
            zarketplace is an independent resale and peer-to-peer (P2P/C2C) marketplace that
            facilitates the buying and selling of pre-owned and new goods between users.
          </p>

          <p>
            All trademarks, service marks, brand names, logos, and other intellectual property
            displayed on our platform are the property of their respective owners. Any references to
            brands, products, or trademarks are made solely for identification, descriptive, and
            informational purposes.
          </p>

          <p>
            zarketplace is not affiliated with, associated with, authorized by, sponsored by, or
            endorsed by any brand featured on the platform unless explicitly stated otherwise. We do
            not claim any ownership rights in the trademarks, logos, or intellectual property of
            third parties.
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
