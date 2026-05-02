export type ListingStatus = 'pending' | 'approved' | 'rejected';

export interface Listing {
  id: string;
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
  created_at: string;
}

export type NewListing = Omit<Listing, 'id' | 'created_at' | 'status'>;
