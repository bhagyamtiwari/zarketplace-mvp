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

const BATCH = 50;
const MAX_ATTEMPTS = 4;

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

  let sent = 0, failed = 0;

  for (const row of rows ?? []) {
    // Recipient comes from here and nowhere else.
    const { data: vendor } = await db
      .from("vendors").select("email").eq("id", row.vendor_id).single();
    const to = vendor?.email;

    const payload = { ...(row.payload as Record<string, unknown>), listing_id: row.listing_id };
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
        body: JSON.stringify({ from: EMAIL_FROM, to, subject: email.subject, html: email.html }),
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
