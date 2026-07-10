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

let shippingCache: ShippingCategory[] | undefined;
let shippingInflight: Promise<ShippingCategory[]> | null = null;

export async function getShippingCategories(): Promise<ShippingCategory[]> {
  if (shippingCache !== undefined) return shippingCache;
  if (shippingInflight) return shippingInflight;
  shippingInflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('shipping_categories')
        .select('key, label, rate')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      shippingCache = (data as ShippingCategory[] | null) ?? [];
    } catch (err) {
      plog.warn('shipping_categories unavailable, hiding shipping selector/estimate', err);
      shippingCache = [];
    } finally {
      shippingInflight = null;
    }
    return shippingCache;
  })();
  return shippingInflight;
}

export function shippingRateFor(categoryKey: string | null | undefined, categories: ShippingCategory[]): number {
  if (!categoryKey) return 0;
  return categories.find((c) => c.key === categoryKey)?.rate ?? 0;
}
