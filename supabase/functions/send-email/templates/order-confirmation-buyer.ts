// Buyer: "Order placed" confirmation, sent right after the buyer confirms payment.
import { baseStyle, button, EmailContent, EmailContext, esc, trackUrl } from "./_shared.ts";

export function orderConfirmationBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Order placed · ${o.order_number}`,
    html: `<div style="${baseStyle}">
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Order placed</h1>
      <p>Hi ${esc(o.buyer_name)},</p>
      <p>Thanks for your order on zarketplace! We're verifying your payment. Once confirmed, the seller will be notified to ship your item.</p>
      <h3 style="margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#666; font-size:13px;">SKU: ${esc(o.listing_sku)}</p>
      <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Total:</strong> Rs. ${o.total_amount}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track your order")}
    </div>`,
  };
}
