// Buyer: their order was cancelled by an admin (e.g. seller can't fulfil, or
// the listing was pulled). A refund is issued out-of-band via the Razorpay
// dashboard today, so this only sets the expectation - it does not itself
// move any money. Mirrors the payment-conflict refund messaging.
import { shell, baseStyle, EmailContent, EmailContext, esc, header } from "./_shared.ts";

export function orderCancelledBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Order cancelled · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Order cancelled</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">Your order below has been cancelled. If you were charged, a full refund of Rs. ${o.total_amount} is being processed back to your original payment method. Refunds usually reflect within 5-7 business days.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Refund amount:</strong> Rs. ${o.total_amount}</p>
      <p style="color:#111111; margin:0 0 14px;">Any questions, reach us at <a href="mailto:contact@zarketplace.com">contact@zarketplace.com</a>.</p>
    </div>`),
  };
}
