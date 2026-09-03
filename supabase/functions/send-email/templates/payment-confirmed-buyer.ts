// Buyer: payment captured via Razorpay. Sent by the razorpay-webhook
// function once the webhook has verified the payment with Razorpay — never
// sent on the buyer's own say-so.
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, listingImage, trackUrl } from "./_shared.ts";

export function paymentConfirmedBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Payment received · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Payment received</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">Your payment is confirmed. We're getting your item ready: it's checked against its listing, repacked in our own packaging, and sent out to you from our hub. You'll get tracking as soon as it ships.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      ${listingImage(o)}
      <p style="color:#5a5a5a; font-size:13px;">SKU: ${esc(o.listing_sku)}</p>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:13px; margin:12px 0; border-top:1px solid #eee; padding-top:12px;">
        <tr><td style="color:#5a5a5a; padding:2px 0;">Item</td><td style="text-align:right; padding:2px 0;">Rs. ${o.amount}</td></tr>
        <tr><td style="color:#5a5a5a; padding:2px 0;">Shipping</td><td style="text-align:right; padding:2px 0;">${o.free_shipping ? "Free" : `Rs. ${o.shipping_cost}`}</td></tr>
        <tr><td style="color:#5a5a5a; padding:2px 0;">Buyer protection</td><td style="text-align:right; padding:2px 0;">Rs. ${o.buyer_protection_fee}</td></tr>
        <tr><td style="font-weight:900; padding:6px 0 2px; border-top:1px solid #eee;">Total paid</td><td style="text-align:right; font-weight:900; padding:6px 0 2px; border-top:1px solid #eee;">Rs. ${o.total_amount}</td></tr>
      </table>
      ${o.shipping_address ? `<p style="color:#5a5a5a; font-size:13px;">Shipping to: ${esc([o.shipping_address.address, o.shipping_address.city, o.shipping_address.state, o.shipping_address.pincode].filter(Boolean).join(", "))}</p>` : ""}
      ${button(trackUrl(o, ctx.siteUrl), "Track your order")}
    </div>`),
  };
}
