// Single shared visual treatment for order status. Three audiences:
//   buyer  - buyer-facing copy
//   seller - seller-facing copy (sellers are users, never shown raw enums)
//   admin  - the raw status, because operators want exact state
// All render as plain typography - weight and underline carry the signal, not
// color or a pill background (see BrandKit: no colored status pills).
import { cn } from '../lib/utils';
import { buyerStatusLabel, sellerStatusLabel } from '../lib/orderStatus';
import type { OrderStatus } from '../types';

const NEEDS_ATTENTION: Partial<Record<OrderStatus, boolean>> = {
  payment_failed: true,
  payment_conflict: true,
};

export function StatusBadge({ status, audience = 'admin', className }: {
  status: OrderStatus;
  audience?: 'buyer' | 'seller' | 'admin';
  className?: string;
}) {
  const label =
    audience === 'buyer' ? buyerStatusLabel(status)
    : audience === 'seller' ? sellerStatusLabel(status)
    : status.replace(/_/g, ' ');
  return (
    <span className={cn(
      'self-start text-[10px] font-black uppercase tracking-widest whitespace-nowrap text-black',
      NEEDS_ATTENTION[status] && 'underline',
      className,
    )}>
      {label}
    </span>
  );
}
