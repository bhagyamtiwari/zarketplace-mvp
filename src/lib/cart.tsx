// Cart context + hook with dual storage backends.
//
// - Logged-out: stored in localStorage under `zk_cart_v1`.
// - Logged-in: stored in the `cart_items` table on Supabase (RLS by user_id).
// - On sign-in we merge the local cart into the DB then clear localStorage.
//
// Cart is single-seller: trying to add an item from a different seller will
// surface a confirm prompt to clear the existing cart first.

import * as React from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { CartItem, Listing } from '../types';
import { log } from './log';

const clog = log('cart');
const STORAGE_KEY = 'zk_cart_v1';

type ListingLike = Pick<
  Listing,
  | 'id'
  | 'sku'
  | 'title'
  | 'brand'
  | 'price'
  | 'sale_price'
  | 'image_url'
  | 'size'
  | 'seller_id'
  | 'seller_email'
  | 'seller_upi_vpa'
  | 'shipping_mode'
  | 'shipping_cost'
>;

interface CartContextValue {
  items: CartItem[];
  count: number;
  loading: boolean;
  sellerId: string | null; // active seller for the cart (single-seller rule)
  add: (listing: ListingLike) => Promise<{ ok: true } | { ok: false; reason: 'different_seller' }>;
  forceAdd: (listing: ListingLike) => Promise<void>; // clears cart then adds
  remove: (listingId: string) => Promise<void>;
  clear: () => Promise<void>;
  has: (listingId: string) => boolean;
  refresh: () => Promise<void>;
}

const CartContext = React.createContext<CartContextValue | undefined>(undefined);

function snapshot(l: ListingLike): CartItem {
  return {
    listing_id: l.id,
    sku: l.sku,
    added_at: new Date().toISOString(),
    title: l.title,
    brand: l.brand,
    price: l.price,
    sale_price: l.sale_price ?? null,
    image_url: l.image_url,
    size: l.size,
    seller_id: l.seller_id,
    seller_email: l.seller_email,
    seller_upi_vpa: l.seller_upi_vpa,
    shipping_mode: l.shipping_mode,
    shipping_cost: l.shipping_cost,
  };
}

function readLocal(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    clog.warn('writeLocal failed', err);
  }
}

async function fetchListingsByIds(ids: string[]): Promise<Record<string, ListingLike>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('listings')
    .select('id, sku, title, brand, price, sale_price, image_url, size, seller_id, seller_email, seller_upi_vpa, shipping_mode, shipping_cost')
    .in('id', ids);
  if (error) {
    clog.warn('fetchListingsByIds error', error);
    return {};
  }
  const out: Record<string, ListingLike> = {};
  for (const row of data || []) out[(row as ListingLike).id] = row as ListingLike;
  return out;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = React.useState<CartItem[]>(() => readLocal());
  const [loading, setLoading] = React.useState(false);

  const sellerId = items[0]?.seller_id ?? null;

  // Hydrate from DB on login + merge any local items.
  const loadFromDb = React.useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('listing_id, added_at')
        .eq('user_id', uid)
        .order('added_at', { ascending: true });
      if (error) throw error;

      const dbIds = (data || []).map((r: { listing_id: string }) => r.listing_id);

      // Local cart that needs migrating up.
      const local = readLocal();
      const localIds = local.map((i) => i.listing_id);
      const newIdsToInsert = localIds.filter((id) => !dbIds.includes(id));

      if (newIdsToInsert.length > 0) {
        // Validate single-seller before merging - if the local seller doesn't
        // match an existing DB seller, the DB cart wins and we discard local.
        const allIds = Array.from(new Set([...dbIds, ...newIdsToInsert]));
        const map = await fetchListingsByIds(allIds);
        const sellers = new Set(Object.values(map).map((l) => l.seller_id).filter(Boolean));
        if (sellers.size <= 1) {
          await supabase.from('cart_items').insert(
            newIdsToInsert.map((listing_id) => ({ user_id: uid, listing_id })),
          );
        } else {
          clog('discarding local cart on merge: would mix sellers');
        }
      }

      // Always re-read after potential insert.
      const { data: final } = await supabase
        .from('cart_items')
        .select('listing_id, added_at')
        .eq('user_id', uid)
        .order('added_at', { ascending: true });

      const ids = (final || []).map((r: { listing_id: string; added_at: string }) => r.listing_id);
      const lookup = await fetchListingsByIds(ids);
      const next: CartItem[] = (final || [])
        .map((r: { listing_id: string; added_at: string }) => {
          const l = lookup[r.listing_id];
          if (!l) return null;
          return { ...snapshot(l), added_at: r.added_at };
        })
        .filter(Boolean) as CartItem[];

      setItems(next);
      writeLocal([]); // logged-in: clear local
    } catch (err) {
      clog.error('loadFromDb threw', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (authLoading) return;
    if (user) {
      loadFromDb(user.id);
    } else {
      setItems(readLocal());
    }
  }, [user, authLoading, loadFromDb]);

  const persist = React.useCallback(
    async (next: CartItem[]) => {
      setItems(next);
      if (user) {
        // Diff strategy: full replace via delete-then-insert keeps it simple
        // for tiny carts. Cart is single-seller so size stays bounded.
        await supabase.from('cart_items').delete().eq('user_id', user.id);
        if (next.length > 0) {
          await supabase
            .from('cart_items')
            .insert(next.map((i) => ({ user_id: user.id, listing_id: i.listing_id, added_at: i.added_at })));
        }
      } else {
        writeLocal(next);
      }
    },
    [user],
  );

  const add: CartContextValue['add'] = async (listing) => {
    if (items.some((i) => i.listing_id === listing.id)) return { ok: true };
    if (sellerId && listing.seller_id && sellerId !== listing.seller_id) {
      return { ok: false, reason: 'different_seller' };
    }
    await persist([...items, snapshot(listing)]);
    return { ok: true };
  };

  const forceAdd: CartContextValue['forceAdd'] = async (listing) => {
    await persist([snapshot(listing)]);
  };

  const remove: CartContextValue['remove'] = async (listingId) => {
    await persist(items.filter((i) => i.listing_id !== listingId));
  };

  const clear: CartContextValue['clear'] = async () => {
    await persist([]);
  };

  const has = React.useCallback((id: string) => items.some((i) => i.listing_id === id), [items]);

  const refresh = React.useCallback(async () => {
    if (user) await loadFromDb(user.id);
    else setItems(readLocal());
  }, [user, loadFromDb]);

  const value: CartContextValue = {
    items,
    count: items.length,
    loading,
    sellerId,
    add,
    forceAdd,
    remove,
    clear,
    has,
    refresh,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
