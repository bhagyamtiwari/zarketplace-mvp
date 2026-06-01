// Seller: "Payout released" confirmation, sent once the admin pays the seller.
import { baseStyle, button, EmailContent, EmailContext, esc, sellerUrl } from "./_shared.ts";

export function payoutReleasedSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.seller_email,
    subject: `Payout released · Rs. ${o.total_amount}`,
    html: `<div style="${baseStyle}">
      <h1 style="font-weight:900; text-transform:uppercase;">Payout released</h1>
      <p>Your payout of <strong>Rs. ${o.total_amount}</strong> for order ${esc(o.order_number)} has been released to your UPI.</p>
      ${button(sellerUrl(o, ctx.siteUrl), "View seller portal")}
    </div>`,
  };
}
