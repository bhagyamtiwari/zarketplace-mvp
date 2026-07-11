// TEMPORARY QA harness - NOT committed. Renders OrderTimeline across every
// escrow state for both audiences so the timeline, review-window states, and
// payout messaging can be eyeballed on mobile without auth or seeded orders.
import { OrderTimeline } from '../components/OrderTimeline';
import type { Order, SellerPayout } from '../types';

const base: Partial<Order> = {
  id: 'x', order_number: 'ZKT-1001', listing_title: 'Vintage Denim Jacket',
  amount: 2400, shipping_cost: 120, buyer_protection_fee: 100, total_amount: 2620,
  claim_open: false, shipped_at: null, delivered_at: null, review_ends_at: null,
};

const future = new Date(Date.now() + 40 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

const cases: { label: string; order: Order; payout?: SellerPayout | null }[] = [
  { label: 'awaiting_verification (payment clearing)', order: { ...base, status: 'awaiting_verification' } as Order },
  { label: 'paid (held in escrow, awaiting pickup)', order: { ...base, status: 'paid' } as Order },
  { label: 'shipped (in transit)', order: { ...base, status: 'shipped', shipped_at: past } as Order },
  { label: 'delivered + review window OPEN', order: { ...base, status: 'delivered', shipped_at: past, delivered_at: past, review_ends_at: future } as Order,
    payout: { id: 'p', seller_id: 's', order_id: 'x', amount: 2400, status: 'awaiting_payout', releasable_at: future, created_at: past, paid_at: null } },
  { label: 'delivered + review CLOSED (ready for payout)', order: { ...base, status: 'delivered', shipped_at: past, delivered_at: past, review_ends_at: past } as Order,
    payout: { id: 'p', seller_id: 's', order_id: 'x', amount: 2400, status: 'awaiting_payout', releasable_at: past, created_at: past, paid_at: null } },
  { label: 'paid_out (closed)', order: { ...base, status: 'delivered', shipped_at: past, delivered_at: past, review_ends_at: past } as Order,
    payout: { id: 'p', seller_id: 's', order_id: 'x', amount: 2400, status: 'paid_out', releasable_at: past, created_at: past, paid_at: past } },
];

export function QaTimeline() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-24 pb-20 flex flex-col gap-12">
      {(['buyer', 'seller'] as const).map((audience) => (
        <div key={audience} className="flex flex-col gap-6">
          <h1 className="text-3xl font-black uppercase tracking-tighter">{audience} view</h1>
          {cases.map((c) => (
            <div key={c.label} className="border border-black/10 bg-white p-5 flex flex-col gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600">{c.label}</span>
              <OrderTimeline order={c.order} payout={c.payout} audience={audience} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
