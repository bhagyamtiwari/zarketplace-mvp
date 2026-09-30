// Where a reply to any zarketplace email lands. Mail from an address nobody
// reads is a spam signal to Gmail and Outlook, and several emails tell the
// reader to reply (a payout that has not arrived, for one), so replies go to a
// real, monitored inbox. Override with the EMAIL_REPLY_TO secret.
export const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "contact@zarketplace.com";
