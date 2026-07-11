// Buyer: "Order placed" confirmation, sent right after the buyer confirms payment.
import { baseStyle, button, EmailContent, EmailContext, esc, header, trackUrl } from "./_shared.ts";

export function orderConfirmationBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Order placed · ${o.order_number}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Order placed</h1>
      <p>Hi ${esc(o.buyer_name)},</p>
      <p>Thanks for ordering on zarketplace. We're verifying your payment now. Once it's confirmed, the seller packs and sends your item, and your payment stays protected in escrow until it's delivered.</p>
      <h3 style="margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#666; font-size:13px;">SKU: ${esc(o.listing_sku)}</p>
      <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Total:</strong> Rs. ${o.total_amount}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track your order")}
    </div>`,
  };
}
