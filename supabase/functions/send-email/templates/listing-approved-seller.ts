// Seller: their listing passed moderation and is now live. This template is
// NOT order-bound - it is driven by `extra` (seller_email, listing_title,
// listing_id) supplied by the admin action that approved the listing.
import { baseStyle, button, EmailContent, EmailContext, esc, header } from "./_shared.ts";

export function listingApprovedSeller(ctx: EmailContext): EmailContent {
  const e = ctx.extra ?? {};
  const title = String(e.listing_title ?? "your item");
  const listingId = String(e.listing_id ?? "");
  return {
    to: String(e.seller_email ?? ""),
    subject: `Your listing is live · ${title}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">You're live.</h1>
      <p><strong>${esc(title)}</strong> has been approved and is now live on zarketplace for buyers to see and buy.</p>
      <p>When it sells, we'll email you right away with what to do next. You just pack it and hand it to the courier at pickup, zarketplace covers the label.</p>
      ${listingId ? button(`${ctx.siteUrl}/product/${listingId}`, "View your listing") : ""}
    </div>`,
  };
}
