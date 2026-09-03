// Shared building blocks for every email template.
//
// Each template lives in its own file and exports a single `(ctx) => EmailContent`
// function. They all share the helpers below so the look-and-feel stays
// consistent and so editing one template never touches another.

export interface EmailContext {
  // The full `orders` row (or {} when none was loaded).
  order: any;
  // Free-form payload for templates that don't map to an order (e.g. "custom").
  extra?: Record<string, unknown>;
  // Public site URL, used to build buyer/seller links.
  siteUrl: string;
}

export interface EmailContent {
  to: string;
  subject: string;
  html: string;
}

// The palette, stated once. Every colour below is explicit on every element
// that uses it: a mail client in dark mode paints its own background under
// anything that does not declare one, and then dark text on an unset
// background is invisible. Nothing here relies on a default.
export const INK = "#111111";
export const MUTED = "#5a5a5a";      // clears 4.5:1 on white, unlike the old #666
export const PAPER = "#ffffff";
export const RULE = "#e6e6e6";
export const BTN_BG = "#111111";
export const BTN_INK = "#ffffff";

// Outer wrapper style applied to every transactional email body.
export const baseStyle =
  `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:${INK}; background-color:${PAPER}; max-width:560px; margin:0 auto; padding:32px;`;

/**
 * Wrap a body in a complete document with the background painted by a table.
 *
 * Emails used to be shipped as a bare <div>. That leaves the page background
 * to the client, and in dark mode Apple Mail and Outlook paint it near-black
 * while leaving our explicit dark text alone, so the message renders as
 * invisible text on a dark ground.
 *
 * bgcolor is set as an HTML attribute as well as in CSS because several
 * clients strip style attributes on structural elements but honour bgcolor.
 * color-scheme tells the clients that read it not to auto-invert.
 */
export function shell(body: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
</head>
<body bgcolor="${PAPER}" style="margin:0; padding:0; background-color:${PAPER}; color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};">
  <tr><td align="center" bgcolor="${PAPER}" style="background-color:${PAPER};">
    ${body}
  </td></tr>
</table>
</body></html>`;
}

/**
 * Bulletproof button: a table with bgcolor, not a styled anchor.
 *
 * A styled <a> loses its background in any client that strips inline styles
 * on inline elements, which left near-black text on a dark ground: the button
 * was there and unreadable. The bgcolor attribute survives that, and the
 * anchor carries its own colour so the label never inherits the client's.
 */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="${BTN_BG}" style="background-color:${BTN_BG}; padding:14px 24px;">
        <a href="${href}" style="color:${BTN_INK}; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:inline-block;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// Wordmark header, prepended to every transactional email body so every
// send is recognizably from zarketplace at a glance in an inbox.
// Uses an absolute URL (siteUrl) since email clients fetch images over
// HTTP - a local /images/... path only works on the live site, not in mail.
// Built as a <table> (not flexbox/grid) since Outlook's rendering engine
// ignores modern CSS layout entirely - tables are the one layout primitive
// every email client renders consistently.
//
// The source PNG is a square canvas with the wordmark glyphs occupying
// only the middle ~14% of its height, so it's cropped to that band with a
// fixed-size cell (overflow:hidden) plus a shifted full-size image -
// object-fit/aspect-ratio aren't reliable enough across mail clients
// (Outlook desktop in particular) for this to be done with modern CSS.
export function header(siteUrl: string): string {
  // A dedicated asset with the background baked into the pixels. The site
  // wordmark is pure black on transparency, so on a dark ground it composites
  // to black-on-black and disappears, and no CSS recovers that because the
  // pixels carry no light of their own. width and height are set as HTML
  // attributes as well as CSS because Outlook will not infer them, and the
  // cell carries bgcolor so the white around the glyphs matches the image.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="margin-bottom:28px; padding-bottom:20px; border-bottom:1px solid ${RULE}; width:100%; background-color:${PAPER};">
    <tr>
      <td bgcolor="${PAPER}" style="background-color:${PAPER}; line-height:0;">
        <img src="${siteUrl}/images/email-wordmark.png" alt="zarketplace" width="169" height="35" style="display:block; width:169px; height:35px; border:0; outline:none; text-decoration:none;" />
      </td>
    </tr>
  </table>`;
}

// Listing photo thumbnail, shown above the order details on emails where
// seeing the item helps (payment confirmation, shipped). Renders nothing if
// the order has no listing_image_url.
export function listingImage(o: any): string {
  if (!o.listing_image_url) return "";
  return `<img src="${o.listing_image_url}" alt="${esc(o.listing_title ?? "")}" width="120" style="display:block; width:120px; height:160px; object-fit:cover; margin:16px 0; border:1px solid #eee;" />`;
}

export function trackUrl(o: any, siteUrl: string): string {
  return `${siteUrl}/track-order?order=${o.order_number}&email=${encodeURIComponent(o.buyer_email ?? "")}`;
}


export function esc(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
