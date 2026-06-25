// Single shared visual treatment for order status. Buyer-facing and
// operator-facing (seller/admin) contexts show different label text (buyer
// copy vs raw status), but both render as plain typography - weight and
// underline carry the signal, not color or a pill background.
import { cn } from '../lib/utils';
import { buyerStatusLabel } from '../lib/orderStatus';
import type { OrderStatus } from '../types';

const NEEDS_ATTENTION: Partial<Record<OrderStatus, boolean>> = {
  payment_failed: true,
  payment_conflict: true,
};

export function StatusBadge({ status, audience = 'seller', className }: {
  status: OrderStatus;
  audience?: 'buyer' | 'seller';
  className?: string;
}) {
  const label = audience === 'buyer' ? buyerStatusLabel(status) : status.replace(/_/g, ' ');
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
