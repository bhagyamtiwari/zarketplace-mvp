// Vendor email bodies.
//
// Every template here renders from the notification payload and nothing else.
// It has no database handle and no order, so it cannot reach a resale price, a
// model figure, a spread component or a buyer even by mistake. The vendor's
// counterparty is zarketplace, in every sentence.
//
// Copy is governed by COPY_RULES.md: rupee amounts only, never a percentage,
// "your item" and "your payout" rather than "your sale" or "your buyer".

export interface VendorEmail { subject: string; html: string }

const INK = "#111111";
const MUTED = "#5a5a5a";
const PAPER = "#ffffff";
const RULE = "#e6e6e6";

const WRAP =
  `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:${INK}; background-color:${PAPER}; max-width:560px; margin:0 auto; padding:32px;`;

/**
 * Full document with the background painted by a table and by bgcolor
 * attributes. A bare <div> leaves the page background to the client, and in
 * dark mode that is near-black behind our explicit dark text.
 */
function shell(body: string): string {
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

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function rupees(v: unknown): string {
  const n = Number(v ?? 0);
  return `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function longDate(v: unknown): string {
  if (!v) return "";
  return new Date(String(v)).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function shortDate(v: unknown): string {
  if (!v) return "";
  return new Date(String(v)).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function header(site: string): string {
  // Dedicated asset with the background baked into the pixels: the site
  // wordmark is pure black on transparency and vanishes on a dark ground.
  // width/height as HTML attributes because Outlook will not infer them.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="margin-bottom:28px; padding-bottom:20px; border-bottom:1px solid ${RULE}; width:100%; background-color:${PAPER};">
    <tr><td bgcolor="${PAPER}" style="background-color:${PAPER}; line-height:0;">
      <img src="${site}/images/email-wordmark.png" alt="zarketplace" width="169" height="35" style="display:block; width:169px; height:35px; border:0; outline:none; text-decoration:none;" />
    </td></tr></table>`;
}

// Table-based, with bgcolor as an attribute. A styled anchor loses its
// background wherever inline styles on inline elements are stripped, which
// rendered the button as near-black text on a dark ground.
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr><td align="center" bgcolor="${INK}" style="background-color:${INK}; padding:14px 24px;">
      <a href="${href}" style="color:${PAPER}; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:inline-block;">${label}</a>
    </td></tr></table>`;
}

function h1(text: string): string {
  return `<h1 style="color:${INK}; font-weight:900; text-transform:uppercase; letter-spacing:-1px; font-size:26px; margin:0 0 16px;">${text}</h1>`;
}

type Payload = Record<string, unknown>;

export function renderVendorEmail(
  kind: string, payload: Payload, site: string,
): VendorEmail | null {
  const title = esc(payload.item_title ?? "your item");
  const listingId = String(payload.listing_id ?? "");
  const offerUrl = `${site}/offer/${listingId}`;
  const portalUrl = `${site}/vendor-portal`;
  const top = header(site);

  switch (kind) {
    case "offer_made":
      return {
        subject: `Your offer: ${rupees(payload.offer_amount)} · ${payload.item_title ?? "your item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1(`We will pay you ${rupees(payload.offer_amount)}.`)}
          <p style="color:#111111; margin:0 0 14px;">That is our offer for your ${title}, and it is what we pay you in full when it sells.</p>
          <p style="color:#111111; margin:0 0 14px;">The amount is fixed now, before your item is listed, and it does not change afterwards for any reason.</p>
          <p style="color:#111111; margin:0 0 14px;">Accept it and we list the item. When it sells we send you a prepaid label, you post it to us, and we pay you as soon as we have checked it in.</p>
          ${button(offerUrl, "Review your offer")}
          <p style="color:#5a5a5a; font-size:13px;">Not for you? You can turn it down, improve the item, and send it back to us for another look.</p>
        </div>`),
      };

    case "offer_rejected": {
      const reasons = Array.isArray(payload.reasons) ? (payload.reasons as unknown[]).map(String) : [];
      const list = reasons.length
        ? `<ul style="padding-left:18px; margin:16px 0;">${reasons.map((r) => `<li style="margin-bottom:6px;">${esc(r)}</li>`).join("")}</ul>`
        : "";
      const note = payload.note
        ? `<p style="color:#111111; border-left:2px solid #000; padding-left:16px; color:#333;">${esc(payload.note)}</p>` : "";
      return {
        subject: `About your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Not this time.")}
          <p style="color:#111111; margin:0 0 14px;">We are not able to make an offer on your ${title} as it stands.</p>
          ${list}${note}
          <p style="color:#111111; margin:0 0 14px;">This is not final. Sort out what is listed above, send the item back to us, and we will look again within 24 hours.</p>
          ${button(offerUrl, "Improve and resend")}
        </div>`),
      };
    }

    case "item_sold":
      return {
        subject: `Time to post your ${payload.item_title ?? "item"} · by ${shortDate(payload.ship_by)}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Your item is bought.")}
          <p style="color:#111111; margin:0 0 14px;">Pack your ${title} and hand it to the courier <strong>by ${esc(longDate(payload.ship_by))}</strong>.</p>
          <p style="color:#111111; margin:0 0 14px;">We have paid for the label. You do not arrange a pickup and you do not pay for the postage.</p>
          <p style="color:#111111; margin:0 0 14px;">Once it reaches us we check it in and send your ${rupees(payload.offer_amount)}.</p>
          ${button(portalUrl, "See what to do")}
          <p style="color:#5a5a5a; font-size:13px;">Cannot send it? Tell us before the date above and we will sort it out.</p>
        </div>`),
      };

    case "label_issued":
      return {
        subject: `Your label is ready · ${payload.item_title ?? "your item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Your label is ready.")}
          <p style="color:#111111; margin:0 0 14px;">Print it, tape it to the parcel, and hand it over by <strong>${esc(longDate(payload.ship_by))}</strong>.
             Courier: ${esc(payload.courier ?? "—")}. Tracking: ${esc(payload.awb ?? "—")}.</p>
          ${button(portalUrl, "Get your label")}
        </div>`),
      };

    case "ship_by_reminder":
      return {
        subject: `2 days left to post your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Two days left.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} needs to be with the courier by <strong>${esc(longDate(payload.ship_by))}</strong>. We have not seen a pickup scan yet.</p>
          <p style="color:#111111; margin:0 0 14px;">If it has already gone, ignore this — scans can take a day to appear.</p>
          <p style="color:#111111; margin:0 0 14px;">If you cannot send it, tell us now rather than letting the date pass.</p>
          ${button(portalUrl, "I cannot send this")}
        </div>`),
      };

    case "received_at_hub":
      return {
        subject: `We have your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("It arrived.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} reached us today. We are checking it against your listing now, and you will hear from us within 24 hours.</p>
        </div>`),
      };

    case "accepted":
      return {
        subject: `Accepted · ${rupees(payload.offer_amount)} on its way`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Accepted.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} is checked in and it is ours now. Your ${rupees(payload.offer_amount)} is being sent to you.</p>
          <p style="color:#111111; margin:0 0 14px;">Nothing further is needed from you.</p>
        </div>`),
      };

    case "payout_sent":
      return {
        subject: `${rupees(payload.offer_amount)} sent`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1(`${rupees(payload.offer_amount)} sent.`)}
          <p style="color:#111111; margin:0 0 14px;">We have sent your payout for the ${title} to your UPI ID, ${esc(payload.upi_vpa ?? "on file")}. It usually lands within a few hours.</p>
          <p style="color:#111111; margin:0 0 14px;">If it has not arrived in two working days, reply to this email.</p>
        </div>`),
      };

    case "refused":
      return {
        subject: `We could not accept your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("We could not accept this item.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} reached us, but we cannot take it: <strong>${esc(payload.reason_detail ?? "it did not match its listing")}</strong>.</p>
          <p style="color:#111111; margin:0 0 14px;">No payout is due for this item.</p>
          <p style="color:#111111; margin:0 0 14px;"><strong>You can have it back.</strong> Tell us and we will send it, and you cover the return postage.</p>
          <p style="color:#111111; margin:0 0 14px;">We will hold it until <strong>${esc(shortDate(payload.abandonment_deadline))}</strong>. After that date we may donate or dispose of it, as you agreed when you listed it.</p>
          ${button(portalUrl, "Ask for it back")}
        </div>`),
      };

    case "abandonment_30":
      return {
        subject: `30 days to claim your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("30 days left.")}
          <p style="color:#111111; margin:0 0 14px;">We are still holding your ${title}. If you want it back, tell us and we will send it — you cover the return postage.</p>
          <p style="color:#111111; margin:0 0 14px;">We hold it until <strong>${esc(shortDate(payload.abandonment_deadline))}</strong>, after which we may donate or dispose of it.</p>
          ${button(portalUrl, "Ask for it back")}
        </div>`),
      };

    case "abandonment_7":
      return {
        subject: `Last week to claim your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("7 days left.")}
          <p style="color:#111111; margin:0 0 14px;">This is the last reminder about your ${title}. We hold it until <strong>${esc(shortDate(payload.abandonment_deadline))}</strong>.</p>
          <p style="color:#111111; margin:0 0 14px;">After that date it is donated or disposed of and cannot be recovered.</p>
          ${button(portalUrl, "Ask for it back")}
        </div>`),
      };

    case "vendor_cancelled":
      return {
        subject: `Cancelled · ${payload.item_title ?? "your item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Cancelled.")}
          <p style="color:#111111; margin:0 0 14px;">We have taken your ${title} off the site as you asked. Nothing further is needed and no payout is due.</p>
          <p style="color:#111111; margin:0 0 14px;">Thanks for telling us early rather than letting the date pass — it genuinely helps.</p>
        </div>`),
      };

    default:
      return null;
  }
}
