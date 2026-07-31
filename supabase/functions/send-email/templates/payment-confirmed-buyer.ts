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
      <p><strong>Order #:</strong> ${esc(o.order_number)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:13px; margin:12px 0; border-top:1px solid #eee; padding-top:12px;">
        <tr><td style="color:#666; padding:2px 0;">Item</td><td style="text-align:right; padding:2px 0;">Rs. ${o.amount}</td></tr>
        ${/* Zero counts as free even when the flag says otherwise: admin and
             service_role purchases skip orders_snapshot_from_listing entirely,
             so free_shipping is never stamped and defaults to false while
             shipping_cost is correctly 0. Keyed on the flag alone this said
             "Rs. 0", which reads as a charge. */ ""}
        <tr><td style="color:#666; padding:2px 0;">Shipping</td><td style="text-align:right; padding:2px 0;">${o.free_shipping || Number(o.shipping_cost) === 0 ? "Free" : `Rs. ${o.shipping_cost}`}</td></tr>
        <tr><td style="color:#666; padding:2px 0;">Buyer protection</td><td style="text-align:right; padding:2px 0;">Rs. ${o.buyer_protection_fee}</td></tr>
        <tr><td style="font-weight:900; padding:6px 0 2px; border-top:1px solid #eee;">Total paid</td><td style="text-align:right; font-weight:900; padding:6px 0 2px; border-top:1px solid #eee;">Rs. ${o.total_amount}</td></tr>
      </table>
      ${o.shipping_address ? `<p style="color:#666; font-size:13px;">Shipping to: ${esc([o.shipping_address.address, o.shipping_address.city, o.shipping_address.state, o.shipping_address.pincode].filter(Boolean).join(", "))}</p>` : ""}
      ${button(trackUrl(o, ctx.siteUrl), "Track your order")}
    </div>`,
  };
}
