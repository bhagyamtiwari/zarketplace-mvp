// Buyer: "Shipped!" tracking update, sent when the seller adds tracking info.
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, listingImage, trackUrl } from "./_shared.ts";

export function trackingUpdateBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Your order has shipped · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase;">Shipped.</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)}, your item is on its way.</p>
      ${listingImage(o)}
      <p style="color:#111111; margin:0 0 14px;"><strong>Courier:</strong> ${esc(o.courier ?? "")}<br/>
         <strong>Tracking #:</strong> ${esc(o.tracking_number ?? "")}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track order")}
    </div>`),
  };
}
