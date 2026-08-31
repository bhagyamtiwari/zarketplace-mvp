// The vendor-email assertion, pointed at the buyer's inbox.
//
// The rule on this side is the mirror of the vendor one: a buyer must never
// learn that anyone but zarketplace was involved. No vendor, no seller, no
// third party packing anything, no payment held on someone else's behalf.
//
// Run: deno test supabase/functions/send-email/templates/buyer.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEmail } from "./index.ts";

const BUYER_TEMPLATES = [
  "order_confirmation_buyer",
  "payment_confirmed_buyer",
  "payment_failed_buyer",
  "payment_conflict_buyer",
  "order_cancelled_buyer",
  "order_refunded_buyer",
  "order_delivered_buyer",
  "tracking_update_buyer",
];

// An order carrying every vendor field the schema still has on it, with
// canary values. A buyer template that reaches for any of them fails here.
const POISONED_ORDER = {
  id: "11111111-1111-1111-1111-111111111111",
  order_number: "ZK-0001",
  buyer_name: "Buyer Name",
  buyer_email: "buyer@example.com",
  buyer_phone: "9876500000",
  listing_title: "Black wool coat",
  listing_id: "22222222-2222-2222-2222-222222222222",
  amount: 5400,
  shipping_cost: 0,
  total_amount: 5400,
  buyer_protection_fee: 0,
  status: "paid",
  courier: "Delhivery",
  tracking_number: "1234567890",
  tracking_url: "https://shiprocket.co/tracking/1234567890",
  free_shipping: true,
  shipping_address: { fullName: "Buyer Name", address: "12 Buyer Road", city: "Bangalore", state: "Karnataka", pincode: "560001" },

  // None of the following may reach a buyer.
  seller_email: "VENDOREMAIL_LEAKCANARY@example.com",
  seller_id: "33333333-3333-3333-3333-333333333333",
  seller_display_name: "VENDORNAME_LEAKCANARY",
  seller_instagram: "https://instagram.com/VENDORHANDLE_LEAKCANARY",
  seller_upi_vpa_snapshot: "VENDORUPI_LEAKCANARY@upi",
  seller_state_code: "HR",
  pickup_address: { address: "VENDORSTREET_LEAKCANARY", city: "VENDORCITY_LEAKCANARY", pincode: "122001" },
  pickup_state: "VENDORSTATE_LEAKCANARY",
  pickup_pincode: "122001",
};

const CANARIES = [
  "VENDOREMAIL_LEAKCANARY", "VENDORNAME_LEAKCANARY", "VENDORHANDLE_LEAKCANARY",
  "VENDORUPI_LEAKCANARY", "VENDORSTREET_LEAKCANARY", "VENDORCITY_LEAKCANARY",
  "VENDORSTATE_LEAKCANARY", "122001",
  "33333333-3333-3333-3333-333333333333",
];

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/\bseller\b/i, "says seller"],
  [/\bvendor\b/i, "mentions a vendor"],
  [/\bescrow\b/i, "describes escrow"],
  [/\bthe seller (packs|sends|ships)\b/i, "says someone else ships"],
  [/\breleased to\b/i, "implies money moves to a third party"],
  [/\bcommission\b/i, "mentions commission"],
  [/\bmarketplace\b/i, "calls itself a marketplace"],
];

Deno.test("every buyer email renders", () => {
  for (const t of BUYER_TEMPLATES) {
    const email = buildEmail(t, { order: POISONED_ORDER, siteUrl: "https://www.zarketplace.com" });
    assert(email.subject.length > 0, `${t} has no subject`);
    assert(email.html.length > 0, `${t} has no body`);
    assert(email.to === POISONED_ORDER.buyer_email, `${t} is not addressed to the buyer`);
  }
});

Deno.test("no buyer email leaks a vendor", () => {
  for (const t of BUYER_TEMPLATES) {
    const email = buildEmail(t, { order: POISONED_ORDER, siteUrl: "https://www.zarketplace.com" });
    const haystack = `${email.to}\n${email.subject}\n${email.html}`;

    for (const canary of CANARIES) {
      assert(!haystack.includes(canary), `${t} leaked "${canary}" to a buyer`);
    }

    const copy = haystack.replace(/<[^>]*>/g, " ");
    for (const [pattern, why] of FORBIDDEN_PATTERNS) {
      assert(!pattern.test(copy), `${t} ${why}`);
    }
  }
});
