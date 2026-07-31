// Seller: "Payout released" confirmation, sent once the admin pays the seller.
import { baseStyle, button, EmailContent, EmailContext, esc, header, sellerUrl } from "./_shared.ts";

export function payoutReleasedSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  // Must mirror handle_order_delivered and calculateSellerPayout() in
  // src/lib/pricing.ts. The deduction applies only when WE bought the label:
  //
  //   shipping_payer = 'seller' AND fulfillment_method = 'zarketplace'
  //
  // NOT when free_shipping is true. A self-shipping seller also shows Free at
  // checkout but paid their own courier, so deducting would underpay them by
  // the full rate. See docs/SHIPPING_V2_PLAN.md.
  //
  // Orders predating shipping v2 have no fulfillment_method; they default to
  // 'zarketplace', which is correct since self-ship did not exist then.
  const shipping = Number(o.shipping_cost ?? 0);
  const deducted = o.shipping_payer === "seller"
    && (o.fulfillment_method ?? "zarketplace") === "zarketplace";
  const payout = deducted ? Math.max(0, Number(o.amount) - shipping) : Number(o.amount);
  return {
    to: o.seller_email,
    subject: `Payout released · Rs. ${payout}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase;">Payout released</h1>
      <p>Your payout of <strong>Rs. ${payout}</strong> for order ${esc(o.order_number)} is on its way to your UPI.</p>
      ${deducted
        ? `<p>Asking price Rs. ${o.amount}, less Rs. ${shipping} shipping you offered to cover. zarketplace takes no platform fee.</p>`
        : `<p>That is 100% of your asking price. zarketplace takes no platform fee.</p>`}
      ${button(sellerUrl(o, ctx.siteUrl), "View seller portal")}
    </div>`,
  };
}
