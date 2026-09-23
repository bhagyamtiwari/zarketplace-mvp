// Site footer. Desktop: five columns in one row (the four errands, then
// Connect) and a bottom bar (wordmark left, copyright right), all inside the
// same centred 64rem column as the pages above. Mobile: each column collapses
// into an accordion (one section open at a time), and the social icons sit
// under the wordmark at the foot.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Instagram } from 'lucide-react';
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
// Balanced on purpose: three to five links a column, never six beside two.
// Buyer Protection and Returns are the buyer's side of how an order works, so
// they sit with Shop, as How Selling Works sits with Sell to Us. The
// Conditions Guide is the scale a vendor grades their item on, so it sits
// there too. Signed-in pages (orders, profile, your items) are not listed:
// they live in the account menu. The Grievance Officer is Help.
const SHOP: FooterColumn = {
  title: 'Shop',
  links: [
    { label: 'Available Now', to: '/browse' },
    { label: 'Buyer Protection', to: '/buyer-protection' },
    { label: 'Returns and Refunds', to: '/returns' },
  ],
};

const SELLING: FooterColumn = {
  title: 'Sell to Us',
  links: [
    { label: 'Get an Offer', to: '/sell' },
    { label: 'How Selling Works', to: '/how-it-works' },
    { label: 'Conditions Guide', to: '/conditions-guide' },
  ],
};

const HELP: FooterColumn = {
  title: 'Help',
  links: [
    { label: 'Contact Us', to: '/contact' },
    { label: 'FAQ', to: '/faq' },
    { label: 'Shipping', to: '/shipping-policy' },
    { label: 'Grievance Officer', to: '/grievance-officer' },
  ],
};

const COMPANY: FooterColumn = {
  title: 'Company',
  links: [
    { label: 'About Us', to: '/about' },
    { label: 'Our Mission', to: '/our-mission' },
    { label: 'Terms', to: '/terms' },
    { label: 'Privacy', to: '/privacy' },
    { label: 'Trademark Notice', to: '/trademark-notice' },
  ],
};

// A link is a thing you read, so it is set as text: sentence case, normal
// tracking. The uppercase tracked register is kept for the four headings,
// which is what that register is for. Two type styles in the footer, not one
// used for both jobs.
const LINK_CLASS = 'text-sm font-medium text-white hover:text-white/65 transition-colors rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2';
const HEADER_CLASS = 'text-[11px] font-black uppercase tracking-[0.2em] text-white';

// Brand marks, drawn inline. The icon set has an Instagram outline and a
// YouTube outline but no X logo and no WhatsApp logo, so X was the retired
// Twitter bird and WhatsApp was a generic speech bubble: two of the four read
// as the wrong company, or none. Paths are Simple Icons (CC0). Everything uses
// currentColor, so the footer's ink and hover apply to them like any link.
function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function YouTubeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

// Also used by the phone menu, so the two can never show different marks.
export const SOCIALS: Array<{ label: string; name: string; href: string; icon: (cls: string) => React.ReactNode }> = [
  { label: 'zarketplace on Instagram', name: 'Instagram', href: 'https://www.instagram.com/zarketplace', icon: (c) => <Instagram className={c} strokeWidth={1.75} /> },
  { label: 'zarketplace on X', name: 'X', href: 'https://x.com/zarketplace', icon: (c) => <XMark className={c} /> },
  { label: 'zarketplace on YouTube', name: 'YouTube', href: 'https://www.youtube.com/@zarketplace', icon: (c) => <YouTubeMark className={c} /> },
  { label: 'zarketplace on WhatsApp', name: 'WhatsApp', href: 'https://wa.me/918505927538', icon: (c) => <WhatsAppMark className={c} /> },
];

function SocialIcons() {
  return (
    <div className="flex items-center gap-6">
      {SOCIALS.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          className="flex h-11 w-11 items-center justify-center -m-3 text-white transition-colors hover:text-white/65 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        >
          {s.icon('h-5 w-5')}
        </a>
      ))}
    </div>
  );
}

export function Footer() {
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  return (
    <footer className="bg-black text-white py-16 sm:py-20">
      {/* The page column (shell-wide), not the full-bleed header width. At
          full width the five short columns either bunched on the left or,
          spread out, ran into both edges with a screen's width between them. */}
      <div className="shell-wide">
        {/* The four errands, then Connect, where the social links read as
            named links like every other column rather than four loose marks.
            Spread across the column, so the first starts over the wordmark and
            the last ends over the copyright, with even gaps between. */}
        <div className="hidden md:grid grid-cols-3 gap-x-10 gap-y-12 lg:flex lg:justify-between">
          <FooterColumnBlock column={SHOP} />
          <FooterColumnBlock column={SELLING} />
          <FooterColumnBlock column={HELP} />
          <FooterColumnBlock column={COMPANY} />
          <div className="flex flex-col gap-6">
            <h4 className={HEADER_CLASS}>Connect</h4>
            <ul className="flex flex-col gap-4">
              {SOCIALS.map((so) => (
                <li key={so.name}>
                  <a
                    href={so.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={so.label}
                    className={cn(LINK_CLASS, 'inline-flex items-center gap-2.5')}
                  >
                    {so.icon('h-4 w-4')}
                    {so.name}
                  </a>
                </li>
              ))}
            </ul>
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

        {/* Desktop bottom bar, one row: the wordmark on the left; the socials,
            a hairline, and the notice on the right. The divider is what makes
            the icons and the copyright read as two things rather than one run
            of small marks. The wordmark is the same one as the nav, so the
            page opens and closes on the same mark. */}
        <div className="hidden md:flex mt-16 pt-8 border-t border-white/10 items-center justify-between">
          <Link to="/" aria-label="zarketplace home" className="flex min-h-[44px] items-center">
            <Wordmark on="dark" heightClassName="h-8" />
          </Link>
          <div className="flex items-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">© 2026 All rights reserved.</span>
          </div>
        </div>

        {/* Mobile bottom block: mark, socials under it, then the legal line.
            Centred as one stack, so the brand and the places to find it read
            together rather than the icons hiding in an accordion above. */}
        <div className="md:hidden mt-10 pt-8 flex flex-col items-center gap-5 text-center">
          <Link to="/" className="flex min-h-[44px] items-center">
            <Wordmark on="dark" heightClassName="h-7" />
          </Link>
          <SocialIcons />
          <span className="text-[11px] font-bold uppercase tracking-widest ink-mid">© 2026 All rights reserved.</span>
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
