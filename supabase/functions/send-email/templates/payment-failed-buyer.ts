// Buyer: payment failed/was abandoned via Razorpay. Sent by the
// razorpay-webhook function so the buyer knows to retry — the order itself
// stays retryable (status payment_failed, same Razorpay order id reused).
import { baseStyle, button, EmailContent, EmailContext, esc, header, trackUrl } from "./_shared.ts";

export function paymentFailedBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Payment failed · ${o.order_number}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Payment didn't go through</h1>
      <p>Hi ${esc(o.buyer_name)},</p>
      <p>Your payment for the order below could not be completed. No amount was charged. You can retry the payment from your orders page.</p>
      <h3 style="margin-top:24px;">${esc(o.listing_title)}</h3>
      <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Total:</strong> Rs. ${o.total_amount}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Retry payment")}
    </div>`,
  };
}
