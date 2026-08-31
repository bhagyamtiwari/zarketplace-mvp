// Background removal for a listing photo.
//
// Two rules from the brief shape this: it is applied by default, and it NEVER
// blocks a listing. Every failure path here returns ok:false and the caller
// keeps the original image - a missing API key, a provider outage, a quota
// exhaustion and an unreadable file all end the same way, with the vendor's
// photo used exactly as they took it.
//
// The provider is remove.bg. With REMOVE_BG_API_KEY unset the function is a
// no-op that says so, which is the state until a key is bought.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const KEY = Deno.env.get("REMOVE_BG_API_KEY");
  if (!KEY) {
    // Not an error. The product works without this.
    return json({ ok: false, reason: "not_configured" });
  }

  try {
    const { image_base64 } = await req.json() as { image_base64?: string };
    if (!image_base64) return json({ ok: false, reason: "no_image" });

    const form = new FormData();
    form.append("image_file_b64", image_base64);
    form.append("size", "auto");
    // White rather than transparent: listing photos sit on a zinc-50 well and
    // a transparent PNG would show whatever is behind it in every context.
    form.append("bg_color", "ffffff");

    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": KEY },
      body: form,
    });

    if (!res.ok) {
      return json({ ok: false, reason: `provider_${res.status}` });
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return json({ ok: true, image_base64: btoa(binary) });
  } catch (err) {
    return json({ ok: false, reason: String((err as Error).message ?? err).slice(0, 200) });
  }
});
