// Custom: used by admin email campaigns — the caller passes { to, subject, html }
// in `extra`. No order is required.
import { shell, baseStyle, EmailContent, EmailContext } from "./_shared.ts";

export function custom(ctx: EmailContext): EmailContent {
  return {
    to: (ctx.extra?.to as string) ?? "",
    subject: (ctx.extra?.subject as string) ?? "zarketplace",
    // Wrapped like every other send. An admin campaign is still an email a
    // client will paint its own dark ground behind.
    html: shell(`<div style="${baseStyle}">${(ctx.extra?.html as string) ?? ""}</div>`),
  };
}
