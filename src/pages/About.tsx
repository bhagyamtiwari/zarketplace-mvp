import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck, Truck, IndianRupee, BadgeCheck, PackageCheck, EyeOff } from 'lucide-react';
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
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What we handle</h2>
            <WhatWeHandle />
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

// Six promises, and nobody read them when they were six equal boxes: a grid
// of identical cards gives the eye no order to read them in, so it reads the
// first one and skips the rest.
//
// A list has one. Each row is one claim set large, with the detail under it,
// and they arrive one after another as the section scrolls into view, which
// is what makes an eye follow a list to the end. Each row is still a page you
// can go and check.
const HANDLES: Array<{ icon: React.ComponentType<{ className?: string }>; title: string; body: string; to: string }> = [
  { icon: ShieldCheck, title: 'Buyer protection', body: 'You buy from zarketplace: one company, one standard. If an item is not as described, you are covered.', to: '/buyer-protection' },
  { icon: IndianRupee, title: 'A fixed offer, upfront', body: 'We tell you what we will pay before you part with anything. Accept it and that number never moves.', to: '/how-it-works' },
  { icon: Truck, title: 'Doorstep pickup', body: 'Once someone buys your item, a courier collects it from your door on a prepaid label. You never arrange postage.', to: '/shipping-policy' },
  { icon: BadgeCheck, title: 'Checked before it ships', body: 'Every item comes to our hub and is checked against its listing before it goes to you. If it does not match, it does not ship.', to: '/conditions-guide' },
  { icon: PackageCheck, title: 'Returns that exist', body: 'A stated returns and refunds process, in writing, for the cases where something goes wrong.', to: '/returns' },
  { icon: EyeOff, title: 'No sold-out clutter', body: 'The moment an item sells it leaves the feed. Scrolling past things you cannot buy is annoying, so we do not show them.', to: '/faq' },
];

function WhatWeHandle() {
  // Anyone who has asked their system not to animate gets the list as it is,
  // in place, with no movement and nothing waiting on a scroll position.
  const still = useReducedMotion();

  return (
    <ol className="flex flex-col border-t border-black/10">
      {HANDLES.map(({ icon: Icon, title, body, to }, i) => (
        <motion.li
          key={title}
          initial={still ? false : { opacity: 0, y: 14 }}
          whileInView={still ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4, margin: '0px 0px -10% 0px' }}
          transition={{ duration: 0.4, delay: Math.min(i, 3) * 0.07, ease: [0.22, 1, 0.36, 1] }}
          className="border-b border-black/10"
        >
          <Link
            to={to}
            className="group flex items-start gap-4 py-5 sm:gap-6 sm:py-6 transition-colors hover:bg-black/[0.03]"
          >
            {/* The icon carries the left column on its own. A counter was
                there to give the list an order to read in, and it read as a
                ranking of six things that are not ranked. */}
            <Icon className="mt-0.5 h-6 w-6 shrink-0 sm:mt-1" />
            <div className="flex flex-1 flex-col gap-1.5">
              <h3 className="text-lg font-black leading-tight tracking-tight sm:text-xl">
                {title}
              </h3>
              <p>{body}</p>
            </div>
            {/* Sits still until the row is pointed at, so the page is not six
                arrows nudging at once. */}
            <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-black/30 transition-all group-hover:translate-x-1 group-hover:text-black" />
          </Link>
        </motion.li>
      ))}
    </ol>
  );
}
