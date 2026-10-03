// Buyer: the order is packed and handed over for dispatch. Sent when an admin
// marks it shipped. The courier sends its own pickup and delivery updates, so
// this says it is on its way to them and that those updates will follow; the
// courier and tracking number are added when we have them.
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, listingImage, trackUrl } from "./_shared.ts";

export function trackingUpdateBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  const tracking = o.tracking_number
    ? `<p style="color:#111111; margin:0 0 14px;">${o.courier ? `<strong>Courier:</strong> ${esc(o.courier)}<br/>` : ""}
         <strong>Tracking #:</strong> ${esc(o.tracking_number)}</p>`
    : "";
  return {
    to: o.buyer_email,
    subject: `Your order is packed and ready to go · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase;">Packed and ready.</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)}, your order has been checked, packed and handed over for dispatch.</p>
      <p style="color:#111111; margin:0 0 14px;">The courier will message you with tracking updates as it travels, and again when it is out for delivery.</p>
      ${listingImage(o)}
      ${tracking}
      ${o.tracking_url ? button(esc(o.tracking_url), `Track with ${esc(o.courier || "the courier")}`) : ""}
      ${button(trackUrl(o, ctx.siteUrl), "View your order")}
    </div>`),
  };
}
