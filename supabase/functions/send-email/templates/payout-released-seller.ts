// Seller: "Payout released" confirmation, sent once the admin pays the seller.
import { baseStyle, button, EmailContent, EmailContext, esc, header, sellerUrl } from "./_shared.ts";

export function payoutReleasedSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.seller_email,
    subject: `Payout released · Rs. ${o.amount}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase;">Payout released</h1>
      <p>Your payout of <strong>Rs. ${o.amount}</strong> (100% of your asking price) for order ${esc(o.order_number)} is on its way to your UPI.</p>
      ${button(sellerUrl(o, ctx.siteUrl), "View seller portal")}
    </div>`,
  };
}
