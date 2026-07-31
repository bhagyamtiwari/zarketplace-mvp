// Sample listings for local development ONLY.
//
// The catalogue is empty right now, so the feed cannot be judged on a real
// screen. These rows let the grid, the filters, the sell tile and the paging
// controls be seen and tested without writing fake inventory into the live
// Supabase project (which would then show up on the real site).
//
// Guarded twice over: `import.meta.env.DEV` is false in any production build, so
// this never ships, and it only fills in when the real query comes back empty -
// as soon as there is one approved listing, real data wins.
//
// To remove: delete this file and the two `devListings` references in
// src/pages/Marketplace.tsx.
import { Listing } from '../types';

const IMAGES = [
  'https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=600',
  'https://images.unsplash.com/photo-1543076447-215ad9ba6923?q=80&w=600',
  'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=600',
  'https://images.unsplash.com/photo-1520006403909-838d6b92c22e?q=80&w=600',
  'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?q=80&w=600',
  'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=600',
  'https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=600',
  'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=600',
];

const SEED: Array<{
  title: string; brand: string; price: number; sale?: number;
  category: string; gender: string; size: string; condition: string; free?: boolean;
}> = [
  { title: 'Vintage Levi\'s 501 straight jeans', brand: "Levi's", price: 2400, category: 'Bottoms', gender: 'Unisex', size: '32', condition: 'Great', free: true },
  { title: 'Carhartt WIP Detroit jacket', brand: 'Carhartt WIP', price: 7800, sale: 6200, category: 'Outerwear', gender: 'Men', size: 'L', condition: 'Great' },
  { title: 'Nike Air Max 90 infrared', brand: 'Nike', price: 5400, category: 'Shoes', gender: 'Unisex', size: 'UK 9', condition: 'Good' },
  { title: 'Uniqlo oxford button-down', brand: 'Uniqlo', price: 899, category: 'Tops', gender: 'Men', size: 'M', condition: 'Pristine', free: true },
  { title: 'Zara pleated midi skirt', brand: 'Zara', price: 1200, category: 'Bottoms', gender: 'Women', size: 'S', condition: 'Great' },
  { title: 'Champion reverse weave hoodie', brand: 'Champion', price: 2900, category: 'Tops', gender: 'Unisex', size: 'XL', condition: 'Good' },
  { title: 'Dr. Martens 1460 boots', brand: 'Dr. Martens', price: 6500, sale: 5100, category: 'Shoes', gender: 'Unisex', size: 'UK 7', condition: 'Good', free: true },
  { title: 'H&M linen shirt dress', brand: 'H&M', price: 749, category: 'Tops', gender: 'Women', size: 'M', condition: 'Great' },
  { title: 'Adidas Sambas OG', brand: 'Adidas', price: 4200, category: 'Shoes', gender: 'Unisex', size: 'UK 8', condition: 'Pristine' },
  { title: 'Vintage Wrangler denim jacket', brand: 'Wrangler', price: 3100, category: 'Outerwear', gender: 'Unisex', size: 'L', condition: 'Fair' },
  { title: 'Ralph Lauren cable knit', brand: 'Ralph Lauren', price: 3600, category: 'Tops', gender: 'Men', size: 'M', condition: 'Great', free: true },
  { title: 'Mango wide-leg trousers', brand: 'Mango', price: 950, category: 'Bottoms', gender: 'Women', size: '30', condition: 'Great' },
  { title: 'The North Face Nuptse puffer', brand: 'The North Face', price: 9800, category: 'Outerwear', gender: 'Unisex', size: 'M', condition: 'Good' },
  { title: 'Converse Chuck 70 high top', brand: 'Converse', price: 2100, category: 'Shoes', gender: 'Unisex', size: 'UK 6', condition: 'Good' },
  { title: 'Vintage band tee, 1998 tour', brand: 'Vintage', price: 1800, category: 'Tops', gender: 'Unisex', size: 'L', condition: 'Fair', free: true },
  { title: 'Coach leather shoulder bag', brand: 'Coach', price: 8900, sale: 7400, category: 'Accessories', gender: 'Women', size: 'One Size', condition: 'Great' },
  { title: 'Muji chino trousers', brand: 'Muji', price: 890, category: 'Bottoms', gender: 'Men', size: '34', condition: 'Great' },
  { title: 'Stussy 8-ball crewneck', brand: 'Stussy', price: 4600, category: 'Tops', gender: 'Unisex', size: 'M', condition: 'Good' },
  { title: 'Vintage silk scarf', brand: 'Vintage', price: 650, category: 'Accessories', gender: 'Women', size: 'One Size', condition: 'Great', free: true },
  { title: 'Patagonia Better Sweater fleece', brand: 'Patagonia', price: 5200, category: 'Outerwear', gender: 'Unisex', size: 'S', condition: 'Pristine' },
  { title: 'New Balance 550 white green', brand: 'New Balance', price: 6100, category: 'Shoes', gender: 'Unisex', size: 'UK 10', condition: 'Good' },
  { title: 'Vintage leather belt, brass buckle', brand: 'Vintage', price: 550, category: 'Accessories', gender: 'Unisex', size: 'One Size', condition: 'As is' },
  { title: 'Superdry windbreaker', brand: 'Superdry', price: 2700, category: 'Outerwear', gender: 'Men', size: 'XL', condition: 'Good', free: true },
  { title: 'Forever 21 slip dress', brand: 'Forever 21', price: 699, category: 'Tops', gender: 'Women', size: 'XS', condition: 'Great' },
  { title: 'Vans Old Skool black', brand: 'Vans', price: 2300, category: 'Shoes', gender: 'Unisex', size: 'UK 8', condition: 'Fair' },
  { title: 'Tommy Hilfiger rugby polo', brand: 'Tommy Hilfiger', price: 1900, category: 'Tops', gender: 'Men', size: 'L', condition: 'Good' },
  { title: 'Vintage pleated wool trousers', brand: 'Vintage', price: 1450, category: 'Bottoms', gender: 'Unisex', size: '32', condition: 'Great' },
  { title: 'Fossil leather watch strap', brand: 'Fossil', price: 890, category: 'Accessories', gender: 'Unisex', size: 'One Size', condition: 'Pristine', free: true },
];

const HOUR = 60 * 60 * 1000;

export const devListings: Listing[] = SEED.map((row, i) => ({
  id: `dev-${i}`,
  sku: undefined,
  seller_id: 'dev-seller',
  seller_display_name: 'Sample Seller',
  seller_instagram: 'https://www.instagram.com/zarketplace',
  title: row.title,
  brand: row.brand,
  description: null,
  price: row.price,
  sale_price: row.sale ?? null,
  category: row.category,
  gender: row.gender,
  size_type: row.size,
  size: row.size,
  condition: row.condition,
  image_url: IMAGES[i % IMAGES.length],
  image_urls: [],
  shipping_category: 'standard',
  free_shipping: !!row.free,
  shipping_payer: row.free ? 'seller' : 'buyer',
  fulfillment_method: 'zarketplace',
  has_flaws: false,
  flaws_description: null,
  original_tags_attached: null,
  original_packaging: null,
  item_altered: null,
  wear_frequency: null,
  authenticity_confirmed: true,
  seller_declared_at: null,
  status: 'approved',
  is_sold: false,
  // Spread across the last few days so "New today" filters to a real subset
  // instead of matching everything.
  created_at: new Date(Date.now() - i * 5 * HOUR).toISOString(),
}));
