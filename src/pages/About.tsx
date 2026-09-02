import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Truck, IndianRupee, BadgeCheck, PackageCheck, EyeOff } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

// "What is zarketplace" is the one page allowed to explain at length, because
// anyone who opens it has asked the question. The feed sends people here; it
// does not do this job itself.
//
// One measure throughout: the column is capped at 5xl and prose at 44rem, the
// exact width the policy pages render at. Uppercase tracked text goes unreadable long before
// ordinary prose does, so a consistent measure matters more here than usual.
export function About() {
  usePageMeta(META.about);

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
            </div>
            {/* Copy fills its box rather than stopping short of the right edge:
                inside a bounded panel the panel is the measure. */}
            <div className="bg-black text-white p-6 sm:p-10">
              <p className="body-longform max-w-[64ch]">
                India's resale market existed but was fragmented. Buying meant Instagram DMs and
                WhatsApp groups, hidden prices, and no way to know what would arrive. zarketplace
                does it differently: we buy the item from the person who owns it, bring it in,
                check it, repack it, and sell it to you ourselves. One source, one standard, and
                one company answerable for every order.
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
                  'Pay through checkout. You are buying from zarketplace.',
                  'We check the item and repack it before it leaves us.',
                  'It ships tracked to your door, sold and shipped by zarketplace.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.3em] text-black/30 pt-1">0{i + 1}</span>
                    <span className="body-copy">{step}</span>
                  </li>
                ))}
              </ol>
              <Link to="/" className="mt-auto self-start bg-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 transition-colors">
                Start browsing
              </Link>
            </div>

            <div className="bg-black text-white p-6 sm:p-8 flex flex-col gap-5">
              <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">How selling to us works</h2>
              <ol className="flex flex-col gap-4">
                {[
                  'Add the item with photos, size, honest condition and your asking price.',
                  'We come back with what we will pay. Accept it and the item goes live.',
                  'It sells. We send a prepaid label and the courier collects from your door.',
                  'We check it in, accept it, and pay you the amount you agreed to.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.3em] text-white/30 pt-1">0{i + 1}</span>
                    <span className="body-copy">{step}</span>
                  </li>
                ))}
              </ol>
              <Link to="/sell" className="mt-auto self-start bg-white px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-black hover:bg-zinc-200 transition-colors">
                Get an offer
              </Link>
            </div>
          </section>
          {/* Six boxes, so the grid closes cleanly at two and three columns. */}
          <section className="flex flex-col gap-5">
            <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">What we handle</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: ShieldCheck, title: 'Buyer protection', body: 'You buy from zarketplace, not from a stranger. If an item is not as described, you are covered.', to: '/buyer-protection' },
                { icon: IndianRupee, title: 'A fixed offer, upfront', body: 'We tell you what we will pay before your item goes live. Accept it and that number never moves.', to: '/vendor-policy' },
                { icon: Truck, title: 'Doorstep pickup', body: 'The courier collects from the door, brings the item to us, and we ship it on. Tracking on both legs.', to: '/shipping-policy' },
                { icon: BadgeCheck, title: 'Reviewed listings', body: 'Every listing is reviewed before it goes live, and every item is checked at our hub before it ships.', to: '/conditions-guide' },
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
                  <p className="body-longform">{body}</p>
                  <span className="mt-auto pt-3 text-[10px] font-black uppercase tracking-[0.25em] text-black/30 group-hover:text-black">
                    Read the policy
                  </span>
                </Link>
              ))}
            </div>
          </section>

        </motion.div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-20 sm:pb-24 flex flex-col gap-6 sm:gap-8">
        <section className="flex flex-col gap-4 bg-zinc-50 p-6 sm:p-10 border border-black/5">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">The market exists</h2>
          <p className="body-longform max-w-[64ch]">
            India's secondhand apparel market is worth roughly $3.5 billion and growing at double-digit rates a year.
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
            People are already buying and selling this way. What they did not have is one place accountable for the result.
          </p>
        </section>

        <section className="flex flex-col gap-4 bg-black text-white p-6 sm:p-10">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Why it matters</h2>
          <p className="body-longform max-w-[64ch]">
            Fashion is one of the dirtiest industries on the planet, and most of what it makes ends up
            in a landfill within a year. Every item resold here is one that stays in use instead. That
            is the whole reason we built this.
          </p>
        </section>

        {/* Centred: it closes the page, so it reads as an invitation rather
            than another left-aligned block of content. */}
        <section className="flex flex-col items-center gap-4 pt-6 sm:pt-10 text-center">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tight">Still have a question</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/faq" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
              Read the FAQ
            </Link>
            <Link to="/contact" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
              Contact us
            </Link>
          </div>
        </section>

        <p className="text-center text-xs font-medium uppercase tracking-widest text-black/40">
          zarketplace is an ADNIZ Private Limited project.
        </p>
      </div>
    </div>
  );
}
