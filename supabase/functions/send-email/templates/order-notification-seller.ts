// Seller: "You made a sale!" notification, sent when an order is placed.
import { baseStyle, button, EmailContent, EmailContext, esc, header, sellerUrl } from "./_shared.ts";

export function orderNotificationSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  const note = (o.buyer_note ?? "").trim();
  const selfShip = o.shipping_mode === "self_ship";
  return {
    to: o.seller_email,
    subject: `New sale · ${o.listing_title}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">You made a sale.</h1>
      <p><strong>${esc(o.listing_title)}</strong> has been purchased.</p>
      <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
         <strong>Buyer:</strong> ${esc(o.buyer_name)}<br/>
         <strong>Amount:</strong> Rs. ${o.total_amount}</p>
      ${note ? `<div style="margin:20px 0; padding:14px 16px; border-left:3px solid #000; background:#fafafa;">
        <p style="margin:0 0 6px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:2px; color:#666;">Buyer's note / request</p>
        <p style="margin:0; white-space:pre-wrap;">${esc(note)}</p>
        <p style="margin:8px 0 0; font-size:12px; color:#888;">You're not obligated to fulfill this. It's your call.</p>
      </div>` : ""}
      ${selfShip
        // A self-ship seller must not be told we are booking a courier. This
        // email is the instruction they act on, so getting it wrong here means
        // an item nobody posts and a buyer waiting on a pickup that is never
        // coming.
        ? `<p>You listed this item as self-ship, so you send it with your own courier. Pack it and post it within 72 hours, then add the tracking link in your seller portal - that link is how we know it is on its way, and how the buyer follows it.</p>
           <p>The buyer paid no delivery charge, so your payout for this sale is <strong>Rs. ${o.amount}</strong>, your full asking price. Whatever your courier costs is yours to cover.</p>
           <p>Your payout is released after delivery is confirmed and the buyer's 48-hour review window closes. Adding tracking promptly is what starts that clock, so a self-ship payout usually takes longer than one on our courier.</p>`
        : `<p>You have 72 hours from the sale to pack this item and hand it off for pickup. zarketplace books and pays the courier, so you never arrange a pickup or buy a label yourself.</p>
           ${o.free_shipping
             ? `<p>You offered free shipping on this listing, so the shipping cost of Rs. ${o.shipping_cost} comes out of your payout. Your payout for this sale is <strong>Rs. ${Math.max(0, Number(o.amount) - Number(o.shipping_cost))}</strong>.</p>`
             : `<p>The buyer paid Rs. ${o.shipping_cost} for shipping at checkout, so your full asking price is yours. Your payout for this sale is <strong>Rs. ${o.amount}</strong>.</p>`}
           <p>Your payout is released after the item is delivered and the buyer's 48-hour review window closes.</p>`}
      ${button(sellerUrl(o, ctx.siteUrl), "Open seller portal")}
    </div>`,
  };
}
