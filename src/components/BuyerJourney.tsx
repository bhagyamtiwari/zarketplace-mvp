// The three steps a buyer sees.
//
// Received at zarketplace -> Checked & repacked -> Shipped to you.
//
// There is no fourth step for the inbound leg and there is no origin. From the
// buyer's side the item was always ours: where it came from, and that anyone
// else was involved, is not part of their order. Anything before we have the
// item reads as "preparing", which is true and complete.

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

export type BuyerStage =
  | 'preparing' | 'received_at_zarketplace' | 'checked_and_repacked'
  | 'shipped' | 'delivered' | 'cancelled';

const STEPS: Array<{ key: BuyerStage; label: string; detail: string }> = [
  { key: 'received_at_zarketplace', label: 'Received at zarketplace', detail: 'Your item is with us.' },
  { key: 'checked_and_repacked', label: 'Checked & repacked', detail: 'Checked against its listing and repacked.' },
  { key: 'shipped', label: 'Shipped to you', detail: 'On its way.' },
];

const ORDER: BuyerStage[] = [
  'preparing', 'received_at_zarketplace', 'checked_and_repacked', 'shipped', 'delivered',
];

export function BuyerJourney({ stage }: { stage: BuyerStage }) {
  if (stage === 'cancelled') return null;

  const reached = (key: BuyerStage) => ORDER.indexOf(stage) >= ORDER.indexOf(key);

  return (
    <div className="flex flex-col gap-6">
      <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
        Your order
      </span>

      {stage === 'preparing' && (
        <p className="body-copy text-black/60">
          We are preparing your order. You will see it move here as it goes.
        </p>
      )}

      <ol className="flex flex-col">
        {STEPS.map((step) => {
          const done = reached(step.key);
          const current = stage === step.key || (stage === 'delivered' && step.key === 'shipped');
          return (
            <li key={step.key} className="flex gap-5 border-t border-black/10 last:border-b py-6">
              <span className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border',
                done ? 'border-black bg-black text-white' : 'border-black/20',
              )}>
                {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="flex flex-col gap-1 min-w-0">
                <span className={cn(
                  'text-xs font-black uppercase tracking-widest',
                  done ? 'text-black' : 'text-black/30',
                )}>
                  {step.label}
                </span>
                <span className="text-xs font-medium leading-relaxed text-black/50">
                  {current && stage === 'delivered' ? 'Delivered.' : step.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
