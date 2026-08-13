export type ListingStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'archived';

export interface Listing {
  id: string;
  sku?: string;
  seller_id: string;
  // Sensitive seller fields live only on the base `listings` table (owner/admin
  // reads). The public `public_listings` view omits them, so they are optional
  // here and absent from any anon/non-owner read.
  seller_email?: string;
  seller_display_name: string | null;
  seller_instagram: string; // full URL
  seller_upi_vpa?: string;
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
  shipping_category: string;
  // Seller-funded free shipping: buyer pays no shipping line, and the real
  // courier cost is deducted from the seller's payout at delivery instead.
  free_shipping: boolean;
  /** State the item ships from. Decides who may buy it while interstate
      sale is blocked on GST compliance. Null on rows created before the
      listing form asked for it. */
  pickup_state?: string | null;
  /** 'platform' = we book the courier, 'self_ship' = the seller ships it. */
  shipping_mode?: string | null;
  pickup_address?: Record<string, string> | null;
  has_flaws: boolean;
  flaws_description: string | null;
  original_tags_attached: boolean | null;
  original_packaging: boolean | null;
  item_altered: boolean | null;
  wear_frequency: string | null;
  authenticity_confirmed: boolean;
  seller_declared_at: string | null;
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
  seller_display_name?: string | null;
  shipping_category?: string;
  free_shipping?: boolean;
  /** 'platform' = our courier, 'self_ship' = the seller's own. */
  shipping_mode?: string | null;
}

export type OrderStatus =
  | 'awaiting_payment'
  | 'awaiting_verification'
  | 'paid'
  | 'payment_failed'
  | 'payment_conflict'
  | 'shipped'
  | 'delivered'
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
  pickup_address: Record<string, string> | null;
  shiprocket_order_id: string | null;
  shiprocket_shipment_id: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  amount: number;
  shipping_cost: number;
  shipping_category: string | null;
  // True when the seller offered free shipping - shipping_cost was NOT added
  // to total_amount, and is instead deducted from the seller's payout.
  free_shipping: boolean;
  buyer_protection_fee: number;
  total_amount: number;
  payment_utr: string | null;
  payment_receipt_url: string | null;
  payment_submitted_at: string | null;
  buyer_note: string | null;
  status: OrderStatus;
  tracking_url: string | null;
  tracking_number: string | null;
  courier: string | null;
  // Fine-grained courier sub-state synced from Shiprocket (display only; the
  // order state machine still only tracks shipped/delivered). One of:
  // pickup_scheduled | picked_up | in_transit | out_for_delivery | delivered |
  // rto | ndr | cancelled | null.
  shipment_status: string | null;
  shipment_status_at: string | null;
  package_image_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  review_ends_at: string | null;
  claim_open: boolean;
  last_nudge_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PayoutStatus = 'awaiting_payout' | 'paid_out';

export interface SellerPayout {
  id: string;
  seller_id: string;
  order_id: string;
  amount: number;
  status: PayoutStatus;
  releasable_at: string | null;
  created_at: string;
  paid_at: string | null;
}
