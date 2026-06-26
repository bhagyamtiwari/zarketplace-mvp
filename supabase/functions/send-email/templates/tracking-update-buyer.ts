// Buyer: "Shipped!" tracking update, sent when the seller adds tracking info.
import { baseStyle, button, EmailContent, EmailContext, esc, header, listingImage, trackUrl } from "./_shared.ts";

export function trackingUpdateBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Your order has shipped · ${o.order_number}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase;">Shipped!</h1>
      <p>Hi ${esc(o.buyer_name)}, your item is on its way.</p>
      ${listingImage(o)}
      <p><strong>Courier:</strong> ${esc(o.courier ?? "")}<br/>
         <strong>Tracking #:</strong> ${esc(o.tracking_number ?? "")}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track order")}
    </div>`,
  };
}
