// The launch offer, in one place so the sell page and the vendor portal say
// it identically. It is announced copy and nothing more: no counter, no
// balance and no code in the product. We watch acceptances ourselves and
// email the code, which is why the card says we send it rather than telling
// anyone to claim it.
//
// Worded to MODEL.md and COPY_RULES.md: a vendor accepts our offers, they do
// not list items, and the reward is a rupee amount off a purchase, never a
// share or a percentage of anything.
import { cn } from '../lib/utils';

/** The threshold and the amount, together, so the two never drift apart. */
export const LAUNCH_OFFER = { acceptedOffers: 10, credit: 500 } as const;

export function LaunchOfferNote({ className }: { className?: string }) {
  return (
    <aside className={cn('flex max-w-2xl flex-col gap-3 border border-black p-5 sm:p-6', className)}>
      <span className="text-[11px] font-black uppercase tracking-[0.2em]">Launch offer</span>
      <p className="text-[15px] font-bold leading-snug">
        Accept {LAUNCH_OFFER.acceptedOffers} offers and get Rs. {LAUNCH_OFFER.credit} off anything you
        buy from zarketplace.
      </p>
      <p className="text-sm leading-relaxed">
        There is nothing to claim. We email you the code once your{' '}
        {LAUNCH_OFFER.acceptedOffers}th offer is accepted. One code per vendor, while we are
        getting started.
      </p>
    </aside>
  );
}
