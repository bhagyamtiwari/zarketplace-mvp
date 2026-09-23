import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

// The three places a person actually answers. One shape each, so the rows are
// interchangeable and nothing looks more official than the rest.
const CHANNELS: Array<{
  label: string;
  value: string;
  /** A second line under the value, for the number behind a vanity number. */
  detail?: string;
  href?: string;
  external?: boolean;
}> = [
  { label: 'Email', value: 'contact@zarketplace.com', href: 'mailto:contact@zarketplace.com' },
  { label: 'Instagram', value: '@zarketplace', href: 'https://instagram.com/zarketplace', external: true },
  // ZARKET on a phone keypad is 927538, so the vanity form dials the real
  // number. The digits stay underneath for anyone typing it in by hand.
  { label: 'WhatsApp', value: '8505-ZARKET', detail: '+91 85059 27538', href: 'https://wa.me/918505927538', external: true },
  // For post. Same wording as the registered office on the Terms page, and it
  // changes there too once the new address is settled.
  { label: 'Address', value: 'Temporarily relocating. Email us and we will send you our current postal address.' },
];

export function Contact() {
  usePageMeta(META.contact);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      {/* Same frame as every other info page: one column, the same fade,
          the same gap under the heading, body text in .body-longform. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Contact Us</h1>
        </div>

        <div className="flex flex-col gap-8 text-black body-longform">
          <p>
            A person answers email, Instagram and WhatsApp. Email is best for anything about an order, since
            we can look it up while we reply.
          </p>

          {/* Three ways to reach a person, and nothing else. Set exactly like
              the Grievance Officer details: bold label over the value, two by
              two where there is room, no icon tiles.

              There was a contact form here whose submit button read "Form
              Temporarily Paused" and whose helper text asked you to email instead.
              A form that cannot be sent is worse than no form: it takes the
              effort of filling in before it tells you it will not work. The email
              address it was redirecting to is the first row below. */}
          <dl className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <div key={c.label} className="flex flex-col gap-1">
                <dt className="font-bold">{c.label}</dt>
                <dd>
                  {c.href ? (
                    <a
                      href={c.href}
                      {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="underline underline-offset-4"
                    >
                      {c.value}
                    </a>
                  ) : c.value}
                  {c.detail && <span className="tabular-nums"> ({c.detail})</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.div>
    </div>
  );
}
