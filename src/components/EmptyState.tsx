// Single shared "nothing here yet" treatment, used anywhere a list or table can
// be empty (browse results, vendor items, admin queues).
//
// The headline is a micro-label and stays quiet, because in most places an
// empty list is a non-event. Where it is the whole page - a storefront with no
// stock - `detail` carries a sentence explaining what is happening, and the
// heading steps up to display type so the state reads as deliberate rather
// than as a failed query.
import * as React from 'react';
import { cn } from '../lib/utils';

export function EmptyState({ children, detail, action, className }: {
  children: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'flex min-h-[16rem] flex-col items-center justify-center gap-6 border border-black/5 bg-zinc-50 px-8 py-16 text-center sm:px-12',
      className,
    )}>
      {detail ? (
        <>
          <h2 className="max-w-[18ch] text-2xl sm:text-3xl font-black uppercase tracking-tighter leading-[0.95]">
            {children}
          </h2>
          <p className="max-w-[48ch] text-sm font-normal leading-relaxed text-black/55">{detail}</p>
        </>
      ) : (
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/30">{children}</p>
      )}
      {action}
    </div>
  );
}
