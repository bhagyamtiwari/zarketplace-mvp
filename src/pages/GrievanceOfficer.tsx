import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function GrievanceOfficer() {
  usePageMeta(META.grievance);

  return (
    <div className="shell-read pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to browse
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

          {/* Three facts, set as three facts. The bordered panel framed them as
              a callout, which is a device for something you might otherwise
              miss: on a page whose entire purpose is these three lines, the box
              was adding emphasis to the only thing on the page. */}
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-black uppercase tracking-[0.2em]">Grievance officer</dt>
              <dd>Bhagyam Tiwari</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-black uppercase tracking-[0.2em]">Company</dt>
              <dd>ADNIZ Private Limited</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-black uppercase tracking-[0.2em]">Email</dt>
              <dd>
                <a href="mailto:grievance@zarketplace.com" className="underline underline-offset-4">grievance@zarketplace.com</a>
              </dd>
            </div>
          </dl>

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
            <p className="ink-mid">
              Registered address and GSTIN are published on our{' '}
              <Link to="/terms" className="font-bold text-black underline">Terms</Link> page.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
