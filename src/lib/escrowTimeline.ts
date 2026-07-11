// Escrow lifecycle, derived for display. The order state machine and the
// seller_payouts ledger are the source of truth (see
// docs/REALIGNMENT_PLAN.md and migration 20260710000001); this module turns
// that data into a single, honest timeline that makes escrow visible to both
// buyers and sellers:
//
//   Paid -> Pickup -> Delivered -> Review -> Paid Out
//
// The spine is the same for both audiences (the money takes one journey); only
// the captions differ. Pickup maps to today's "shipped" step - the seller hands
// the item to the courier - and stays label-stable once Shiprocket books the
// pickup automatically.
import { formatCurrency } from './utils';
import type { Order, SellerPayout } from '../types';

export type StageKey = 'paid' | 'pickup' | 'delivered' | 'review' | 'paid_out';
export type StageState = 'done' | 'current' | 'upcoming';

export interface EscrowStage {
  key: StageKey;
  label: string;
  state: StageState;
}

const STAGE_LABELS: Record<StageKey, string> = {
  paid: 'Paid',
  pickup: 'Pickup',
  delivered: 'Delivered',
  review: 'Review',
  paid_out: 'Paid Out',
};

// Statuses where the escrow timeline doesn't apply - the order never entered
// (or left) the protected-payment flow. Callers should show a status badge
// instead of a timeline for these.
const NON_TIMELINE = new Set(['payment_failed', 'payment_conflict', 'cancelled', 'refunded']);

export function hasEscrowTimeline(order: Order): boolean {
  return !NON_TIMELINE.has(order.status);
}

export function deriveEscrowStages(order: Order, payout?: SellerPayout | null): EscrowStage[] {
  const paid = order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered';
  const shipped = order.status === 'shipped' || order.status === 'delivered' || !!order.shipped_at;
  const delivered = order.status === 'delivered' || !!order.delivered_at;
  const paidOut = payout?.status === 'paid_out';
  const reviewClosed =
    delivered &&
    !order.claim_open &&
    !!order.review_ends_at &&
    new Date(order.review_ends_at).getTime() <= Date.now();

  const state = (done: boolean, current: boolean): StageState =>
    done ? 'done' : current ? 'current' : 'upcoming';

  return [
    { key: 'paid', label: STAGE_LABELS.paid, state: state(paid, !paid) },
    { key: 'pickup', label: STAGE_LABELS.pickup, state: state(shipped, paid && !shipped) },
    { key: 'delivered', label: STAGE_LABELS.delivered, state: state(delivered, shipped && !delivered) },
    { key: 'review', label: STAGE_LABELS.review, state: state(paidOut || reviewClosed, delivered && !reviewClosed && !paidOut) },
    { key: 'paid_out', label: STAGE_LABELS.paid_out, state: state(paidOut, reviewClosed && !paidOut) },
  ];
}

function reviewDeadline(order: Order): string | null {
  if (!order.review_ends_at) return null;
  return new Date(order.review_ends_at).toLocaleDateString();
}

// One contextual line explaining where the money is right now, in the reader's
// own terms. This is what makes escrow "visibly real" - not just a row of dots.
export function escrowCaption(
  order: Order,
  payout: SellerPayout | null | undefined,
  audience: 'buyer' | 'seller',
): string {
  const stages = deriveEscrowStages(order, payout);
  const current = stages.find((s) => s.state === 'current');
  const deadline = reviewDeadline(order);
  const paidOut = payout?.status === 'paid_out';

  if (paidOut) {
    return audience === 'buyer'
      ? 'Complete. The seller has been paid and this order is closed.'
      : `Paid out${payout?.paid_at ? ` on ${new Date(payout.paid_at).toLocaleDateString()}` : ''}. This order is closed.`;
  }

  const key = current?.key ?? 'paid_out';
  if (audience === 'buyer') {
    switch (key) {
      case 'paid':
        // 'paid' is the current stage only while payment is still clearing.
        return "We're confirming your payment. Once it clears, we hold it in escrow until your item is delivered - nothing goes to the seller before then.";
      case 'pickup':
        return 'Payment secured. The item is being packed and picked up. Your money stays protected until it reaches you.';
      case 'delivered':
        return 'On its way. Your payment stays in escrow until the courier confirms delivery.';
      case 'review':
        return deadline
          ? `Delivered. You have until ${deadline} to flag any problem before the seller is paid.`
          : 'Delivered. You have a 48-hour window to flag any problem before the seller is paid.';
      case 'paid_out':
        return 'Review window closed with no issues raised. The seller is being paid.';
    }
  } else {
    const amount = formatCurrency(Number(order.amount));
    switch (key) {
      case 'paid':
        // 'paid' is the current stage only while payment is still clearing.
        return `Payment is being confirmed. Once it clears, it's held in escrow and your ${amount} payout releases after delivery.`;
      case 'pickup':
        return `Payment held in escrow. Pack the item and hand it to the courier - your ${amount} payout releases after delivery.`;
      case 'delivered':
        return `In transit. Your ${amount} payout is held in escrow until delivery is confirmed.`;
      case 'review':
        return deadline
          ? `Delivered. Your ${amount} payout is held until ${deadline}, then released if no claim is open.`
          : `Delivered. Your ${amount} payout is held for the 48-hour review window, then released if no claim is open.`;
      case 'paid_out':
        return `Review window closed. Your ${amount} payout is cleared and will be sent to your UPI shortly.`;
    }
  }
  return '';
}
