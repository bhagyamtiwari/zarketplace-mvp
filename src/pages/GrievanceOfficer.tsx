import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function GrievanceOfficer() {
  useDocumentTitle('Grievance Officer');

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
          <h1 className="text-5xl font-black tracking-tighter uppercase">Grievance Officer</h1>
        </div>

        <div className="flex flex-col gap-8 text-black leading-relaxed text-sm font-medium uppercase tracking-widest">
          <p>
            As required under Rule 3(1)(c) of the Information Technology (Intermediary Guidelines
            and Digital Media Ethics Code) Rules, 2021, zarketplace designates the following
            Grievance Officer.
          </p>

          <div className="flex flex-col gap-2 border border-black/10 bg-zinc-50 p-6 normal-case text-sm">
            <p><span className="font-black uppercase tracking-widest text-xs">Name:</span> BHAGYAM TIWARI</p>
            <p><span className="font-black uppercase tracking-widest text-xs">Organisation:</span> ADNIZ Private Limited</p>
            <p>
              <span className="font-black uppercase tracking-widest text-xs">Email:</span>{' '}
              <a href="mailto:grievance@zarketplace.com" className="font-bold text-black underline">grievance@zarketplace.com</a>
            </p>
          </div>

          <p>
            Any complaint or concern regarding content hosted on the platform must be submitted in
            writing. The Grievance Officer will acknowledge the complaint within 24 hours and
            resolve it within 30 days of receipt.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
