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

// Single quotes around 'Segoe UI' on purpose. This string is interpolated
// into a double-quoted style attribute, so a double-quoted font name closed
// the attribute at the font stack and threw away everything after it: the
// max-width, the padding and the rest of the font stack. Every vendor email
// was going out full-bleed, unpadded and in the client's default serif.
const WRAP =
  `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:${INK}; background-color:${PAPER}; max-width:560px; margin:0 auto; padding:32px;`;

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
  // White wordmark on a black band, and the black is in the pixels rather than
  // in CSS. A transparent PNG with dark glyphs is the thing that breaks here:
  // a client in dark mode composites it against its own dark ground and the
  // logo disappears, and no CSS recovers that because those pixels carry no
  // light of their own. Flattened onto black, it looks the same everywhere.
  //
  // The asset is pre-cropped to the glyphs and rendered at 2x for retina, so
  // the transparent margin in the source file no longer decides the spacing.
  // width and height are HTML attributes as well as CSS because Outlook will
  // not infer them, and the cell carries bgcolor so the band runs the full
  // width rather than stopping at the image edge.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="margin-bottom:28px; width:100%; background-color:#000000;">
    <tr>
      <td align="center" bgcolor="#000000" style="background-color:#000000; line-height:0; font-size:0; text-align:center;">
        <img src="${site}/images/email-wordmark-dark.png" alt="zarketplace" width="216" height="57" style="display:block; width:216px; height:57px; border:0; outline:none; text-decoration:none; margin:0 auto;" />
      </td>
    </tr>
  </table>`;
}

/**
 * The item the email is about, as its photo and its name.
 *
 * It is here so that neither side has to read a sentence to work out which
 * item an email concerns: a vendor with three items in with us recognises the
 * photograph before the words, and so does anyone of ours looking over a
 * forwarded copy.
 *
 * The photo is whatever the vendor uploaded, which this pipeline writes as
 * webp. Gmail and Apple Mail render that; Outlook's desktop engine does not,
 * which is why the name sits beside the image as text rather than inside it,
 * and why the alt carries the name too. A missing or unrenderable photo costs
 * the reader nothing.
 */
function itemCard(image: string, title: string): string {
  const cell = image
    ? `<td width="88" valign="top" style="width:88px; padding-right:16px;">
         <img src="${image}" alt="${title}" width="88" height="110" style="display:block; width:88px; height:110px; border:0; outline:none; object-fit:cover; background-color:#f4f4f4;" />
       </td>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; margin:0 0 24px; border-top:1px solid ${RULE}; border-bottom:1px solid ${RULE};">
    <tr>
      <td style="padding:16px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr>
            ${cell}
            <td valign="middle" style="color:${INK}; font-weight:700; font-size:15px; line-height:1.4;">${title}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
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

// Two buttons side by side. Only the possession check needs this: it is the
// one email that asks a question, and the answer has to be one tap from the
// inbox or it does not get answered at all.
function buttonPair(
  primaryHref: string, primaryLabel: string,
  secondaryHref: string, secondaryLabel: string,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td bgcolor="${INK}" style="background-color:${INK}; padding:14px 24px;">
        <a href="${primaryHref}" style="color:${PAPER}; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:inline-block;">${primaryLabel}</a>
      </td>
      <td width="12" style="width:12px;">&nbsp;</td>
      <td style="border:1px solid ${INK}; padding:13px 23px;">
        <a href="${secondaryHref}" style="color:${INK}; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:inline-block;">${secondaryLabel}</a>
      </td>
    </tr></table>`;
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
  // Resolved by the dispatcher from the listing, which is the only thing it
  // reads beyond the notification. It selects the image column and nothing
  // else, so this stays a template that cannot reach a price.
  const card = itemCard(esc(payload.item_image ?? ""), title);

  switch (kind) {
    // The amount is deliberately absent. A number in an inbox is a number to
    // think about for a week; the offer page puts it in front of someone who
    // can accept it in the same breath. It is also the only page that can show
    // what accepting actually commits them to.
    case "offer_made":
      return {
        subject: `Your offer is ready · ${payload.item_title ?? "your item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("We want to buy it.")}
          ${card}
          <p style="color:#111111; margin:0 0 14px;">Your offer is waiting on your offer page. Accept it and the amount is fixed. It does not change if the item takes months to sell, or if it never sells at all. That risk is ours.</p>
          <p style="color:#111111; margin:0 0 14px;">Nothing gets posted today. The item stays with you until somebody buys it, and then we send a prepaid label and a courier collects it from your door.</p>
          ${button(offerUrl, "See your offer")}
          <p style="color:#5a5a5a; font-size:13px;">Not for you? Turn it down and nothing happens.</p>
        </div>`),
      };

    // Sent the moment an item is submitted. Someone who has just handed over
    // photographs of something they own should not be left wondering whether
    // the form worked.
    case "item_submitted":
      return {
        subject: `We have your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Got it.")}
          ${card}
          <p style="color:#111111; margin:0 0 14px;">Someone is looking at it properly. You will hear back <strong>within 24 hours</strong>, either an offer, a request for a better photo, or a no.</p>
          <p style="color:#111111; margin:0 0 14px;">Keep hold of the item. Nothing gets posted unless it sells.</p>
        </div>`),
      };

    // The patient lane's one moment of urgency. Until this arrives the vendor
    // has done nothing since accepting, so it has to carry the whole
    // instruction, not a reminder of one.
    case "item_sold":
      return {
        subject: `Sold · hand over your ${payload.item_title ?? "item"} by ${shortDate(payload.ship_by)}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("It sold. Time to send it.")}
          <p style="color:#111111; margin:0 0 14px;">It has been bought. Pack it and have it ready by <strong>${esc(longDate(payload.ship_by))}</strong>.</p>
          <p style="color:#111111; margin:0 0 14px;">The label and the pickup are paid for and booked. A courier collects it from your door, usually within 48 hours. You arrange nothing and pay nothing.</p>
          <p style="color:#111111; margin:0 0 14px;">Your ${rupees(payload.offer_amount)} is sent once it reaches us and we have checked it.</p>
          ${button(portalUrl, "See what to do")}
          <p style="color:#5a5a5a; font-size:13px;">Cannot send it? Tell us before the date above rather than letting it pass.</p>
        </div>`),
      };

    // MODEL.md §5. The patient lane's one real risk is that an item we have
    // promised a buyer is no longer where we think it is, and this is the only
    // thing standing between us and finding that out at the doorstep.
    case "possession_check": {
      const token = String(payload.token ?? "");
      const yes = `${site}/possession/${token}?a=yes`;
      const no  = `${site}/possession/${token}?a=no`;
      return {
        subject: `Still have your ${payload.item_title ?? "item"}?`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Quick check.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} is still on the site. Do you still have it, ready to send if somebody buys it?</p>
          ${buttonPair(yes, "Yes, still have it", no, "No, it is gone")}
          <p style="color:#5a5a5a; font-size:13px;">One tap, nothing to fill in. Saying no costs you nothing, and it beats a courier arriving for something you no longer have. If we do not hear back by ${esc(shortDate(payload.due_at))} we ask once more, then take it down.</p>
        </div>`),
      };
    }

    // MODEL.md §5. The amount is deliberately absent for the same reason it is
    // absent from the first offer: the number belongs on the offer page, next
    // to what accepting it commits them to.
    case "reoffer_made":
      return {
        subject: `A second go at your ${payload.item_title ?? "item"}?`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Want to try again, lower?")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} did not sell at the price we set. That is on us, not on you.</p>
          <p style="color:#111111; margin:0 0 14px;">We would like to try again lower. A new offer is waiting on your offer page, fixed the same way as the last one, for a shorter run.</p>
          ${button(offerUrl, "See the new offer")}
          <p style="color:#5a5a5a; font-size:13px;">Or say no and keep it. The item has been yours the whole time, and you owe us nothing either way.</p>
        </div>`),
      };

    case "listing_expired":
      return {
        subject: `Your ${payload.item_title ?? "item"} has come off the site`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("It did not sell this time.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} was on the site for 30 days and has now come off. It is yours, it always was, and you owe us nothing.</p>
          <p style="color:#111111; margin:0 0 14px;">Not everything sells at the first price. Send it to us again and we will take another look.</p>
          ${button(`${site}/sell`, "Send it to us again")}
        </div>`),
      };

    case "delisted_no_response":
      return {
        subject: `We have taken your ${payload.item_title ?? "item"} off the site`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("We could not reach you.")}
          <p style="color:#111111; margin:0 0 14px;">We asked twice whether you still had your ${title} and did not hear back, so we have taken it off the site.</p>
          <p style="color:#111111; margin:0 0 14px;">Nothing has gone wrong and you owe us nothing. An item we cannot actually send should not stay on sale.</p>
          <p style="color:#111111; margin:0 0 14px;">Still have it? Send it to us again for a fresh offer.</p>
          ${button(`${site}/sell`, "Send it to us again")}
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
          <p style="color:#111111; margin:0 0 14px;">We cannot make an offer on your ${title} as it stands.</p>
          ${list}${note}
          <p style="color:#111111; margin:0 0 14px;">This is not final. Fix what is above, send it back to us, and we look again within 24 hours.</p>
          ${button(offerUrl, "Improve and resend")}
        </div>`),
      };
    }

    case "label_issued":
      return {
        subject: `Your label is ready · ${payload.item_title ?? "your item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Your label is ready.")}
          <p style="color:#111111; margin:0 0 14px;">Print it, attach it to the parcel, and have it ready by <strong>${esc(longDate(payload.ship_by))}</strong>. A courier collects it from your door, usually within 48 hours. The postage is ours.</p>
          <p style="color:#5a5a5a; font-size:13px;">Courier: ${esc(payload.courier ?? "not assigned yet")}. Tracking: ${esc(payload.awb ?? "not assigned yet")}.</p>
          ${button(portalUrl, "Get your label")}
        </div>`),
      };

    case "ship_by_reminder":
      return {
        subject: `2 days left to hand over your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Two days left.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} needs to be with the courier by <strong>${esc(longDate(payload.ship_by))}</strong>. We have not seen a pickup scan yet.</p>
          <p style="color:#111111; margin:0 0 14px;">Already gone? Ignore this, scans can take a day to appear. Cannot send it? Tell us now rather than letting the date pass.</p>
          ${button(portalUrl, "I cannot send this")}
        </div>`),
      };

    case "received_at_hub":
      return {
        subject: `We have your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("It arrived.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} reached us today. We are checking it against your photos now, and you will hear from us within 24 hours.</p>
        </div>`),
      };

    case "accepted":
      return {
        subject: `Accepted · ${rupees(payload.offer_amount)} on its way`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Accepted.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} is checked in and ours now. Your ${rupees(payload.offer_amount)} is on its way.</p>
          <p style="color:#5a5a5a; font-size:13px;">Nothing further is needed from you.</p>
        </div>`),
      };

    case "payout_sent":
      return {
        subject: `${rupees(payload.offer_amount)} sent`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1(`${rupees(payload.offer_amount)} sent.`)}
          <p style="color:#111111; margin:0 0 14px;">Your payout for the ${title} has gone to ${esc(payload.upi_vpa ?? "your UPI ID on file")}. It usually lands within a few hours.</p>
          <p style="color:#5a5a5a; font-size:13px;">Not there in two working days? Reply to this email.</p>
        </div>`),
      };

    case "refused":
      return {
        subject: `We could not accept your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("We could not accept this item.")}
          <p style="color:#111111; margin:0 0 14px;">Your ${title} reached us, but we cannot take it: <strong>${esc(payload.reason_detail ?? "it did not match what was listed")}</strong>. No payout is due.</p>
          <p style="color:#111111; margin:0 0 14px;"><strong>You can have it back.</strong> Tell us and we will send it, and you cover the return postage.</p>
          <p style="color:#111111; margin:0 0 14px;">We hold it until <strong>${esc(shortDate(payload.abandonment_deadline))}</strong>. After that we may donate or dispose of it, as you agreed when you accepted our offer.</p>
          ${button(portalUrl, "Ask for it back")}
        </div>`),
      };

    case "abandonment_30":
      return {
        subject: `30 days to claim your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("30 days left.")}
          <p style="color:#111111; margin:0 0 14px;">We are still holding your ${title}. Want it back? Tell us and we will send it, and you cover the return postage.</p>
          <p style="color:#111111; margin:0 0 14px;">We hold it until <strong>${esc(shortDate(payload.abandonment_deadline))}</strong>, after which we may donate or dispose of it.</p>
          ${button(portalUrl, "Ask for it back")}
        </div>`),
      };

    case "abandonment_7":
      return {
        subject: `Last week to claim your ${payload.item_title ?? "item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("7 days left.")}
          <p style="color:#111111; margin:0 0 14px;">Last reminder about your ${title}. We hold it until <strong>${esc(shortDate(payload.abandonment_deadline))}</strong>.</p>
          <p style="color:#111111; margin:0 0 14px;">After that it is donated or disposed of and cannot be recovered.</p>
          ${button(portalUrl, "Ask for it back")}
        </div>`),
      };

    case "vendor_cancelled":
      return {
        subject: `Cancelled · ${payload.item_title ?? "your item"}`,
        html: shell(`<div style="${WRAP}">${top}
          ${h1("Cancelled.")}
          <p style="color:#111111; margin:0 0 14px;">We have taken your ${title} off the site as you asked. Nothing further is needed and no payout is due.</p>
          <p style="color:#111111; margin:0 0 14px;">Thanks for telling us early rather than letting the date pass. It genuinely helps.</p>
        </div>`),
      };

    default:
      return null;
  }
}
