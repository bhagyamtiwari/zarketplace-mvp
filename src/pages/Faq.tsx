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
        a: 'Yes, as long as the item has not shipped yet. Email contact@zarketplace.com with your order number. Once we have dispatched it to you, it can no longer be cancelled.',
      },
    ],
  },
  {
    title: 'Selling to us',
    items: [
      {
        q: 'How do I sell an item?',
        a: 'Tap Get an offer, upload photos, and fill in the category, size and condition. Within 24 hours we come back with an offer: a fixed amount we will pay you. If you accept, that number is locked and the item goes live at our price. It stays with you until somebody buys it, then we send a prepaid label and a courier collects from your door.',
      },
      {
        q: 'When do I get paid?',
        a: 'Once your item reaches our hub and we accept it, we pay you the amount you agreed to when you accepted our offer. That payout is ours to make and does not depend on anything that happens afterwards.',
      },
      {
        q: 'How long do I have to send it?',
        a: 'Once your item is bought, we email you a prepaid label. Print it and attach it to the parcel. A courier will collect it from your door, usually within 48 hours, and it must be handed over within 5 days. We pay for shipping. If it does not go in that time we cancel the order and refund the buyer.',
      },
      {
        q: 'What happens if I miss the pickup deadline?',
        a: 'Contact support as soon as possible. Repeated missed pickup deadlines may affect whether we keep buying from you.',
      },
      {
        q: 'Do I send the item as soon as I accept?',
        a: 'No. This is the part people most often get wrong. The item stays with you until someone buys it. All we ask in between is that you keep it packed and unworn, in the condition you described, and watch your email for your shipping label.',
      },
      {
        q: 'Can I change my mind after accepting?',
        a: 'Yes, until someone buys it. Withdraw your item from your vendor portal and it comes off the site straight away. Your offer ends, there is no charge, and you can send it to us again later. Once it has been bought, it can no longer be withdrawn.',
      },
      {
        q: 'How long is my offer open, and how long is my item on the site?',
        a: 'Two different clocks. You have 7 days to accept an offer before it lapses. Once you accept, your item is on the site for 30 days. If we have not sold it by then, or you withdraw it, your offer ends. Nothing is owed either way, and you are welcome to send it to us again.',
      },
      {
        q: 'Why do you email asking if I still have it?',
        a: 'Because we cannot sell something we are not sure is still there. Every couple of weeks we send one question with two buttons, yes or no. It takes a second. If we ask twice and hear nothing, we take it off the site. Saying no costs you nothing.',
      },
      {
        q: 'What if my item does not match what I described?',
        a: 'It depends how far out it is. A small difference we can describe honestly, we take the item and pay you in full. A real difference, in what the item is, its size or its condition, we can refuse and no payout is due, though you can have it back if you cover the return postage. A fake means we keep it, pay nothing, and stop buying from you.',
      },
    ],
  },
  {
    title: 'Trust & Safety',
    items: [
      {
        q: 'What if an item is not as described?',
        a: 'Contact us within 7 days of delivery at contact@zarketplace.com. We sold you the item, so you are dealing with us directly. Our support team reviews materially misrepresented items, undisclosed damage, and wrong-item cases individually.',
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
        a: 'Go to My Profile to change your name. Your email and phone are how we reach you about an order, so to change either, write to us and we will do it.',
      },
      {
        q: 'How do I update payout information?',
        a: 'Add your UPI ID in My Profile. It locks after your first sale to us, so money is never sent somewhere new by mistake. To change it after that, write to us.',
      },
    ],
  },
];

export function Faq() {
  usePageMeta(META.faq);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      <div className="flex flex-col">

        {/* The accordion spans the shell. It was capped at max-w-3xl inside a
            max-w-6xl page, so every row stopped two thirds of the way across
            and the heading above it did not. */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-4 mb-8">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Frequently Asked Questions</h1>
          </div>

          <div className="flex flex-col">
            {SECTIONS.map((section) => (
              <React.Fragment key={section.title}><FaqTopic section={section} /></React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// A topic is a dropdown, closed to start, so the page opens as four
// headings and you pick the one you came for. Open one and every answer
// under it is already showing: one click to all of them, not one per question.
function FaqTopic({ section }: { section: (typeof SECTIONS)[number] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-col border-b border-black">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-6 text-left"
      >
        <h2 className="text-xl font-black uppercase tracking-tight text-black">{section.title}</h2>
        <ChevronDown className={cn('h-5 w-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        // Inside an open topic every answer is simply there: question in
        // bold, answer under it, a hairline between. The topic is the one
        // thing you open; the questions are not a second layer of buttons.
        <dl className="flex flex-col pb-8">
          {section.items.map((item) => (
            <div key={item.q} className="flex flex-col gap-1.5 border-t border-black/10 py-5 first:border-t-0 first:pt-0">
              <dt className="text-[15px] font-bold leading-snug">{item.q}</dt>
              <dd className="text-sm leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

