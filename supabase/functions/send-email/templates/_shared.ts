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

// Logo + wordmark header, prepended to every transactional email body so
// every send is recognizably from zarketplace at a glance in an inbox.
// Uses an absolute URL (siteUrl) since email clients fetch images over
// HTTP - a local /images/... path only works on the live site, not in mail.
// Built as a <table> (not flexbox/grid) since Outlook's rendering engine
// ignores modern CSS layout entirely - tables are the one layout primitive
// every email client renders consistently.
export function header(siteUrl: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px; padding-bottom:20px; border-bottom:1px solid #eee; width:100%;">
    <tr>
      <td style="vertical-align:middle; padding-right:8px; width:24px;">
        <img src="${siteUrl}/images/zarketplace-tp.png" alt="zarketplace" width="24" height="24" style="display:block;" />
      </td>
      <td style="vertical-align:middle; font-size:20px; font-weight:900; letter-spacing:-0.5px; text-transform:lowercase;">zarketplace</td>
    </tr>
  </table>`;
}

// Listing photo thumbnail, shown above the order details on emails where
// seeing the item helps (payment confirmation, shipped). Renders nothing if
// the order has no listing_image_url.
export function listingImage(o: any): string {
  if (!o.listing_image_url) return "";
  return `<img src="${o.listing_image_url}" alt="${esc(o.listing_title ?? "")}" width="120" style="display:block; width:120px; height:160px; object-fit:cover; margin:16px 0; border:1px solid #eee;" />`;
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
