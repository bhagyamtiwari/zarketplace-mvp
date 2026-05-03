// Edge Function: send-email
//
// Purpose:
//   Sends transactional emails via Resend (default) given a template name and
//   an order_id. Logs every send to `email_log`.
//
// Templates supported:
//   - order_confirmation_buyer
//   - order_notification_seller
//   - tracking_update_buyer
//   - payout_released_seller
//
// Required env vars:
//   - RESEND_API_KEY        (sign up at resend.com — free tier covers MVP)
//   - EMAIL_FROM            e.g. "Zarketplace <orders@zarketplace.com>"
//                           Until your domain is verified in Resend, you can
//                           use "onboarding@resend.dev" for testing.
//   - PUBLIC_SITE_URL       e.g. https://zarketplace.com
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// This function is invoked from cashfree-webhook and from seller portal
// tracking updates. It can also be called directly with auth.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface SendEmailRequest {
  template: string;
  order_id?: string;
  to?: string; // override
  extra?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
    const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://zarketplace.com";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = (await req.json()) as SendEmailRequest;

    if (!body.template) return json({ error: "template required" }, 400);

    let order: any = null;
    if (body.order_id) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", body.order_id)
        .single();
      order = data;
    }

    const built = buildEmail(body.template, { order, extra: body.extra, siteUrl: SITE_URL });
    const recipient = body.to ?? built.to;

    if (!recipient) return json({ error: "no recipient" }, 400);

    if (!RESEND_API_KEY) {
      // Dev mode: just log and return ok
      console.log("[send-email] RESEND_API_KEY not set; skipping send", { recipient, subject: built.subject });
      await supabase.from("email_log").insert({
        to_email: recipient,
        template: body.template,
        subject: built.subject,
        related_order_id: body.order_id ?? null,
        status: "queued",
        error_message: "RESEND_API_KEY not configured (dev mode)",
      });
      return json({ ok: true, dev_mode: true });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: recipient,
        subject: built.subject,
        html: built.html,
      }),
    });

    const resendData = await resendRes.json();

    await supabase.from("email_log").insert({
      to_email: recipient,
      template: body.template,
      subject: built.subject,
      related_order_id: body.order_id ?? null,
      status: resendRes.ok ? "sent" : "failed",
      provider_id: resendData?.id ?? null,
      error_message: resendRes.ok ? null : JSON.stringify(resendData),
    });

    return json({ ok: resendRes.ok, provider: resendData });
  } catch (err) {
    console.error("send-email error", err);
    return json({ error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildEmail(
  template: string,
  ctx: { order: any; extra?: Record<string, unknown>; siteUrl: string },
): { to: string; subject: string; html: string } {
  const o = ctx.order ?? {};
  const trackUrl = `${ctx.siteUrl}/track-order?order=${o.order_number}&email=${encodeURIComponent(o.buyer_email ?? "")}`;
  const sellerUrl = `${ctx.siteUrl}/seller-portal?email=${encodeURIComponent(o.seller_email ?? "")}`;

  const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#111; max-width:560px; margin:0 auto; padding:32px;`;

  switch (template) {
    case "order_confirmation_buyer":
      return {
        to: o.buyer_email,
        subject: `Order confirmed · ${o.order_number}`,
        html: `<div style="${baseStyle}">
          <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Order confirmed</h1>
          <p>Hi ${esc(o.buyer_name)},</p>
          <p>Thanks for your order on Zarketplace! Your payment has been received and the seller has been notified to ship your item.</p>
          <h3 style="margin-top:24px;">${esc(o.listing_title)}</h3>
          <p style="color:#666; font-size:13px;">SKU: ${esc(o.listing_sku)}</p>
          <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
             <strong>Total:</strong> Rs. ${o.total_amount}</p>
          <a href="${trackUrl}" style="display:inline-block; background:#000; color:#fff; padding:14px 24px; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px;">Track your order</a>
          <p style="margin-top:32px; color:#888; font-size:11px;">— Team Zarketplace</p>
        </div>`,
      };

    case "order_notification_seller":
      return {
        to: o.seller_email,
        subject: `New sale · ${o.listing_title}`,
        html: `<div style="${baseStyle}">
          <h1 style="font-weight:900; text-transform:uppercase; letter-spacing:-1px;">You made a sale!</h1>
          <p>Your item <strong>${esc(o.listing_title)}</strong> has been purchased.</p>
          <p><strong>Order #:</strong> ${esc(o.order_number)}<br/>
             <strong>Buyer:</strong> ${esc(o.buyer_name)}<br/>
             <strong>Payout (after platform fee):</strong> Rs. ${o.seller_payout_amount}</p>
          <p>Please ship the item promptly and update the tracking number in your seller portal.</p>
          <a href="${sellerUrl}" style="display:inline-block; background:#000; color:#fff; padding:14px 24px; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px;">Open seller portal</a>
          <p style="margin-top:32px; color:#888; font-size:11px;">Payouts are released after delivery is confirmed by the team.</p>
        </div>`,
      };

    case "tracking_update_buyer":
      return {
        to: o.buyer_email,
        subject: `Your order has shipped · ${o.order_number}`,
        html: `<div style="${baseStyle}">
          <h1 style="font-weight:900; text-transform:uppercase;">Shipped!</h1>
          <p>Hi ${esc(o.buyer_name)}, your item is on its way.</p>
          <p><strong>Courier:</strong> ${esc(o.courier_name ?? "")}<br/>
             <strong>Tracking #:</strong> ${esc(o.tracking_number ?? "")}</p>
          <a href="${trackUrl}" style="display:inline-block; background:#000; color:#fff; padding:14px 24px; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px;">Track order</a>
        </div>`,
      };

    case "payout_released_seller":
      return {
        to: o.seller_email,
        subject: `Payout released · Rs. ${o.seller_payout_amount}`,
        html: `<div style="${baseStyle}">
          <h1 style="font-weight:900; text-transform:uppercase;">Payout released</h1>
          <p>Your payout of <strong>Rs. ${o.seller_payout_amount}</strong> for order ${esc(o.order_number)} has been released.</p>
          <a href="${sellerUrl}" style="display:inline-block; background:#000; color:#fff; padding:14px 24px; text-decoration:none; font-weight:900; text-transform:uppercase; letter-spacing:2px; font-size:11px;">View payouts</a>
        </div>`,
      };

    case "custom":
      // Used by admin email campaigns — caller passes { subject, html } in extra
      return {
        to: (ctx.extra?.to as string) ?? "",
        subject: (ctx.extra?.subject as string) ?? "Zarketplace",
        html: (ctx.extra?.html as string) ?? "",
      };

    default:
      return {
        to: (ctx.extra?.to as string) ?? "",
        subject: "Notification from Zarketplace",
        html: `<div style="${baseStyle}"><p>${esc(JSON.stringify(ctx.extra))}</p></div>`,
      };
  }
}

function esc(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
