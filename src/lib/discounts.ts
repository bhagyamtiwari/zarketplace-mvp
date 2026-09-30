// Promo codes: a rupee amount off an order. Made in the admin portal for a
// special customer or to make up for something, entered at checkout. Called
// discount codes in the database.
//
// Everything that decides what a code is worth happens on the server (see
// supabase/migrations/20260925000005_discount_codes.sql). The checkout asks
// check_discount_code what a code would take off, to show it in the summary,
// and apply_discount_code puts it on the held orders just before payment,
// checking it all again against their real totals.
import { supabase } from './supabase';

export interface DiscountCode {
  id: string;
  code: string;
  amount_off: number;
  min_order: number;
  for_email: string | null;
  max_uses: number | null;
  once_per_customer: boolean;
  expires_at: string | null;
  active: boolean;
  purpose: 'retention' | 'make_good' | 'acquisition' | 'other';
  note: string | null;
  created_at: string;
}

export interface DiscountRedemption {
  id: string;
  code_id: string;
  buyer_email: string | null;
  order_numbers: string[];
  amount: number;
  status: 'held' | 'used' | 'released';
  held_until: string | null;
  created_at: string;
  used_at: string | null;
  released_at: string | null;
}

export const PURPOSES: Array<{ key: DiscountCode['purpose']; label: string; prefix: string }> = [
  { key: 'retention', label: 'Special customer', prefix: 'THANKS' },
  { key: 'make_good', label: 'Making up for something', prefix: 'SORRY' },
  { key: 'acquisition', label: 'New customers', prefix: 'WELCOME' },
  { key: 'other', label: 'Other', prefix: 'ZARKET' },
];

/** How a code is typed in: capitals, no spaces. The database stores it the same way. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

export const CODE_RE = /^[A-Z0-9-]{3,32}$/;

/** A fresh code to hand out, like THANKS-7KQ2. No 0, O, 1 or I, which are misread. */
export function makeCode(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const tail = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${prefix}-${tail}`;
}

export type CheckResult = { ok: true; code: string; amountOff: number } | { ok: false; message: string };

/** What a code would take off this order, without applying it. */
export async function checkDiscountCode(code: string, orderTotal: number, orderNumbers: string[] | null): Promise<CheckResult> {
  const { data, error } = await supabase.rpc('check_discount_code', {
    p_code: normalizeCode(code),
    p_order_total: orderTotal,
    p_order_numbers: orderNumbers && orderNumbers.length ? orderNumbers : null,
  });
  if (error) return { ok: false, message: 'Could not check that code. Try again.' };
  const r = data as { ok: boolean; code?: string; amount_off?: number; message?: string };
  return r.ok
    ? { ok: true, code: r.code ?? normalizeCode(code), amountOff: Number(r.amount_off ?? 0) }
    : { ok: false, message: r.message ?? 'That code cannot be used.' };
}

/** Puts a code on the buyer's held orders. Throws with the reason when it cannot. */
export async function applyDiscountCode(code: string, orderNumbers: string[]): Promise<{ code: string; amount: number; total: number }> {
  const { data, error } = await supabase.rpc('apply_discount_code', { p_code: normalizeCode(code), p_order_numbers: orderNumbers });
  if (error) throw new Error(error.message);
  const r = data as { code: string; amount: number; total: number };
  return { code: r.code, amount: Number(r.amount), total: Number(r.total) };
}

/** Takes any code off the buyer's held orders. */
export async function removeDiscountCode(orderNumbers: string[]): Promise<void> {
  const { error } = await supabase.rpc('remove_discount_code', { p_order_numbers: orderNumbers });
  if (error) throw new Error(error.message);
}
