// Shared building blocks for every email template.
//
// Each template lives in its own file and exports a single `(ctx) => EmailContent`
// function. They all share the helpers below so the look-and-feel stays
// consistent and so editing one template never touches another.

export interface EmailContext {
  // The full `orders` row (or {} when none was loaded).
  order: any;
  // Free-form payload for templates that don't map to an order (e.g. "custom").
  extra?: Record<string, unknown>;
  // Public site URL, used to build buyer/seller links.
  siteUrl: string;
}

export interface EmailContent {
  to: string;
  subject: string;
  html: string;
}

// Outer wrapper style applied to every transactional email body.
export const baseStyle =
  `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#111; max-width:560px; margin:0 auto; padding:32px;`;

// Shared call-to-action button markup.
export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block; background:#000; color:#fff; padding:14px 24px; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px;">${label}</a>`;
}

export function trackUrl(o: any, siteUrl: string): string {
  return `${siteUrl}/track-order?order=${o.order_number}&email=${encodeURIComponent(o.buyer_email ?? "")}`;
}

export function sellerUrl(o: any, siteUrl: string): string {
  return `${siteUrl}/seller-portal?email=${encodeURIComponent(o.seller_email ?? "")}`;
}

export function esc(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
