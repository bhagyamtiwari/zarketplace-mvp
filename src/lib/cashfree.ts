// Cashfree v3 JS SDK loader.
//
// Docs: https://www.cashfree.com/docs/payments/online/checkout/javascript-sdk
//
// VITE_CASHFREE_ENV controls sandbox vs production. Default is 'sandbox'.
// The SDK is loaded lazily on first checkout to avoid blocking initial paint.

import { log } from './log';

const cflog = log('cashfree');
const SDK_SRC = 'https://sdk.cashfree.com/js/v3/cashfree.js';

let cashfreeInstance: any = null;

export const loadCashfree = async (): Promise<any> => {
  if (cashfreeInstance) return cashfreeInstance;

  await new Promise<void>((resolve, reject) => {
    if ((window as any).Cashfree) return resolve();
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Cashfree SDK failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Cashfree SDK failed to load'));
    document.body.appendChild(script);
  });

  const mode = (import.meta.env.VITE_CASHFREE_ENV as string) || 'sandbox';
  cashfreeInstance = (window as any).Cashfree({ mode });
  return cashfreeInstance;
};

/**
 * Opens the Cashfree checkout modal for a given payment_session_id.
 * Returns the result object from the SDK (contains .error or success info).
 */
export const handleCashfreePayment = async (paymentSessionId: string) => {
  const cashfree = await loadCashfree();
  return cashfree.checkout({
    paymentSessionId,
    redirectTarget: '_modal', // popup; use '_self' for full redirect
  });
};

/**
 * Calls the create-order Edge Function and returns the payment_session_id.
 */
export interface CreateOrderInput {
  listing_id: string;
  buyer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
  };
  billing?: CreateOrderInput['buyer'];
  /** Auth user id, when the buyer is signed in. Stored on the order so we can
   *  scope queries by user without relying on email matching. */
  buyer_id?: string;
}

export interface CreateOrderResponse {
  order_number: string;
  cashfree_order_id: string;
  payment_session_id: string;
  env?: string;
}

export const createCashfreeOrder = async (
  input: CreateOrderInput,
): Promise<CreateOrderResponse> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  cflog('createCashfreeOrder request', { listing_id: input.listing_id, hasBuyer: !!input.buyer, hasBilling: !!input.billing });

  // 30s hard timeout. The Edge Function should respond in well under 5s; if
  // we wait forever we pin the UI in a stuck "Processing…" state and the
  // user can't retry. Better to surface a timeout error so they can.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify(input),
      signal: ac.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      cflog.error('createCashfreeOrder timed out after 30s');
      throw new Error('Payment service timed out. Please try again.');
    }
    cflog.error('createCashfreeOrder network error', err);
    throw new Error('Network error. Please check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { rawBody: raw }; }
  cflog('createCashfreeOrder response', { status: res.status, ok: res.ok, data });

  if (!res.ok) {
    // Surface as much server-side detail as we can: the Edge Function returns
    // { error, detail } where `detail` is the raw Cashfree response. That makes
    // debugging way easier than just "Failed to create order".
    const detailStr = data?.detail
      ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      : '';
    const msg = [data?.error, detailStr].filter(Boolean).join(' — ') || 'Failed to create order';
    cflog.error('createCashfreeOrder failed', { status: res.status, error: data?.error, detail: data?.detail });
    throw new Error(msg);
  }
  return data;
};
