// Renders every vendor email with a deliberately poisoned payload and fails if
// anything a vendor must never see survives into the subject or the body.
//
// This is an assertion, not a review step. The rule it guards - a vendor never
// sees, approves or infers the resale price, and never learns a buyer exists -
// is the legal basis of the model, and it cannot depend on someone noticing a
// bad string in a diff.
//
// Run: deno test supabase/functions/dispatch-vendor-emails/templates.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderVendorEmail } from "./templates.ts";

const KINDS = [
  "offer_made", "offer_rejected", "item_sold", "label_issued",
  "ship_by_reminder", "received_at_hub", "accepted", "payout_sent",
  "refused", "abandonment_30", "abandonment_7", "vendor_cancelled",
];

// Every field a vendor must never receive, stuffed into the payload under both
// the names the code uses and names a careless future template might reach for.
const POISON = {
  item_title: "Black wool coat",
  listing_id: "11111111-1111-1111-1111-111111111111",
  offer_amount: 3200,
  upi_vpa: "name@upi",
  ship_by: "2026-09-05T00:00:00Z",
  abandonment_deadline: "2026-10-30T00:00:00Z",
  awb: "1234567890",
  courier: "Delhivery",
  reasons: ["The photos are too dark. Please reshoot in daylight."],
  note: "Also a shot of the label please.",
  reason_detail: "The tag stitching does not match the brand's.",

  // None of the following may ever appear in a rendered vendor email.
  expected_resale: 9999,
  resale_price: 9999,
  model_offer_amount: 8888,
  target_margin: 7777,
  inbound_shipping: 6666,
  outbound_shipping: 5555,
  payment_processing: 4444,
  rto_damage_reserve: 3333,
  margin_tier: "Rs. 2,000 - Rs. 20,000",
  buyer_email: "buyer@example.com",
  buyer_name: "Priya Buyer",
  buyer_id: "22222222-2222-2222-2222-222222222222",
  order_number: "ZK-0001",
  total_amount: 9999,
};

const FORBIDDEN_STRINGS = [
  "9999", "8888", "7777", "6666", "5555", "4444", "3333",
  "buyer@example.com", "Priya Buyer", "ZK-0001",
  "22222222-2222-2222-2222-222222222222",
  "Rs. 2,000 - Rs. 20,000",
];

// Words that betray the model even without a number attached.
const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/\bbuyer\b/i, "mentions a buyer"],
  [/\bseller\b/i, "says seller instead of vendor"],
  [/\byour sale\b/i, 'says "your sale"'],
  [/\bcommission\b/i, "mentions commission"],
  [/\bmargin\b/i, "mentions margin"],
  [/\bresale\b/i, "mentions resale"],
  [/\bspread\b/i, "mentions the spread"],
  [/\bfee\b/i, "mentions a fee"],
  [/%/, "contains a percentage"],
  [/\bsold to\b/i, 'says "sold to"'],
];

Deno.test("every vendor email renders", () => {
  for (const kind of KINDS) {
    const email = renderVendorEmail(kind, POISON, "https://www.zarketplace.com");
    assert(email, `${kind} did not render`);
    assert(email.subject.length > 0, `${kind} has no subject`);
    assert(email.html.length > 0, `${kind} has no body`);
  }
});

Deno.test("no vendor email leaks the resale price, the spread, or a buyer", () => {
  for (const kind of KINDS) {
    const email = renderVendorEmail(kind, POISON, "https://www.zarketplace.com")!;
    const haystack = `${email.subject}\n${email.html}`;

    for (const needle of FORBIDDEN_STRINGS) {
      assert(
        !haystack.includes(needle),
        `${kind} leaked "${needle}" into a vendor email`,
      );
    }

    // Compare against the words a vendor actually reads. Stripping attributes
    // individually is not enough: the wrapper's font stack contains a quoted
    // "Segoe UI", so an attribute-level regex terminates early and leaves CSS
    // behind - which is how the first run of this test reported a template
    // "mentioning margin" when the only margin was margin:0 auto.
    const copy = haystack.replace(/<[^>]*>/g, " ");

    for (const [pattern, why] of FORBIDDEN_PATTERNS) {
      assert(!pattern.test(copy), `${kind} ${why}`);
    }
  }
});

Deno.test("an unknown kind renders nothing rather than something wrong", () => {
  assert(renderVendorEmail("not_a_kind", POISON, "https://x") === null);
});
