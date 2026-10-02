// Buyer: the courier has picked the parcel up. Sent when an admin marks the
// order shipped with a courier and AWB.
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, listingImage, trackUrl } from "./_shared.ts";

export function trackingUpdateBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Your order has been picked up · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase;">Picked up.</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)}, the courier has picked up your order and it is on its way to you. You can follow it from your order page.</p>
      ${listingImage(o)}
      <p style="color:#111111; margin:0 0 14px;"><strong>Courier:</strong> ${esc(o.courier ?? "")}<br/>
         <strong>Tracking #:</strong> ${esc(o.tracking_number ?? "")}</p>
      ${button(trackUrl(o, ctx.siteUrl), "Track order")}
    </div>`),
  };
}
