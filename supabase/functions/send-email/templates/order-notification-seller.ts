// Seller: "You made a sale!" notification, sent when an order is placed.
import { baseStyle, button, EmailContent, EmailContext, esc, sellerUrl } from "./_shared.ts";

export function orderNotificationSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  const note = (o.buyer_note ?? "").trim();
  return {
    to: o.seller_email,
    subject: `New sale · ${o.listing_title}`,
    html: `<div style="${baseStyle}">
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">You made a sale!</h1>
      <p>Your item <strong>${esc(o.listing_title)}</strong> has been purchased.</p>
      <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Buyer:</strong> ${esc(o.buyer_name)}<br/>
         <strong>Amount:</strong> Rs. ${o.total_amount}</p>
      ${note ? `<div style="margin:20px 0; padding:14px 16px; border-left:3px solid #000; background:#fafafa;">
        <p style="margin:0 0 6px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:2px; color:#666;">Buyer's note / request</p>
        <p style="margin:0; white-space:pre-wrap;">${esc(note)}</p>
        <p style="margin:8px 0 0; font-size:12px; color:#888;">You may or may not be able to fulfill this — it's up to you.</p>
      </div>` : ""}
      <p>Please ship the item promptly and update the tracking number in your seller portal. Your payout will be released once shipping is confirmed.</p>
      ${button(sellerUrl(o, ctx.siteUrl), "Open seller portal")}
    </div>`,
  };
}
