// Site footer. Desktop: 4 equal columns in one row, social icons under the
// Company column, then a bottom bar (brand block left, legal block right).
// Mobile: each column collapses into an accordion (one section open at a
// time), social icons sit under the brand mark at the foot, and the bottom
// block is just logo + wordmark + copyright (legal links and social folded
// into the Company accordion instead of repeated separately).
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Instagram, Twitter, Youtube, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface FooterLink {
  label: string;
  to: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

// The footer is the only wayfinding for the info pages (the left sidebar that
// used to link them was removed), so every public page must appear here.
//
// Grouped by what someone is here to do, which for this business is two
// different things with two different vocabularies. A buyer buys; a seller is
// not "selling on" zarketplace, they are selling TO us, and every label on that
// side says so. "Sell" was the old marketplace word and promised the wrong
// thing before anyone clicked.
// Grouped by WHO is looking and WHAT they came to do, which is the only
// grouping that survives contact with a real visitor. Four questions:
//
//   Shop              I want to buy something, or check on something I bought.
//   Sell to us        I want money for something I own.
//   Help              Something is unclear or has gone wrong. I want an answer.
//   Company           Who are these people, and what am I agreeing to.
//
// The previous cut failed that test twice. "Account" collected two account
// pages plus Contact and FAQ, so the two links a stuck person needs most were
// filed under a heading that means nothing until you are already signed in.
// And Shipping and Returns sat under "Buying" next to Browse, which is where
// you look BEFORE you buy, not after.
//
// A buyer's own orders and profile belong with Shop: same person, same errand,
// one step later. Shipping and Returns are things you read when you want an
// answer, so they sit with Contact and FAQ.
const SHOP: FooterColumn = {
  title: 'Shop',
  links: [
    { label: 'Browse everything', to: '/browse' },
    { label: 'Conditions guide', to: '/conditions-guide' },
    { label: 'Buyer protection', to: '/buyer-protection' },
    { label: 'My orders', to: '/track-order' },
    { label: 'My profile', to: '/account' },
  ],
};

const SELLING: FooterColumn = {
  title: 'Sell to us',
  links: [
    { label: 'Get an offer', to: '/sell' },
    { label: 'How it works', to: '/vendor-policy' },
    { label: 'Your items', to: '/vendor-portal' },
  ],
};

const HELP: FooterColumn = {
  title: 'Help',
  links: [
    { label: 'Contact us', to: '/contact' },
    { label: 'FAQ', to: '/faq' },
    { label: 'Shipping', to: '/shipping-policy' },
    { label: 'Returns and refunds', to: '/returns' },
  ],
};

const COMPANY: FooterColumn = {
  title: 'Company',
  links: [
    { label: 'About us', to: '/about' },
    { label: 'Terms', to: '/terms' },
    { label: 'Privacy', to: '/privacy' },
    { label: 'Trademark notice', to: '/trademark-notice' },
    { label: 'Grievance officer', to: '/grievance-officer' },
  ],
};

// A link is a thing you read, so it is set as text: sentence case, normal
// tracking. The uppercase tracked register is kept for the four headings,
// which is what that register is for. Two type styles in the footer, not one
// used for both jobs.
const LINK_CLASS = 'text-sm font-medium text-white/70 hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2';
const HEADER_CLASS = 'text-[10px] font-black uppercase tracking-[0.3em] text-white';

function SocialIcons() {
  return (
    <div className="flex items-center gap-4">
      <a
        href="https://www.instagram.com/zarketplace"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on Instagram"
        className="hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <Instagram className="h-4 w-4" />
      </a>
      <a
        href="https://x.com/zarketplace"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on X"
        className="hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <Twitter className="h-4 w-4" />
      </a>
      <a
        href="https://www.youtube.com/@zarketplace"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on YouTube"
        className="hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <Youtube className="h-4 w-4" />
      </a>
      <a
        href="https://wa.me/918505927538"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on WhatsApp"
        className="hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <MessageCircle className="h-4 w-4" />
      </a>
    </div>
  );
}

export function Footer() {
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  return (
    <footer className="bg-black text-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Desktop: 4 equal columns, one row */}
        <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1.3fr] gap-x-12">
          <FooterColumnBlock column={SHOP} />
          <FooterColumnBlock column={SELLING} />
          <FooterColumnBlock column={HELP} />
          <div className="flex flex-col gap-6">
            <FooterColumnBlock column={COMPANY} bare />
            <SocialIcons />
          </div>
        </div>

        {/* Mobile: accordion sections, one open at a time */}
        <div className="md:hidden flex flex-col">
          {[SHOP, SELLING, HELP, COMPANY].map((column) => {
            const isOpen = openSection === column.title;
            return (
              <div key={column.title} className="border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setOpenSection(isOpen ? null : column.title)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between py-5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
                >
                  <span className={HEADER_CLASS}>{column.title}</span>
                  {isOpen ? <ChevronUp className="h-4 w-4 ink-mid" /> : <ChevronDown className="h-4 w-4 ink-mid" />}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-4 pb-6">
                    {column.links.map((link) => (
                      <Link key={link.to} to={link.to} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop bottom bar: brand left, legal right */}
        <div className="hidden md:flex mt-16 pt-10 border-t border-white/10 items-end justify-between">
          <Link to="/" className="flex min-h-[44px] items-center">
            <img
              src="/images/registered-wordmark/zark-reg-tp.png"
              alt="zarketplace®"
              referrerPolicy="no-referrer"
              className="h-9 w-auto aspect-[1083/202] object-contain"
            />
          </Link>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest ink-mid">© 2026 All rights reserved.</span>
          </div>
        </div>

        {/* Mobile bottom block: mark, socials under it, then the legal line.
            Centred as one stack, so the brand and the places to find it read
            together rather than the icons hiding in an accordion above. */}
        <div className="md:hidden mt-10 pt-8 flex flex-col items-center gap-5 text-center">
          <Link to="/" className="flex min-h-[44px] items-center">
            <img
              src="/images/registered-wordmark/zark-reg-tp.png"
              alt="zarketplace®"
              referrerPolicy="no-referrer"
              className="h-8 w-auto aspect-[1083/202] object-contain"
            />
          </Link>
          <SocialIcons />
          <span className="text-[10px] font-bold uppercase tracking-widest ink-mid">All Rights Reserved.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumnBlock({ column, bare }: { column: FooterColumn; bare?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-6', bare && 'gap-6')}>
      <h4 className={HEADER_CLASS}>{column.title}</h4>
      <ul className="flex flex-col gap-3">
        {column.links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className={LINK_CLASS}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
