// Seller: a sale of theirs was cancelled by an admin. Their listing is live
// again, and no payout will be issued for this order. If they already shipped,
// they're asked to contact support so it can be handled manually.
import { baseStyle, button, EmailContent, EmailContext, esc, header, sellerUrl } from "./_shared.ts";

export function orderCancelledSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.seller_email,
    subject: `Sale cancelled · ${o.listing_title}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Sale cancelled</h1>
      <p>The sale of <strong>${esc(o.listing_title)}</strong> (order ${esc(o.order_number)}) has been cancelled. Your listing is live again and available to buy.</p>
      <p>No payout will be issued for this order. If you had already shipped this item, please contact us at <a href="mailto:contact@zarketplace.com">contact@zarketplace.com</a> so we can sort it out.</p>
      ${button(sellerUrl(o, ctx.siteUrl), "Open seller portal")}
    </div>`,
  };
}
