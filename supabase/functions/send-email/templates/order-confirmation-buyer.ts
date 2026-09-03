// Buyer: "Order placed" confirmation, sent right after the buyer confirms payment.
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, trackUrl } from "./_shared.ts";

export function orderConfirmationBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Order placed · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Order placed</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">Thanks for your order. We're verifying your payment now. Once it clears, we check your item, repack it and send it out to you. Every order is sold and shipped by zarketplace.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#5a5a5a; font-size:13px;">SKU: ${esc(o.listing_sku)}</p>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Total:</strong> Rs. ${o.total_amount}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track your order")}
    </div>`),
  };
}
