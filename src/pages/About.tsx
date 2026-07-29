import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Truck, BadgePercent, BadgeCheck, PackageCheck, EyeOff } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';

// "What is zarketplace" is the one page allowed to explain at length, because
// anyone who opens it has asked the question. The feed sends people here; it
// does not do this job itself.
//
// One measure throughout: the column is capped at 5xl and prose at 44rem, the
// exact width the policy pages render at. Uppercase tracked text goes unreadable long before
// ordinary prose does, so a consistent measure matters more here than usual.
export function About() {
  useDocumentTitle('What is zarketplace');

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="pt-20 pb-16 sm:pb-20 flex flex-col">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black hover:text-black/80">
          <ArrowLeft className="h-3 w-3" /> Back to zarketplace
        </Link>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-6 flex flex-col gap-12 sm:gap-16">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-12 sm:gap-16"
        >
          <header className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase">What Is zarketplace</h1>
              <p className="text-sm font-black uppercase tracking-widest text-black">Building infrastructure for Indian resale</p>
            </div>
            {/* Copy fills its box rather than stopping short of the right edge:
                inside a bounded panel the panel is the measure. */}
            <div className="bg-black text-white p-6 sm:p-10">
              <p className="text-sm font-medium uppercase tracking-[0.12em] leading-[1.8]">
                India's resale market existed but was fragmented. Transactions shadily happened
                through Instagram DMs and WhatsApp groups, with hidden prices, no buyer protection,
                and no secure way to get paid. zarketplace brings it all into one trusted platform
                with verified listings, upfront pricing, secure payments, and guaranteed payouts.
              </p>
            </div>
          </header>

          {/* Both sides of the market, side by side, because the reader is one or
              the other and should find their own column immediately. */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-black/10 p-6 sm:p-8 flex flex-col gap-5">
              <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">How buying works</h2>
              <ol className="flex flex-col gap-4">
                {[
                  'Browse the feed. Price, size and condition are on every card.',
                  'Pay through checkout. Your money is held, not handed over.',
                  'The item ships tracked to your door.',
                  'Not as described? Raise it and buyer protection applies.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.3em] text-black/30 pt-1">0{i + 1}</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] leading-[1.7]">{step}</span>
                  </li>
                ))}
              </ol>
              <Link to="/" className="mt-auto self-start bg-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 transition-colors">
                Start browsing
              </Link>
            </div>

            <div className="bg-black text-white p-6 sm:p-8 flex flex-col gap-5">
              <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">How selling works</h2>
              <ol className="flex flex-col gap-4">
                {[
                  'List the item with photos, size and honest condition. Free.',
                  'We review it, then it goes live in the feed.',
                  'It sells. The courier picks up from your door.',
                  'You get paid your full asking price. We take nothing.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.3em] text-white/30 pt-1">0{i + 1}</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] leading-[1.7]">{step}</span>
                  </li>
                ))}
              </ol>
              <Link to="/sell" className="mt-auto self-start bg-white px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-black hover:bg-zinc-200 transition-colors">
                List an item
              </Link>
            </div>
          </section>
          {/* Six boxes, so the grid closes cleanly at two and three columns. */}
          <section className="flex flex-col gap-5">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">What we handle</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: ShieldCheck, title: 'Buyer protection', body: 'Your payment is held until the item reaches you. If it is not as described, you are covered.', to: '/buyer-protection' },
                { icon: BadgePercent, title: 'Zero selling fees', body: 'We take 0% commission. Permanent, not a launch offer. You keep 100% of your asking price.', to: '/seller-policy' },
                { icon: Truck, title: 'Doorstep pickup', body: 'The courier collects from the seller and delivers to the buyer, with tracking on both legs.', to: '/shipping-policy' },
                { icon: BadgeCheck, title: 'Reviewed listings', body: 'Every listing is checked before it goes live, with condition graded on a fixed scale.', to: '/conditions-guide' },
                { icon: PackageCheck, title: 'Returns that exist', body: 'A stated returns and refunds process, in writing, for the cases where something goes wrong.', to: '/returns' },
                { icon: EyeOff, title: 'No sold-out clutter', body: 'The moment an item sells it leaves the feed. Scrolling past things you cannot buy is annoying, so we do not show them.', to: '/faq' },
              ].map(({ icon: Icon, title, body, to }) => (
                <Link
                  key={title}
                  to={to}
                  className="group flex h-full flex-col gap-3 border border-black/10 p-6 hover:border-black transition-colors"
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] leading-[1.7] text-black/50">{body}</p>
                  <span className="mt-auto pt-3 text-[10px] font-black uppercase tracking-[0.25em] text-black/30 group-hover:text-black">
                    Read the policy
                  </span>
                </Link>
              ))}
            </div>
          </section>

        </motion.div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 flex flex-col gap-12 sm:gap-16">
        <section className="flex flex-col gap-4 bg-zinc-50 p-6 sm:p-10 border border-black/5">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">The market exists</h2>
          <p className="text-sm font-medium uppercase tracking-[0.12em] leading-[1.8]">
            India's secondhand apparel market is worth roughly $3.5 billion and growing over 13% a year.
            {' '}
            <a
              href="https://univdatos.com/reports/india-second-hand-apparel-market"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-black underline underline-offset-4 hover:text-black/60"
            >
              (UniVDatos, 2025)
            </a>
            {' '}
            The demand is already here. What's missing is infrastructure, not appetite.
          </p>
        </section>

        <section className="flex flex-col gap-4 bg-black text-white p-6 sm:p-10">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Why it matters</h2>
          <p className="text-sm font-medium uppercase tracking-[0.12em] leading-[1.8]">
            Every sale on zarketplace keeps a garment in circulation instead of a landfill. At scale,
            that's not a footnote - it's the point. The future of fashion isn't only what gets made.
            It's what gets kept in use.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Still have a question</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/faq" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
              Read the FAQ
            </Link>
            <Link to="/contact" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
              Contact us
            </Link>
          </div>
        </section>

        <p className="text-xs font-medium uppercase tracking-widest text-black/40">
          zarketplace is an ADNIZ Private Limited project.
        </p>
      </div>
    </div>
  );
}
