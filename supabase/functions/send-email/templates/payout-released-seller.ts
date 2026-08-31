// Seller: "Payout released" confirmation, sent once the admin pays the seller.
import { baseStyle, button, EmailContent, EmailContext, esc, header, sellerUrl } from "./_shared.ts";

export function payoutReleasedSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  // Must mirror handle_order_delivered: a seller who offered free shipping has
  // the real shipping cost deducted from their payout (floored at 0). Never
  // quote the full asking price when that deduction applied.
  const shipping = Number(o.shipping_cost ?? 0);
  const payout = o.free_shipping ? Math.max(0, Number(o.amount) - shipping) : Number(o.amount);
  return {
    to: o.seller_email,
    subject: `Payout released · Rs. ${payout}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase;">Payout released</h1>
      <p>Your payout of <strong>Rs. ${payout}</strong> for order ${esc(o.order_number)} is on its way to your UPI.</p>
      ${o.free_shipping
        ? `<p>This is the payout you accepted when you listed this item, less the Rs. ${shipping} delivery you offered to cover.</p>`
        : `<p>This is the payout you accepted when you listed this item.</p>`}
      ${button(sellerUrl(o, ctx.siteUrl), "View seller portal")}
    </div>`,
  };
}
