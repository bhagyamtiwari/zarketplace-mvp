import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Instagram } from 'lucide-react';
import { WhatsAppMark } from '../components/Footer';
import { usePageMeta, META } from '../lib/pageMeta';

// The three places a person actually answers. One shape each, so the rows are
// interchangeable and nothing looks more official than the rest.
const CHANNELS: Array<{
  label: string;
  value: string;
  /** A second line under the value, for the number behind a vanity number. */
  detail?: string;
  href: string;
  external?: boolean;
  icon: (cls: string) => React.ReactNode;
}> = [
  { label: 'Email', value: 'contact@zarketplace.com', href: 'mailto:contact@zarketplace.com', icon: (c) => <Mail className={c} strokeWidth={1.75} /> },
  { label: 'Instagram', value: '@zarketplace', href: 'https://instagram.com/zarketplace', external: true, icon: (c) => <Instagram className={c} strokeWidth={1.75} /> },
  // ZARKET on a phone keypad is 927538, so the vanity form dials the real
  // number. The digits stay underneath for anyone typing it in by hand.
  { label: 'WhatsApp', value: '8505-ZARKET', detail: '+91 85059 27538', href: 'https://wa.me/918505927538', external: true, icon: (c) => <WhatsAppMark className={c} /> },
];

export function Contact() {
  usePageMeta(META.contact);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/browse" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black hover:text-black/80 mb-8 lg:mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to browse
      </Link>

      <div className="flex flex-col">

        <div className="flex flex-col gap-12 flex-1 min-w-0">
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tighter uppercase">Get in touch</h1>
          <p className="body-longform">
            A person answers all three. Email is best for anything about an order, since
            we can look it up while we reply.
          </p>
        </div>

        {/* Three ways to reach a person, and nothing else.
        
            There was a contact form here whose submit button read "Form
            Temporarily Paused" and whose helper text asked you to email instead.
            A form that cannot be sent is worse than no form: it takes the
            effort of filling in before it tells you it will not work. The email
            address it was redirecting to is the first row below. */}
        <div className="flex flex-col">
          {CHANNELS.map((c) => (
            <a
              key={c.label}
              href={c.href}
              {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="group flex items-center gap-5 border-t border-black/10 py-6 last:border-b"
            >
              {/* Fixed square, so the three icons sit on one vertical line and
                  every label starts at the same x. */}
              <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-black/15 transition-colors group-hover:border-black group-hover:bg-black group-hover:text-white">
                {c.icon('h-5 w-5')}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] ink-mid">{c.label}</span>
                {c.detail ? (
                  <>
                    <span className="text-xl font-black uppercase tracking-tight text-black">{c.value}</span>
                    <span className="text-sm ink-mid tabular-nums">{c.detail}</span>
                  </>
                ) : (
                  <span className="text-sm font-bold text-black break-words">{c.value}</span>
                )}
              </span>
            </a>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
