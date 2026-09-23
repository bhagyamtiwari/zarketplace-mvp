import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Truck, IndianRupee, BadgeCheck, PackageCheck, EyeOff } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

// "What is zarketplace" is the one page allowed to explain at length, because
// anyone who opens it has asked the question. The feed sends people here; it
// does not do this job itself.
//
// Same frame and rhythm as the policy pages, so moving between them never
// shifts the column or the heading.
export function About() {
  usePageMeta(META.about);

  return (
    // The same frame as every other information page: one column at the
    // site's reading width, the back link, the heading, then sections at one
    // rhythm. It used to have its own wrappers and started higher up the page
    // than its neighbours.
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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">About Us</h1>
        </div>

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          {/* Six boxes, so the grid closes cleanly at two and three columns. */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What we handle</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: ShieldCheck, title: 'Buyer protection', body: 'You buy from zarketplace: one company, one standard. If an item is not as described, you are covered.', to: '/buyer-protection' },
                { icon: IndianRupee, title: 'A fixed offer, upfront', body: 'We tell you what we will pay before you part with anything. Accept it and that number never moves.', to: '/how-it-works' },
                { icon: Truck, title: 'Doorstep pickup', body: 'Once someone buys your item, a courier collects it from your door on a prepaid label. You never arrange postage.', to: '/shipping-policy' },
                { icon: BadgeCheck, title: 'Checked before it ships', body: 'Every item comes to our hub and is checked against its listing before it goes to you. If it does not match, it does not ship.', to: '/conditions-guide' },
                { icon: PackageCheck, title: 'Returns that exist', body: 'A stated returns and refunds process, in writing, for the cases where something goes wrong.', to: '/returns' },
                { icon: EyeOff, title: 'No sold-out clutter', body: 'The moment an item sells it leaves the feed. Scrolling past things you cannot buy is annoying, so we do not show them.', to: '/faq' },
              ].map(({ icon: Icon, title, body, to }) => (
                <Link
                  key={title}
                  to={to}
                  className="flex h-full flex-col gap-2 border border-black/15 px-5 py-4 hover:border-black transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <h3 className="text-[15px] font-bold leading-snug">{title}</h3>
                  </div>
                  <p>{body}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">The market exists</h2>
            <p>
              India's secondhand apparel market is worth roughly $3.5 billion and growing at double-digit rates a year.{' '}
              <a
                href="https://univdatos.com/reports/india-second-hand-apparel-market"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-black underline underline-offset-4"
              >
                (UniVDatos, 2025)
              </a>{' '}
              People are already buying and selling this way. What they did not have is one place accountable for the result.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Why it matters</h2>
            <p>
              Fashion is one of the dirtiest industries on the planet, and most of what it makes ends up
              in a landfill within a year. Every item resold here is one that stays in use instead. That
              is the whole reason we built this.{' '}
              <Link to="/our-mission" className="font-bold text-black underline underline-offset-4">Read our mission</Link>.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Still have a question?</h2>
            <div className="flex flex-wrap gap-3">
              <Link to="/faq" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
                Read the FAQ
              </Link>
              <Link to="/contact" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
                Contact us
              </Link>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
