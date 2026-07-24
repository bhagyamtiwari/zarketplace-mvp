// Buyer-facing copy for order statuses. Internal status names (awaiting_payment,
// awaiting_verification, paid, shipped, etc.) are an implementation detail and
// should never be shown to a buyer directly - use buyerStatusLabel everywhere
// a buyer sees their own order status.
import type { OrderStatus } from '../types';

// Seller-facing copy for order statuses. Sellers are users, not operators -
// they should never see raw enum names either. Framed from the seller's side
// of the transaction (what they need to do / what is happening to their sale).
export function sellerStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_payment':
    case 'awaiting_verification':
      return 'Confirming buyer payment';
    case 'paid':
      return 'Paid, ready to pack';
    case 'shipped':
      return 'On its way to the buyer';
    case 'delivered':
      return 'Delivered';
    case 'payment_failed':
      return 'Buyer payment failed';
    case 'payment_conflict':
      return 'Refunding the buyer';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Processing';
  }
}

// Seller-facing copy for their own listing's moderation state.
export function listingStatusLabel(status: string, isSold: boolean): string {
  if (isSold) return 'Sold';
  switch (status) {
    case 'pending': return 'In review';
    case 'approved': return 'Live';
    case 'rejected': return 'Not approved';
    case 'suspended': return 'Suspended';
    case 'archived': return 'Archived';
    default: return status;
  }
}

// Human-readable label for the fine-grained Shiprocket shipment sub-state
// (orders.shipment_status). Returns null when there is nothing meaningful to
// show, so callers fall back to the coarse order status.
export function shipmentStatusLabel(shipmentStatus: string | null | undefined): string | null {
  switch (shipmentStatus) {
    case 'pickup_scheduled': return 'Pickup scheduled';
    case 'picked_up': return 'Picked up';
    case 'in_transit': return 'In transit';
    case 'out_for_delivery': return 'Out for delivery';
    case 'delivered': return 'Delivered';
    case 'rto': return 'Returning to seller';
    case 'ndr': return 'Delivery attempt failed';
    case 'cancelled': return 'Shipment cancelled';
    default: return null;
  }
}

export function buyerStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_payment':
    case 'awaiting_verification':
      return 'Confirming your payment';
    case 'paid':
      return 'Order confirmed, seller is packing it up';
    case 'shipped':
      return 'On its way';
    case 'delivered':
      return 'Delivered';
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
