// Client-side mirror of the pricing config that the server trigger uses to
// charge (see migration 20260710000002). The buyer is always CHARGED the
// server-derived orders.total_amount; this module only computes the same
// numbers for DISPLAY so the checkout summary matches what will be charged.
//
// The formula here must stay identical to compute_buyer_protection_fee() in
// SQL: fee = max(floor, round(percent% x price)), optionally capped, whole
// rupees. If the pricing_config row can't be read (e.g. the migration hasn't
// been applied yet), we return a null config and callers show no fee - which
// exactly matches the server, since the trigger only adds the fee once the
// config exists.
import { supabase } from './supabase';
import { log } from './log';

const plog = log('pricing');

export interface PricingConfig {
  buyer_protection_percent: number;
  buyer_protection_floor: number;
  buyer_protection_cap: number | null;
}

// undefined = not fetched yet; null = fetched but unavailable.
let cached: PricingConfig | null | undefined;
let inflight: Promise<PricingConfig | null> | null = null;

export async function getPricingConfig(): Promise<PricingConfig | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('buyer_protection_percent, buyer_protection_floor, buyer_protection_cap')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      cached = (data as PricingConfig | null) ?? null;
    } catch (err) {
      // Table missing (migration not applied) or transient error - degrade to
      // "no fee shown" rather than blocking the page.
      plog.warn('pricing_config unavailable, hiding buyer protection line', err);
      cached = null;
    } finally {
      inflight = null;
    }
    return cached;
  })();
  return inflight;
}

// Buyer Protection fee for a single item price. Mirrors the SQL exactly.
export function buyerProtectionFee(itemPrice: number, cfg: PricingConfig | null): number {
  if (!cfg || !(itemPrice > 0)) return 0;
  let fee = Math.max(
    cfg.buyer_protection_floor,
    Math.round((cfg.buyer_protection_percent / 100) * itemPrice),
  );
  if (cfg.buyer_protection_cap != null) fee = Math.min(cfg.buyer_protection_cap, fee);
  return fee;
}

// Shipping v1 (§0.3): buyer always pays a flat, category-based rate chosen
// by the seller at listing time. zarketplace buys the prepaid label for
// that rate once the buyer pays - the seller never arranges or pays for
// shipping. See migration 20260710000004 for the server-side mirror.
export interface ShippingCategory {
  key: string;
  label: string;
  rate: number;
}

// Emergency fallback so the shipping selector (and the seller/listing form)
// can never be permanently blocked by a failed or hung network read. This
// MUST mirror the LIVE shipping_categories.rate values, which have been
// repriced since the 20260710000004 seed and no longer match any migration
// file in this repo. Verify against production before editing:
//   curl "$VITE_SUPABASE_URL/rest/v1/shipping_categories?select=key,rate" \
//     -H "apikey: $VITE_SUPABASE_ANON_KEY"
// The database remains the source of truth: this is only used when the read
// fails or times out, and the amount actually charged is always the
// server-derived orders.total_amount, never these display values. But a stale
// value here quotes a seller a shipping deduction we do not actually charge.
//
// Rates set 2026-07-29 from measured Shiprocket surface quotes (Delhi ->
// Mumbai/Bengaluru, zone C, the lane most orders actually take), priced at
// cost plus a thin buffer. See docs/SHIPPING.md for the cost table.
const FALLBACK_SHIPPING_CATEGORIES: ShippingCategory[] = [
  { key: 'accessories', label: 'Accessories & Small Items', rate: 99 },
  { key: 'tops', label: 'T-Shirts & Tops', rate: 149 },
  { key: 'bottoms', label: 'Jeans & Bottoms', rate: 149 },
  { key: 'footwear', label: 'Footwear', rate: 249 },
  { key: 'outerwear', label: 'Jackets & Heavy Items', rate: 259 },
];

// supabase-js can hang indefinitely when its session lock can't be acquired
// (see the lock workaround in lib/supabase.ts). A hung read would otherwise
// leave the category selector stuck on "Loading…" forever, so cap the wait.
const SHIPPING_FETCH_TIMEOUT_MS = 6000;

let shippingCache: ShippingCategory[] | undefined;
let shippingInflight: Promise<ShippingCategory[]> | null = null;

export async function getShippingCategories(): Promise<ShippingCategory[]> {
  if (shippingCache !== undefined) return shippingCache;
  if (shippingInflight) return shippingInflight;
  shippingInflight = (async () => {
    try {
      const query = supabase
        .from('shipping_categories')
        .select('key, label, rate')
        .order('sort_order', { ascending: true });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('shipping_categories read timed out')), SHIPPING_FETCH_TIMEOUT_MS),
      );
      const { data, error } = await Promise.race([query, timeout]);
      if (error) throw error;
      const rows = (data as ShippingCategory[] | null) ?? [];
      // Only cache a real, non-empty result. A transient failure or an empty
      // read must NOT be cached, or one bad fetch poisons the whole session.
      if (rows.length > 0) {
        shippingCache = rows;
        return rows;
      }
      return FALLBACK_SHIPPING_CATEGORIES;
    } catch (err) {
      plog.warn('shipping_categories unavailable, using fallback rates', err);
      return FALLBACK_SHIPPING_CATEGORIES;
    } finally {
      shippingInflight = null;
    }
  })();
  return shippingInflight;
}

export function shippingRateFor(categoryKey: string | null | undefined, categories: ShippingCategory[]): number {
  if (!categoryKey) return 0;
  return categories.find((c) => c.key === categoryKey)?.rate ?? 0;
}

// Shipping v2: who pays, and who ships, are independent. See
// docs/SHIPPING_V2_PLAN.md and migration 20260731000001.
export type ShippingPayer = 'buyer' | 'seller';
export type FulfillmentMethod = 'zarketplace' | 'self';

// True when the buyer is charged shipping at checkout.
export function buyerPaysShipping(payer: ShippingPayer): boolean {
  return payer === 'buyer';
}

// True when the flat rate comes out of the seller's payout.
//
// This is NOT the same predicate as "the buyer sees Free". Under self-ship the
// buyer also sees Free, but the seller already paid a courier directly, so
// deducting would underpay them by the full rate. Every payout site must use
// this function and never the free_shipping flag.
export function shippingDeducted(payer: ShippingPayer, fulfillment: FulfillmentMethod): boolean {
  return payer === 'seller' && fulfillment === 'zarketplace';
}

// The one question ops needs answered per paid order: do we book a courier,
// and if so who is paying for it? Everything about how an order is fulfilled
// follows from this, so it is derived in one place and used by the admin queue
// and the order detail alike.
export type FulfillmentRoute = 'book_buyer_paid' | 'book_seller_paid' | 'self_ship';

export function fulfillmentRoute(
  payer: ShippingPayer,
  fulfillment: FulfillmentMethod,
): FulfillmentRoute {
  if (fulfillment === 'self') return 'self_ship';
  return payer === 'buyer' ? 'book_buyer_paid' : 'book_seller_paid';
}

export const FULFILLMENT_ROUTE_LABEL: Record<FulfillmentRoute, string> = {
  book_buyer_paid: 'Book courier · buyer paid',
  book_seller_paid: 'Book courier · deduct from seller',
  self_ship: 'Seller ships · do not book',
};

// What the seller actually receives after delivery. Mirrors the payout amount
// in handle_order_delivered():
//   GREATEST(0, amount - (CASE WHEN <deducted> THEN shipping_cost ELSE 0 END))
// where `amount` is COALESCE(sale_price, price), so callers must pass the
// EFFECTIVE price (sale price when one is set), not the list price.
//
// The deduction is the flat category rate, never the real courier bill, so
// this number is exact and fixed at listing time, not an estimate. zarketplace
// absorbs any difference between the flat rate and what the courier charges.
//
// Three places compute this independently and must agree: this function,
// handle_order_delivered() in SQL, and the payout-released-seller email.
export function calculateSellerPayout(
  effectivePrice: number,
  rate: number,
  payer: ShippingPayer,
  fulfillment: FulfillmentMethod,
): number {
  if (!(effectivePrice > 0)) return 0;
  return Math.max(0, effectivePrice - (shippingDeducted(payer, fulfillment) ? rate : 0));
}
