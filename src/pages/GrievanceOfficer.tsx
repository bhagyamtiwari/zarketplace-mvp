import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

export function GrievanceOfficer() {
  usePageMeta(META.grievance);

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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Grievance Officer</h1>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          <p>
            If something goes wrong with an order, write to us and a person will
            answer. This page exists so you always know who that is.
          </p>

          {/* Four facts, two by two on a wider screen so the block is as short
              as it can be. Set as plain text, bold label over value. Rule 4(5) of the
              Consumer Protection (E-Commerce) Rules 2020 asks for a name,
              designation, email and phone number, so the designation stays,
              set beside the name rather than on a line of its own. */}
          <dl className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="font-bold">Grievance Officer</dt>
              <dd>Bhagyam Tiwari, Director</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-bold">Company</dt>
              <dd>ADNIZ Private Limited</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-bold">Email</dt>
              <dd>
                <a href="mailto:grievance@zarketplace.com" className="underline underline-offset-4">grievance@zarketplace.com</a>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-bold">Phone</dt>
              <dd>
                <a href="tel:+918505927538" className="underline underline-offset-4">8505-ZARKET</a>{' '}
                <span className="tabular-nums">(+91 85059 27538)</span>
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
            <p>
              Our full company details are on the{' '}
              <Link to="/terms" className="font-bold text-black underline">Terms</Link> page.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
