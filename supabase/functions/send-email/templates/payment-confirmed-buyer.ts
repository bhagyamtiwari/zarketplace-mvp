// Buyer: payment captured via Razorpay. Sent by the razorpay-webhook
// function once the webhook has verified the payment with Razorpay — never
// sent on the buyer's own say-so.
import { baseStyle, button, EmailContent, EmailContext, esc, header, listingImage, trackUrl } from "./_shared.ts";

export function paymentConfirmedBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Payment received · ${o.order_number}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Payment received</h1>
      <p>Hi ${esc(o.buyer_name)},</p>
      <p>Your payment for the order below is confirmed and held safely in escrow. The seller has been notified to pack and send your item, and your payment stays protected until it's delivered.</p>
      <h3 style="margin-top:24px;">${esc(o.listing_title)}</h3>
      ${listingImage(o)}
      <p style="color:#666; font-size:13px;">SKU: ${esc(o.listing_sku)}</p>
      <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Total:</strong> Rs. ${o.total_amount}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track your order")}
    </div>`,
  };
}
