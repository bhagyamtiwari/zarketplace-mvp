// Buyer: their order was marked delivered (by the Shiprocket delivered webhook
// or an admin). Opens the 48-hour review window and tells them how to raise an
// issue if something is wrong before the seller is paid.
import { shell, baseStyle, button, EmailContent, EmailContext, esc, header, trackUrl } from "./_shared.ts";

export function orderDeliveredBuyer(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  return {
    to: o.buyer_email,
    subject: `Delivered · ${o.order_number}`,
    html: shell(`<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="color:#111111; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Delivered</h1>
      <p style="color:#111111; margin:0 0 14px;">Hi ${esc(o.buyer_name)},</p>
      <p style="color:#111111; margin:0 0 14px;">Your order has been delivered. We hope it's everything you expected.</p>
      <h3 style="color:#111111; margin-top:24px;">${esc(o.listing_title)}</h3>
      <p style="color:#111111; margin:0 0 14px;"><strong>Order #:</strong> ${esc(o.order_number)}</p>
      <p style="color:#111111; margin:0 0 14px;">If anything is wrong, you have <strong>48 hours</strong> to tell us. Reply to this email or write to <a href="mailto:contact@zarketplace.com">contact@zarketplace.com</a> with your order number, and we'll sort it out directly.</p>
      ${button(trackUrl(o, ctx.siteUrl), "View your order")}
    </div>`),
  };
}
