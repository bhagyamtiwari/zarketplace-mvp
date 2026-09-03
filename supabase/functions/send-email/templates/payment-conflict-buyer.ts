// Buyer: payment was captured by Razorpay, but the one-of-one item had
// already been claimed by another buyer's payment moments earlier. Money
// was taken — this email tells the buyer a refund is coming and sets
// expectations, since the actual refund is currently issued manually by the
// founder via the Razorpay dashboard (see order status payment_conflict).
import { shell, baseStyle, EmailContent, EmailContext, esc, header } from "./_shared.ts";

export function paymentConflictBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Item just sold out · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">This item just sold out</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">Your payment for the order below went through, but another buyer's payment for the same one-of-one item was confirmed moments earlier. Since only one buyer can have this item, we're issuing you a full refund.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Amount:</strong> Rs. ${o.total_amount}</p>
      <p style="color:#111111; margin:0 0 14px;">Your refund is being processed. You'll get a separate confirmation once it's issued. Questions go to
      <a href="mailto:contact@zarketplace.com">contact@zarketplace.com</a>.</p>
    </div>`),
  };
}
