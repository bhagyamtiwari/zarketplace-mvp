export type ListingStatus = 'pending' | 'approved' | 'rejected';

export interface Listing {
  id: string;
  sku?: string;
  title: string;
  brand: string;
  price: number;
  sale_price: number | null;
  category: string;
  gender: string;
  size_type: string; // Pants, Tops, Outerwear, Accessories, etc.
  size: string;
  condition: string;
  description: string;
  image_url: string;
  image_urls?: string[];
  seller_email: string;
  seller_instagram?: string;
  no_returns: boolean;
  shipping_cost: number;
  status: ListingStatus;
  is_sold?: boolean;
  created_at: string;
}

export type NewListing = Omit<Listing, 'id' | 'created_at' | 'status' | 'sku' | 'is_sold'>;

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export interface Order {
  id: string;
  order_number: string;
  listing_id: string;
  listing_sku?: string;
  listing_title: string;
  listing_image_url?: string;
  buyer_email: string;
  buyer_name: string;
  buyer_phone?: string;
  shipping_address: Record<string, string>;
  billing_address?: Record<string, string>;
  seller_email: string;
  amount: number;
  shipping_cost: number;
  total_amount: number;
  platform_fee: number;
  seller_payout_amount: number;
  status: OrderStatus;
  tracking_number?: string;
  courier_name?: string;
  shipped_at?: string;
  delivered_at?: string;
  cashfree_order_id?: string;
  cashfree_payment_session_id?: string;
  payment_status?: string;
  payment_method?: string;
  payment_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export type PayoutStatus = 'pending' | 'released' | 'held' | 'cancelled';

export interface SellerPayout {
  id: string;
  order_id: string;
  seller_email: string;
  amount: number;
  status: PayoutStatus;
  hold_reason?: string;
  released_at?: string;
  released_by?: string;
  notes?: string;
  payout_method?: 'manual' | 'cashfree_payouts' | 'easy_split';
  payout_reference?: string;
  destination_upi?: string;
  destination_account?: string;
  destination_ifsc?: string;
  destination_holder?: string;
  created_at: string;
  updated_at: string;
}
