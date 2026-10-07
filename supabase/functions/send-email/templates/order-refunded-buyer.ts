// Buyer: a refund has actually been issued via Razorpay (sent by the
// razorpay-refund edge function after the refund API call succeeds). Unlike
// order_cancelled_buyer (which only promises a refund), this confirms the
// money is on its way back.
import { shell, baseStyle, EmailContent, EmailContext, esc, header } from "./_shared.ts";

export function orderRefundedBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Refund sent · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Refund sent.</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">We have issued a full refund of Rs. ${o.total_amount} for the order below back to your original payment method. It usually shows in your account within 5 to 7 business days, depending on your bank.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Refunded:</strong> Rs. ${o.total_amount}</p>
      <p style="color:#111111; margin:0 0 14px;">Questions? Reply to this email.</p>
    </div>`),
  };
}
