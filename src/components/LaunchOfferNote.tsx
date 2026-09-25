// The launch offer, in one place so the sell page and the vendor portal say
// it identically. It is announced copy and nothing more: no counter, no
// balance and no code in the product. We watch acceptances ourselves and
// email the code, which is why it says we send it rather than telling anyone
// to claim it.
//
// An inverted panel in the house band voice (see CampaignBand): the reward in
// display type, the condition under it as tracked uppercase body, Sparkles
// because that is the offers icon in the kit. It was a hairline box with two
// lines of small text in it, which read as a disclaimer sat above the page
// rather than the one promotional thing on it.
//
// It leads with the money because that is the hook, and because money in
// display type is what the rest of this flow already does.
//
// Worded to MODEL.md and COPY_RULES.md: a vendor sends us items and accepts
// our offers, they never "list", and the reward is a rupee amount off a
// purchase, never a share or a percentage of anything.
import { Sparkles } from 'lucide-react';
import { LAUNCH_OFFER_TERMS } from '../lib/launchOffer';
import { cn } from '../lib/utils';

export { LAUNCH_OFFER } from '../lib/launchOffer';

export function LaunchOfferNote({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'flex w-full max-w-xl flex-col gap-2.5 bg-black px-5 py-5 text-white sm:px-7 sm:py-6',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/60">
        <Sparkles aria-hidden className="h-3.5 w-3.5" />
        Launch offer
      </span>
      <p className="text-2xl font-black uppercase leading-[0.9] tracking-tighter sm:text-3xl">
        {LAUNCH_OFFER_TERMS.reward}
      </p>
      <p className="text-[11px] font-bold uppercase leading-[1.7] tracking-[0.15em] text-white/70 sm:text-xs">
        {LAUNCH_OFFER_TERMS.condition}
      </p>
    </aside>
  );
}
