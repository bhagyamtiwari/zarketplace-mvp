// Seller: "You made a sale!" notification, sent when an order is placed.
import { baseStyle, button, EmailContent, EmailContext, esc, header, sellerUrl } from "./_shared.ts";

export function orderNotificationSeller(ctx: EmailContext): EmailContent {
  const o = ctx.order ?? {};
  const note = (o.buyer_note ?? "").trim();
  // Same predicate as handle_order_delivered and calculateSellerPayout: the
  // rate is deducted only when WE bought the label. Self-ship shows Free to the
  // buyer but the seller paid their own courier, so nothing comes out.
  //
  // Derived from shipping_payer rather than free_shipping on purpose. Orders
  // placed by an admin or a service_role caller skip
  // orders_snapshot_from_listing entirely, so free_shipping is never stamped
  // and defaults to false. Reading it here told a free-shipping seller "the
  // buyer paid Rs. 0 for shipping", which is the wrong model and the wrong
  // number.
  const selfShip = (o.fulfillment_method ?? "zarketplace") === "self";
  const deducted = !selfShip && o.shipping_payer === "seller" ? Number(o.shipping_cost ?? 0) : 0;
  const payout = Math.max(0, Number(o.amount ?? 0) - deducted);
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
        ? `<p>You have 72 hours from the sale to pack this item and hand it to your courier. You chose to ship this one yourself, so book and pay for the courier, then add the courier name, the tracking number and a photo of the packed parcel in your seller portal. Your payout is not released until all three are there.</p>`
        : `<p>You have 72 hours from the sale to pack this item and hand it off for pickup. zarketplace books and pays the courier, so you never arrange a pickup or buy a label yourself.</p>`}
      ${deducted > 0
        ? `<p>You offered free shipping on this listing, so the shipping cost of Rs. ${deducted} comes out of your payout. Your payout for this sale is <strong>Rs. ${payout}</strong>.</p>`
        : `<p>Your full asking price is yours, with nothing deducted. Your payout for this sale is <strong>Rs. ${payout}</strong>.</p>`}
      <p>Your payout is released after the item is delivered and the buyer's 48-hour review window closes.</p>
      ${button(sellerUrl(o, ctx.siteUrl), "Open seller portal")}
    </div>`,
  };
}
