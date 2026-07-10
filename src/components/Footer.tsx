// Site footer. Desktop: 4 equal columns in one row, social icons under the
// Company column, then a bottom bar (brand block left, legal block right).
// Mobile: each column collapses into an accordion (one section open at a
// time), social icons live inside the Company accordion, and the bottom
// block is just logo + wordmark + copyright (legal links and social folded
// into the Company accordion instead of repeated separately).
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Instagram, Twitter, Youtube, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Wordmark } from './Wordmark';

interface FooterLink {
  label: string;
  to: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const MARKETPLACE: FooterColumn = {
  title: 'Marketplace',
  links: [
    { label: 'Buy', to: '/browse' },
    { label: 'Sell', to: '/sell' },
    { label: 'Seller Portal', to: '/seller-portal' },
    { label: 'Conditions Guide', to: '/conditions-guide' },
  ],
};

const ACCOUNT: FooterColumn = {
  title: 'Account',
  links: [
    { label: 'My Orders', to: '/track-order' },
    { label: 'My Profile', to: '/account' },
    { label: 'FAQ', to: '/faq' },
  ],
};

const SUPPORT: FooterColumn = {
  title: 'Support',
  links: [
    { label: 'Contact', to: '/contact' },
    { label: 'Buyer Protection', to: '/buyer-protection' },
    { label: 'Shipping Policy', to: '/shipping-policy' },
    { label: 'Returns', to: '/returns' },
    { label: 'Refund Policy', to: '/refund-policy' },
    { label: 'Grievance Officer', to: '/grievance-officer' },
  ],
};

// Desktop order (matches the visual column as specified).
const COMPANY: FooterColumn = {
  title: 'Company',
  links: [
    { label: 'About', to: '/about' },
    { label: 'Terms', to: '/terms' },
    { label: 'Privacy', to: '/privacy' },
    { label: 'Trademark Notice', to: '/trademark-notice' },
  ],
};

// Mobile order: Trademark Notice folds up above Terms/Privacy since the
// bottom bar's separate legal line is dropped on mobile.
const COMPANY_MOBILE: FooterColumn = {
  title: 'Company',
  links: [
    { label: 'About', to: '/about' },
    { label: 'Trademark Notice', to: '/trademark-notice' },
    { label: 'Terms', to: '/terms' },
    { label: 'Privacy', to: '/privacy' },
  ],
};

const LINK_CLASS = 'text-xs font-bold uppercase tracking-widest text-white/80 hover:text-white/60 transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2';
const HEADER_CLASS = 'text-[10px] font-black uppercase tracking-[0.3em] text-white';

function SocialIcons() {
  return (
    <div className="flex items-center gap-4">
      <a
        href="https://www.instagram.com/zarketplace"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on Instagram"
        className="text-white/80 hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <Instagram className="h-4 w-4" />
      </a>
      <a
        href="https://x.com/zarketplace"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on X"
        className="text-white/80 hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <Twitter className="h-4 w-4" />
      </a>
      <a
        href="https://www.youtube.com/@zarketplace"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on YouTube"
        className="text-white/80 hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        <Youtube className="h-4 w-4" />
      </a>
      <a
        href="https://wa.me/918505927538"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="zarketplace on WhatsApp"
        className="text-white/80 hover:text-white transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
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
        <div className="hidden md:grid grid-cols-4 gap-x-12">
          <FooterColumnBlock column={MARKETPLACE} />
          <FooterColumnBlock column={ACCOUNT} />
          <FooterColumnBlock column={SUPPORT} />
          <div className="flex flex-col gap-6">
            <FooterColumnBlock column={COMPANY} bare />
            <SocialIcons />
          </div>
        </div>

        {/* Mobile: accordion sections, one open at a time */}
        <div className="md:hidden flex flex-col">
          {[MARKETPLACE, ACCOUNT, SUPPORT, COMPANY_MOBILE].map((column) => {
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
                  {isOpen ? <ChevronUp className="h-4 w-4 text-white/60" /> : <ChevronDown className="h-4 w-4 text-white/60" />}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-4 pb-6">
                    {column.links.map((link) => (
                      <Link key={link.to} to={link.to} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    ))}
                    {column.title === 'Company' && (
                      <div className="pt-2">
                        <SocialIcons />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop bottom bar: brand left, legal right */}
        <div className="hidden md:flex mt-16 pt-10 border-t border-white/10 items-end justify-between">
          <Link to="/" className="flex items-center">
            <Wordmark on="dark" heightClassName="h-9" />
          </Link>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">© 2026 All rights reserved.</span>
          </div>
        </div>

        {/* Mobile bottom block: logo + wordmark, then all rights reserved */}
        <div className="md:hidden mt-10 pt-8 flex flex-col items-center gap-4 text-center">
          <Link to="/" className="flex items-center">
            <Wordmark on="dark" heightClassName="h-8" />
          </Link>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">All Rights Reserved.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumnBlock({ column, bare }: { column: FooterColumn; bare?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-6', bare && 'gap-6')}>
      <h4 className={HEADER_CLASS}>{column.title}</h4>
      <ul className="flex flex-col gap-4">
        {column.links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className={LINK_CLASS}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
