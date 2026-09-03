// Edge Function: email-preview
//
// Sends every template, once, to one address, so all 21 can be checked in a
// real client in one pass instead of by driving each state by hand.
//
// This exists because the automated check runs in Chromium, and Chromium is
// not a mail client: it does not strip inline styles, does not proxy CSS the
// way Gmail does, and does not render through Word the way Outlook does. The
// dark-mode failures that started this work are only observable in a real
// inbox, so the last mile has to be a real send.
//
// Admin only. Sends with obviously fake sample data, and prefixes every
// subject so a preview can never be mistaken for a real transactional mail.
//
// Required secrets: RESEND_API_KEY, EMAIL_FROM (already set).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { buildEmail } from "../send-email/templates/index.ts";
import { renderVendorEmail } from "../dispatch-vendor-emails/templates.ts";

const SAMPLE_ORDER = {
  order_number: "ZKT-PREVIEW", buyer_name: "Sample Buyer",
  buyer_email: "preview@example.com", listing_title: "Sample item",
  listing_sku: "SKU-PREVIEW", total_amount: 1999, amount: 1899,
  shipping_cost: 100, buyer_protection_fee: 0, tracking_number: "TRKPREVIEW",
  courier_name: "Delhivery", listing_image_url: null, refund_amount: 1999,
  cancel_reason: "Sample reason", payment_utr: "UTRPREVIEW",
};

const BUYER_TEMPLATES = [
  "order_confirmation_buyer", "tracking_update_buyer", "payment_confirmed_buyer",
  "payment_failed_buyer", "payment_conflict_buyer", "order_cancelled_buyer",
  "order_refunded_buyer", "order_delivered_buyer",
];

const VENDOR_PAYLOADS: Record<string, Record<string, unknown>> = {
  offer_made: { offer_amount: 1200, expires_at: new Date(Date.now() + 5 * 864e5).toISOString() },
  offer_rejected: { reasons: ["The photos are too dark. Please reshoot in daylight."], note: null },
  item_sold: { offer_amount: 1200 },
  label_issued: { ship_by: new Date(Date.now() + 5 * 864e5).toISOString(), tracking_number: "TRKPREVIEW" },
  ship_by_reminder: { ship_by: new Date(Date.now() + 2 * 864e5).toISOString() },
  received_at_hub: {},
  accepted: { offer_amount: 1200 },
  payout_sent: { offer_amount: 1200, upi_vpa: "sample@upi" },
  refused: { reason: "CONDITION_MISMATCH", note: "Sample mismatch note" },
  abandonment_30: {},
  abandonment_7: {},
  vendor_cancelled: {},
};

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
    const SITE = Deno.env.get("SITE_URL") ?? "https://www.zarketplace.com";
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY is not set" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader.replace(/^Bearer\s+/i, "Bearer ") } },
    });
    const { data: u, error: uErr } = await caller.auth.getUser();
    if (uErr || !u?.user) return json({ error: "Invalid or expired session" }, 401);
    const { data: isAdmin } = await caller.rpc("is_admin");
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as { to?: string };
    const to = (body.to ?? "").trim();
    if (!to) return json({ error: "Pass { to: \"you@example.com\" }" }, 400);

    const sent: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    const deliver = async (name: string, subject: string, html: string) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        // Prefixed so a preview is never mistaken for a real send, and
        // numbered so a client that threads by subject keeps them apart.
        body: JSON.stringify({ from: EMAIL_FROM, to, subject: `[PREVIEW ${sent.length + failed.length + 1}] ${subject}`, html }),
      });
      if (res.ok) sent.push(name);
      else failed.push({ name, error: `${res.status} ${await res.text()}` });
      // Resend's free tier rate limits; pace them rather than losing half.
      await new Promise((r) => setTimeout(r, 600));
    };

    for (const t of BUYER_TEMPLATES) {
      const e = buildEmail(t, { order: SAMPLE_ORDER, siteUrl: SITE });
      await deliver(`buyer/${t}`, e.subject, e.html);
    }
    for (const [kind, payload] of Object.entries(VENDOR_PAYLOADS)) {
      const e = renderVendorEmail(kind, { ...payload, item_title: "Sample item", listing_id: "00000000-0000-0000-0000-000000000000" }, SITE);
      if (!e) { failed.push({ name: `vendor/${kind}`, error: "renderVendorEmail returned null" }); continue; }
      await deliver(`vendor/${kind}`, e.subject, e.html);
    }

    // Reported back so the sender is checked before the rendering is judged:
    // a preview that lands in spam because of an unverified From tells you
    // nothing about dark mode. Not sensitive - it is the public From address.
    return json({
      from: EMAIL_FROM,
      sender_is_resend_default: EMAIL_FROM === "onboarding@resend.dev",
      to, sent: sent.length, failed: failed.length,
      sent_templates: sent, failures: failed,
    });
  } catch (err) {
    console.error("email-preview error", err);
    return json({ error: String(err) }, 500);
  }
});
