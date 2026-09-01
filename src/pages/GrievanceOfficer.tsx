import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function GrievanceOfficer() {
  usePageMeta(META.grievance);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Grievance Officer</h1>
        </div>

        <div className="flex flex-col gap-10 text-black body-longform">
          <p>
            If something goes wrong with an order, write to us and a person will
            answer. This page exists so you always know who that is.
          </p>

          <div className="flex flex-col gap-2 border border-black p-6">
            <p><span className="font-black uppercase tracking-widest text-xs">Grievance officer</span><br />Bhagyam Tiwari</p>
            <p><span className="font-black uppercase tracking-widest text-xs">Company</span><br />ADNIZ Private Limited</p>
            <p>
              <span className="font-black uppercase tracking-widest text-xs">Email</span><br />
              <a href="mailto:grievance@zarketplace.com" className="font-bold text-black underline">grievance@zarketplace.com</a>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-black uppercase tracking-tight">What happens when you write</h2>
            <p>
              We acknowledge every complaint within <strong>48 hours</strong> and
              resolve it within <strong>one month</strong> of receiving it. If we
              need something from you to resolve it, we will ask in that first reply.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-black uppercase tracking-tight">Who you are dealing with</h2>
            <p>
              zarketplace is a trading name of ADNIZ Private Limited. We buy
              pre-owned items and resell them, so we are the seller for every
              order on this site, not a venue where other people sell to you.
              That means your complaint is with us and is ours to fix.
            </p>
            {/* Required of a seller under the Consumer Protection (E-Commerce)
                Rules 2020. Filled in before launch - see the note below. */}
            <p className="text-black/50">
              Registered address and GSTIN are published on our{' '}
              <Link to="/terms" className="font-bold text-black underline">Terms</Link> page.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
