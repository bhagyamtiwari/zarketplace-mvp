// Single shared "nothing here yet" treatment, used anywhere a list/table can
// be empty (browse results, seller listings/orders/payouts, admin queues).
import * as React from 'react';
import { cn } from '../lib/utils';

export function EmptyState({ children, action, className }: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'flex min-h-[16rem] flex-col items-center justify-center gap-6 border border-black/5 bg-zinc-50 p-12 text-center',
      className,
    )}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/30">{children}</p>
      {action}
    </div>
  );
}
