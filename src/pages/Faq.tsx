import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePageMeta, META } from '../lib/pageMeta';

interface QA {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  items: QA[];
}

const SECTIONS: FaqSection[] = [
  {
    title: 'Buying',
    items: [
      {
        q: 'How do I buy an item?',
        a: 'Browse listings, open the one you want, and tap Buy It Now or Add to Cart. Complete checkout with secure payment. Every item is sold and shipped by zarketplace, so there is nobody to DM and no price to negotiate.',
      },
      {
        q: 'What happens after payment?',
        a: 'Your payment is verified and your order is confirmed. We bring the item in to our hub, check it, repack it, and ship it out to you. You will see each step reflected in My Orders.',
      },
      {
        q: 'How do I track my order?',
        a: 'Go to My Orders to see your order\'s live status. Once we ship your item, the tracking link and courier details appear there too.',
      },
      {
        q: 'Can I cancel an order?',
        a: 'Yes, as long as the item has not shipped yet. Once we have dispatched it to you, it can no longer be cancelled.',
      },
    ],
  },
  {
    title: 'Selling to us',
    items: [
      {
        q: 'How do I sell an item?',
        a: 'Tap Get an offer, upload photos, and fill in the category, size, condition, your asking price, and the shipping category. We come back with what we will pay for it. If you accept, the item goes live and that number is locked.',
      },
      {
        q: 'When do I get paid?',
        a: 'Once your item reaches our hub and we accept it, we pay you the amount you agreed to when you listed it. That payout is ours to make and does not depend on anything that happens afterwards.',
      },
      {
        q: 'How long do I have to send it?',
        a: 'You have 72 hours from the time your item is bought to pack it and hand it off. We send you a prepaid label and book the courier, so you never arrange a pickup, buy a label, or pay for the shipping to our hub.',
      },
      {
        q: 'What happens if I miss the pickup deadline?',
        a: 'Contact support as soon as possible. Repeated missed pickup deadlines may affect whether we keep buying from you.',
      },
    ],
  },
  {
    title: 'Trust & Safety',
    items: [
      {
        q: 'What if an item is not as described?',
        a: 'Contact us within 48 hours of delivery at contact@zarketplace.com. We sold you the item, so you are dealing with us directly. Our support team reviews materially misrepresented items, undisclosed damage, and wrong-item cases individually.',
      },
      {
        q: 'Are payments secure?',
        a: 'Yes. All payments are processed securely through Razorpay. zarketplace never sees or stores your card or bank details.',
      },
      {
        q: 'Does zarketplace check items?',
        a: 'Every listing is reviewed by our team before it is published. Every item then comes in to our hub, where we check it against its listing and photos and check its condition, before we repack it and ship it out. Anything that does not match does not ship.',
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        q: 'How do I update my profile?',
        a: 'Go to My Profile to update your full name and phone number at any time.',
      },
      {
        q: 'How do I update payout information?',
        a: 'Update your UPI ID in My Profile. It will automatically prefill on any new listing you create. Listings you\'ve already submitted keep the UPI ID entered at that time, since it\'s locked in for payout safety.',
      },
    ],
  },
];

export function Faq() {
  usePageMeta(META.faq);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to zarketplace
      </Link>

      <div className="flex flex-col">

        <div className="flex-1 min-w-0 max-w-3xl">
          <div className="flex flex-col gap-4 mb-12">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Frequently Asked Questions</h1>
            <p className="text-sm font-black uppercase tracking-widest text-black">Answers to common questions about buying, selling to us, and your account</p>
          </div>

          <div className="flex flex-col gap-12">
            {SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-3">
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-black/40 border-b border-black pb-3 mb-2">
                  {section.title}
                </h2>
                {section.items.map((item) => (
                  <React.Fragment key={item.q}><FaqItem item={item} /></React.Fragment>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ item }: { item: QA }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={cn('flex flex-col gap-2 p-6 bg-zinc-50 border border-black/5 transition-colors', open && 'bg-zinc-100')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <span className="text-lg font-black uppercase tracking-tight text-black">{item.q}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform text-black/40', open && 'rotate-180')} />
      </button>
      {open && (
        <p className="text-[10px] font-medium uppercase tracking-widest leading-relaxed text-black/60">
          {item.a}
        </p>
      )}
    </div>
  );
}
