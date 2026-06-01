// Custom: used by admin email campaigns — the caller passes { to, subject, html }
// in `extra`. No order is required.
import { EmailContent, EmailContext } from "./_shared.ts";

export function custom(ctx: EmailContext): EmailContent {
  return {
    to: (ctx.extra?.to as string) ?? "",
    subject: (ctx.extra?.subject as string) ?? "zarketplace",
    html: (ctx.extra?.html as string) ?? "",
  };
}
