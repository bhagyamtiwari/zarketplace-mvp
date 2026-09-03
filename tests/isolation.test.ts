// What the endpoint serves, not what the client asks for.
//
// public_listings served the vendor's name and pincode to anyone with the
// publishable key for months, while the client's SELECT list looked correct.
// orders served a buyer's name, email, phone, address and the resale price to
// the vendor who supplied the item. Both passed every previous isolation
// check, because those checked the query rather than the endpoint.
//
// This talks to the live REST API as the roles real callers occupy and asserts
// on the columns that actually come back.
//
// Run: deno test --allow-net --allow-env --allow-read tests/isolation.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://wfaxtxprngyrxsmahxxa.supabase.co";
// The publishable key is public by design - it is in the site's JS bundle.
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmYXh0eHBybmd5cnhzbWFoeHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2OTc2OTAsImV4cCI6MjA4ODI3MzY5MH0.2-n0PP-4-_IlAK6qLrdtoGIuyV47xtfnHSeEMmqnDEQ";
const REST = `${SUPABASE_URL}/rest/v1`;

/**
 * Every object a browser can address. Kept explicitly rather than discovered,
 * because PostgREST only publishes its schema to service_role - and the
 * migration cross-check below fails the build if this list falls behind.
 */
const OBJECTS = [
  "public_listings", "listing_acquisitions", "acquisitions", "vendors",
  "listings", "orders", "profiles", "payouts", "shipments",
  "fulfillment_failures", "listing_agreements", "vendor_notifications",
  "lifecycle_events", "acquisition_config", "acquisition_margin_tiers",
  "fulfillment_config", "pricing_config", "shipping_categories", "gst_states",
  "cart_items", "email_log", "admin_audit_log", "blocked_checkouts",
  "buyer_tracking", "hub_queue", "vendor_offers", "hub_location",
  "internal_config", "abandoned_items", "pending_refunds", "acquisition_queue",
  "sales", "seller_payouts",
];

/**
 * Column-name fragments that must never come back to anon or to a vendor.
 * Matched as substrings, so a new column called vendor_upi_backup is caught
 * without anyone remembering to add it.
 */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/seller_display_name|seller_instagram|seller_email|vendor_email|full_name/i, "vendor identity"],
  // seller_id survived three audits of this view because the list only looked
  // for columns that NAME someone. A bare uuid names nobody, and still lets
  // anyone group the catalogue by vendor and count each one's items, which is
  // vendor structure reaching buyers. A stable per-vendor key is identity
  // whether or not it is readable.
  [/^seller_id$|^vendor_id$|seller_uuid/i, "a per-vendor key a buyer could group by"],
  [/upi|bank_account|ifsc|\bpan\b/i, "vendor payout identity"],
  [/pickup_address|pickup_pincode|pickup_state|hub_notes/i, "vendor or hub location"],
  [/asking_price/i, "the vendor's ask"],
  [/expected_resale|model_offer_amount|offer_breakdown|margin/i, "resale price or spread"],
  [/buyer_name|buyer_email|buyer_phone|shipping_address|billing_address/i, "buyer identity"],
  [/razorpay|payment_utr|payment_receipt/i, "payment records"],
];

interface Probe { object: string; status: number; rows: unknown[] }

async function fetchAs(object: string, token: string): Promise<Probe> {
  const res = await fetch(`${REST}/${object}?select=*&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  let rows: unknown[] = [];
  if (res.ok) {
    const body = await res.json().catch(() => []);
    rows = Array.isArray(body) ? body : [];
  } else {
    await res.text().catch(() => "");
  }
  return { object, status: res.status, rows };
}

function assertNoForbiddenColumns(probe: Probe, role: string) {
  if (probe.rows.length === 0) return; // nothing served; RLS or grants held
  const columns = Object.keys(probe.rows[0] as Record<string, unknown>);
  for (const [pattern, why] of FORBIDDEN) {
    const hit = columns.find((c) => pattern.test(c));
    assert(
      !hit,
      `${role} can read "${hit}" from ${probe.object} — that is ${why}. ` +
      `Removing it from the client query does not help: the view or policy is the boundary.`,
    );
  }
}

Deno.test("anon cannot read vendor identity, spread, or buyer identity", async () => {
  for (const object of OBJECTS) {
    const probe = await fetchAs(object, ANON_KEY);
    assertNoForbiddenColumns(probe, "anon");
  }
});

Deno.test("public_listings still serves the columns the storefront needs", async () => {
  // The inverse guard: a future over-correction that empties the view would
  // break the site silently, and a leak test alone would call that a pass.
  const probe = await fetchAs("public_listings", ANON_KEY);
  assert(probe.status === 200, `public_listings returned ${probe.status}`);
  if (probe.rows.length > 0) {
    const columns = Object.keys(probe.rows[0] as Record<string, unknown>);
    for (const needed of ["id", "title", "price", "image_url", "condition"]) {
      assert(columns.includes(needed), `public_listings no longer serves ${needed}`);
    }
  }
});

// A vendor session needs real credentials. Set TEST_VENDOR_EMAIL and
// TEST_VENDOR_PASSWORD in CI for a throwaway non-admin account and this covers
// the orders class of bug too. Without them it says so rather than passing
// quietly, because a skipped isolation test that looks green is how this kind
// of thing survives.
Deno.test("a vendor cannot read buyer identity or the resale price", async () => {
  const email = Deno.env.get("TEST_VENDOR_EMAIL");
  const password = Deno.env.get("TEST_VENDOR_PASSWORD");
  if (!email || !password) {
    console.warn(
      "\n  SKIPPED: set TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD to a throwaway " +
      "non-admin account to cover the vendor role. Anon coverage ran.\n",
    );
    return;
  }

  const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(auth.ok, `could not sign in the test vendor: ${auth.status}`);
  const { access_token } = await auth.json();
  assert(access_token, "no access token for the test vendor");

  for (const object of OBJECTS) {
    const probe = await fetchAs(object, access_token);
    assertNoForbiddenColumns(probe, "a vendor");
  }
});

Deno.test("every object in the migrations is covered by this test", async () => {
  // Adding a view or table without adding it here would leave a hole this
  // suite silently ignores, so the omission fails the build instead.
  const dir = "supabase/migrations";
  const declared = new Set<string>();
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(`${dir}/${entry.name}`);
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_]+)/gi)) {
      declared.add(m[1].toLowerCase());
    }
  }
  const missing = [...declared].filter((d) => !OBJECTS.includes(d));
  assert(
    missing.length === 0,
    `these objects exist in migrations but are not probed by the isolation test: ${missing.join(", ")}. ` +
    `Add them to OBJECTS.`,
  );
});
