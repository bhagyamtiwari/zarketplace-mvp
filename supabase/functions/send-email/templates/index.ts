// Template registry. Add a new email by dropping a file in this folder and
// registering it here — no other file needs to change.
import { baseStyle, EmailContent, EmailContext, esc } from "./_shared.ts";
import { orderConfirmationBuyer } from "./order-confirmation-buyer.ts";
import { orderNotificationSeller } from "./order-notification-seller.ts";
import { trackingUpdateBuyer } from "./tracking-update-buyer.ts";
import { payoutReleasedSeller } from "./payout-released-seller.ts";
import { paymentConfirmedBuyer } from "./payment-confirmed-buyer.ts";
import { paymentFailedBuyer } from "./payment-failed-buyer.ts";
import { paymentConflictBuyer } from "./payment-conflict-buyer.ts";
import { custom } from "./custom.ts";

type TemplateFn = (ctx: EmailContext) => EmailContent;

const TEMPLATES: Record<string, TemplateFn> = {
  order_confirmation_buyer: orderConfirmationBuyer,
  order_notification_seller: orderNotificationSeller,
  tracking_update_buyer: trackingUpdateBuyer,
  payout_released_seller: payoutReleasedSeller,
  payment_confirmed_buyer: paymentConfirmedBuyer,
  payment_failed_buyer: paymentFailedBuyer,
  payment_conflict_buyer: paymentConflictBuyer,
  custom: custom,
};

// Resolve a template by name and render it. Unknown templates fall back to a
// generic body so a bad name never throws.
export function buildEmail(template: string, ctx: EmailContext): EmailContent {
  const fn = TEMPLATES[template];
  if (fn) return fn(ctx);
  return {
    to: (ctx.extra?.to as string) ?? "",
    subject: "Notification from zarketplace",
    html: `<div style="${baseStyle}"><p>${esc(JSON.stringify(ctx.extra))}</p></div>`,
  };
}
