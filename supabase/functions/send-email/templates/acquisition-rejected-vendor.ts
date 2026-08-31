// Vendor: we are not making an offer on this item yet, and here is what would
// change that. Never final - the whole point of this email is that they can
// fix what it names and send the item straight back.
import { baseStyle, button, EmailContent, EmailContext, esc, header } from "./_shared.ts";

export function acquisitionRejectedVendor(ctx: EmailContext): EmailContent {
  const e = ctx.extra ?? {};
  const title = String(e.listing_title ?? "your item");
  const listingId = String(e.listing_id ?? "");
  const reasons = Array.isArray(e.reasons) ? (e.reasons as unknown[]).map(String) : [];
  const note = String(e.note ?? "");

  const reasonList = reasons.length
    ? `<ul style="padding-left:18px; margin:16px 0;">${
        reasons.map((r) => `<li style="margin-bottom:6px;">${esc(r)}</li>`).join("")
      }</ul>`
    : "";

  return {
    to: String(e.vendor_email ?? ""),
    subject: `About ${title}`,
    html: `<div style="${baseStyle}">
      ${header(ctx.siteUrl)}
      <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Not this time.</h1>
      <p>We are not able to make an offer on <strong>${esc(title)}</strong> as it stands.</p>
      ${reasonList}
      ${note ? `<p style="border-left:2px solid #000; padding-left:16px; color:#333;">${esc(note)}</p>` : ""}
      <p>This is not final. Sort out what is listed above, send the item back to us, and we will look again within 24 hours.</p>
      ${listingId ? button(`${ctx.siteUrl}/offer/${listingId}`, "Improve and resend") : ""}
    </div>`,
  };
}
