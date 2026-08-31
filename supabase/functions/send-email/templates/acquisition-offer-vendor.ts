// Vendor: we have made an offer on their item. Driven by `extra`, not by an
// order - there is no order at this point and there may never be one.
//
// One number, and no working. This email must never carry the resale price,
// the spread, or anything a vendor could reason back to either.
import { baseStyle, button, EmailContent, EmailContext, esc, header } from "./_shared.ts";

export function acquisitionOfferVendor(ctx: EmailContext): EmailContent {
  const e = ctx.extra ?? {};
  const title = String(e.listing_title ?? "your item");
  const listingId = String(e.listing_id ?? "");
  const amount = String(e.offer_amount ?? "");
  return {
    to: String(e.vendor_email ?? ""),
    subject: `Your offer: Rs. ${amount} · ${title}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">We will pay you Rs. ${esc(amount)}.</h1>
      <p>That is our offer for <strong>${esc(title)}</strong>, and it is what we pay you in full when it sells.</p>
      <p>The amount is fixed now, before the item is listed, and it does not change afterwards for any reason.</p>
      <p>Accept it and we list the item. When it sells we send you a prepaid label, you post it to us, and we pay you as soon as we have checked it in.</p>
      ${listingId ? button(`${ctx.siteUrl}/offer/${listingId}`, "Review your offer") : ""}
      <p style="color:#666; font-size:13px;">Not for you? You can turn it down, improve the item, and send it back to us for another look.</p>
    </div>`,
  };
}
