import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDocumentTitle } from '../lib/useDocumentTitle';

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
        a: 'Browse listings, open the one you want, and tap Buy It Now or Add to Cart. Complete checkout with secure payment. There\'s no DMing the seller and no negotiating price.',
      },
      {
        q: 'What happens after payment?',
        a: 'Your payment is verified, your order is confirmed, and the seller is notified to ship your item. You\'ll see this reflected in My Orders.',
      },
      {
        q: 'How do I track my order?',
        a: 'Go to My Orders to see your order\'s live status. Once the seller ships and adds tracking, the tracking link and courier details appear there too.',
      },
      {
        q: 'Can I cancel an order?',
        a: 'Yes, as long as the item hasn\'t shipped yet. Once a seller marks an order as shipped, it can no longer be cancelled.',
      },
    ],
  },
  {
    title: 'Selling',
    items: [
      {
        q: 'How do I list an item?',
        a: 'Tap Sell, upload photos, and fill in the category, size, condition, price, and shipping details. Every listing is reviewed before it goes live.',
      },
      {
        q: 'When do I get paid?',
        a: 'Ship the item and upload tracking information. Once the order is marked delivered, your payout is held for 48 hours (the buyer’s review window) and then released.',
      },
      {
        q: 'How long do I have to ship?',
        a: 'You have 72 hours from the time an item sells to ship it and upload tracking.',
      },
      {
        q: 'What happens if I miss the shipping deadline?',
        a: 'Contact support as soon as possible. Repeated missed shipping deadlines may affect your ability to keep selling on zarketplace.',
      },
    ],
  },
  {
    title: 'Trust & Safety',
    items: [
      {
        q: 'What if an item is not as described?',
        a: 'Contact us within 48 hours of delivery at contact@zarketplace.com. Our support team reviews materially misrepresented items, undisclosed damage, and wrong-item cases individually.',
      },
      {
        q: 'Are payments secure?',
        a: 'Yes. All payments are processed securely through Razorpay. zarketplace never sees or stores your card or bank details.',
      },
      {
        q: 'Does zarketplace verify listings?',
        a: 'Every listing is reviewed by our team before it\'s published and visible to buyers.',
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
  useDocumentTitle('FAQ');

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <div className="flex flex-col gap-4 mb-12">
        <h1 className="text-5xl font-black tracking-tighter uppercase">Frequently Asked Questions</h1>
        <p className="text-sm font-black uppercase tracking-widest text-black">Answers to common questions about buying, selling, and your account</p>
      </div>

      <div className="flex flex-col gap-12">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black pb-3 mb-2">
              {section.title}
            </h2>
            {section.items.map((item) => (
              <React.Fragment key={item.q}><FaqItem item={item} /></React.Fragment>
            ))}
          </div>
        ))}
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
