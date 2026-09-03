// Buyer: payment failed/was abandoned via Razorpay. Sent by the
// razorpay-webhook function so the buyer knows to retry — the order itself
// stays retryable (status payment_failed, same Razorpay order id reused).
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, trackUrl } from "./_shared.ts";

export function paymentFailedBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Payment failed · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Payment didn't go through</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">Your payment for the order below couldn't be completed. No amount was charged. You can retry from your orders page.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Total:</strong> Rs. ${o.total_amount}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Retry payment")}
    </div>`),
  };
}
