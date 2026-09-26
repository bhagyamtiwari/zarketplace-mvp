// Drains the vendor notification outbox.
//
// Called by pg_cron through pg_net, so it authenticates on a shared secret
// rather than a user JWT - cron has no session to present. The secret is the
// only thing that gets you in; there is no path here that takes a recipient
// from the caller.
//
// The recipient is resolved from the vendors table using the notification's
// vendor_id. A caller cannot name an address, cannot select which vendor gets
// which message, and cannot supply body content: the payload was written by a
// SECURITY DEFINER enqueuer and the template renders from that alone.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderVendorEmail } from "./templates.ts";
import { htmlToText } from "../_shared/plainText.ts";

const BATCH = 50;
const MAX_ATTEMPTS = 4;

// The upload pipeline writes each photo at three widths, named by the suffix
// the web app's variantUrl() swaps on. The 400px one is the right size for an
// 88px-wide cell on a retina screen, and it is the smallest thing we can put
// in an inbox. Images from before that pipeline have no suffix and are used
// as they are.
const VARIANT_SUFFIX = /-(?:400|800|1600)\.(webp|jpe?g|png)$/i;

function coverImage(listing: { image_url?: unknown; image_urls?: unknown } | null): string {
  if (!listing) return "";
  const list = Array.isArray(listing.image_urls) ? listing.image_urls : [];
  const first = list.find((u) => typeof u === "string" && u) ?? listing.image_url;
  if (typeof first !== "string" || !first) return "";
  const m = first.match(VARIANT_SUFFIX);
  return m ? first.replace(VARIANT_SUFFIX, `-400.${m[1]}`) : first;
}

serve(async (req) => {
  const secret = Deno.env.get("DISPATCH_SECRET");
  const provided = req.headers.get("x-dispatch-secret");
  if (!secret || provided !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const SITE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://www.zarketplace.com";

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: rows, error } = await db
    .from("vendor_notifications")
    .select("id, vendor_id, listing_id, kind, payload, attempts")
    .eq("status", "queued")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  // The cover photos for the whole batch, in one query.
  //
  // This was a lookup per notification, which put a query inside a loop that
  // pg_cron already holds a connection for. Under a backlog the run outlived
  // its own schedule, the next run started on top of it, and the database ran
  // out of connections: the site could not load listings and the job could
  // not start. One query for fifty rows cannot do that.
  const listingIds = [...new Set((rows ?? []).map((r) => r.listing_id).filter(Boolean))];
  const covers = new Map<string, string>();
  if (listingIds.length) {
    const { data: listings } = await db
      .from("listings").select("id, image_url, image_urls").in("id", listingIds);
    for (const l of listings ?? []) covers.set(String(l.id), coverImage(l));
  }

  let sent = 0, failed = 0;

  for (const row of rows ?? []) {
    // Recipient comes from here and nowhere else.
    const { data: vendor } = await db
      .from("vendors").select("email").eq("id", row.vendor_id).single();
    const to = vendor?.email;

    const payload = {
      ...(row.payload as Record<string, unknown>),
      listing_id: row.listing_id,
      item_image: covers.get(String(row.listing_id)) ?? "",
    };
    const email = renderVendorEmail(row.kind, payload, SITE);

    if (!to || !email) {
      await db.from("vendor_notifications").update({
        status: "failed", attempts: row.attempts + 1,
        last_error: !to ? "No email on file for this vendor" : `No template for ${row.kind}`,
      }).eq("id", row.id);
      failed++;
      continue;
    }

    try {
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: EMAIL_FROM, to, subject: email.subject, html: email.html, text: htmlToText(email.html) }),
      });

      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);

      await db.from("vendor_notifications").update({
        status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1,
      }).eq("id", row.id);
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      // Stays queued until it has genuinely run out of attempts, so a blip at
      // the provider does not lose a vendor's message.
      await db.from("vendor_notifications").update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        attempts,
        last_error: String((err as Error).message ?? err).slice(0, 500),
      }).eq("id", row.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, considered: rows?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
