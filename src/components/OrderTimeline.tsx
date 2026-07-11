// Shared escrow timeline, rendered identically for buyers and sellers so the
// same "where is my money" story shows on both sides of a trade. The spine
// (Paid -> Pickup -> Delivered -> Review -> Paid Out) and its state come from
// deriveEscrowStages; the contextual line under it comes from escrowCaption.
// See src/lib/escrowTimeline.ts.
import { CreditCard, PackageCheck, Truck, ShieldCheck, Banknote, LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { deriveEscrowStages, escrowCaption, type StageKey } from '../lib/escrowTimeline';
import type { Order, SellerPayout } from '../types';

const STAGE_ICON: Record<StageKey, LucideIcon> = {
  paid: CreditCard,
  pickup: Truck,
  delivered: PackageCheck,
  review: ShieldCheck,
  paid_out: Banknote,
};

export function OrderTimeline({ order, payout, audience }: {
  order: Order;
  payout?: SellerPayout | null;
  audience: 'buyer' | 'seller';
}) {
  const stages = deriveEscrowStages(order, payout);
  const caption = escrowCaption(order, payout, audience);

  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-black/5">
      <div className="grid grid-cols-5 gap-2">
        {stages.map((stage) => {
          const Icon = STAGE_ICON[stage.key];
          const reached = stage.state === 'done' || stage.state === 'current';
          return (
            <div key={stage.key} className="flex flex-col gap-2 items-start">
              <div className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center border',
                reached ? 'bg-black text-white border-black' : 'bg-white text-black/30 border-black/10',
                stage.state === 'current' && 'ring-2 ring-black/30 ring-offset-2',
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={cn(
                'text-[9px] font-black uppercase tracking-widest leading-tight',
                reached ? 'text-black' : 'text-black/30',
              )}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
      {caption && (
        <div className="flex items-start gap-2 bg-zinc-50 border border-black/5 p-3">
          <ShieldCheck className="h-3.5 w-3.5 text-black/50 mt-0.5 shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/60 leading-relaxed">
            {caption}
          </p>
        </div>
      )}
    </div>
  );
}
