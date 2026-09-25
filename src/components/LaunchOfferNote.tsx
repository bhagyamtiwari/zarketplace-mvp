// The launch offer, in one place so the sell page and the vendor portal say
// it identically. It is announced copy and nothing more: no counter, no
// balance and no code in the product. We watch acceptances ourselves and
// email the code, which is why it says we send it rather than telling anyone
// to claim it.
//
// One compact strip, sat at the top of both pages rather than in the body.
// An offer nobody sees until they scroll is not an offer, and at this length
// it can lead a page without taking it over.
//
// Worded to MODEL.md and COPY_RULES.md: a vendor accepts our offers, they do
// not list items, and the reward is a rupee amount off a purchase, never a
// share or a percentage of anything.
import { cn } from '../lib/utils';

/** The threshold and the amount, together, so the two never drift apart. */
export const LAUNCH_OFFER = { acceptedOffers: 10, credit: 500 } as const;

export function LaunchOfferNote({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'flex w-full flex-col gap-1.5 self-start border border-black px-4 py-3',
        'sm:w-auto sm:flex-row sm:items-baseline sm:gap-3',
        className,
      )}
    >
      <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.2em]">Launch offer</span>
      <span className="text-sm leading-snug">
        Accept {LAUNCH_OFFER.acceptedOffers} offers and we email you{' '}
        <span className="font-bold">Rs. {LAUNCH_OFFER.credit} off</span> your next order.
      </span>
    </aside>
  );
}
