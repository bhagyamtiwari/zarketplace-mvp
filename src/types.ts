export type ListingStatus = 'pending' | 'approved' | 'rejected';
export type ShippingMode = 'free' | 'paid';

export interface Listing {
  id: string;
  sku?: string;
  seller_id: string;
  seller_email: string;
  seller_display_name: string | null;
  seller_instagram: string; // full URL
  seller_upi_vpa: string;
  title: string;
  brand: string | null;
  description: string | null;
  price: number;
  sale_price: number | null;
  category: string | null;
  gender: string | null;
  size_type: string | null;
  size: string | null;
  condition: string | null;
  image_url: string;
  image_urls: string[];
  shipping_mode: ShippingMode;
  shipping_cost: number;
  status: ListingStatus;
  is_sold: boolean;
  created_at: string;
  updated_at?: string;
}

export type NewListing = Omit<Listing, 'id' | 'created_at' | 'updated_at' | 'status' | 'sku' | 'is_sold'>;

export interface CartItem {
  listing_id: string;
  sku?: string;
  added_at: string;
  // snapshot fields
  title?: string;
  brand?: string | null;
  price?: number;
  sale_price?: number | null;
  image_url?: string;
  size?: string | null;
  seller_id?: string;
  seller_email?: string;
  seller_upi_vpa?: string;
  seller_display_name?: string | null;
  shipping_mode?: ShippingMode;
  shipping_cost?: number;
}

export type OrderStatus =
  | 'awaiting_payment'
  | 'awaiting_verification'
  | 'paid'
  | 'payment_failed'
  | 'shipped'
  | 'cancelled'
  | 'refunded';

export interface Order {
  id: string;
  order_number: string;
  listing_id: string | null;
  listing_sku: string | null;
  listing_title: string | null;
  listing_image_url: string | null;
  buyer_id: string | null;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string | null;
  seller_id: string | null;
  seller_email: string | null;
  seller_upi_vpa_snapshot: string | null;
  shipping_address: Record<string, string> | null;
  billing_address: Record<string, string> | null;
  amount: number;
  shipping_cost: number;
  total_amount: number;
  payment_utr: string | null;
  payment_receipt_url: string | null;
  payment_submitted_at: string | null;
  buyer_note: string | null;
  status: OrderStatus;
  tracking_url: string | null;
  tracking_number: string | null;
  courier: string | null;
  package_image_url: string | null;
  shipped_at: string | null;
  last_nudge_sent_at: string | null;
  created_at: string;
  updated_at: string;
}
