// Buyer-facing copy for order statuses. Internal status names (awaiting_payment,
// awaiting_verification, paid, shipped, etc.) are an implementation detail and
// should never be shown to a buyer directly - use buyerStatusLabel everywhere
// a buyer sees their own order status.
import type { OrderStatus } from '../types';

export function buyerStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_payment':
    case 'awaiting_verification':
      return 'Confirming your payment';
    case 'paid':
      return 'Order confirmed, seller is packing it up';
    case 'shipped':
      return 'On its way';
    case 'payment_failed':
      return 'Payment failed';
    case 'payment_conflict':
      return 'Refund in progress';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Processing';
  }
}
