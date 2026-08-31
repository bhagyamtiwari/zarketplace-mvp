// The vendor's address must never reach a buyer. This asserts it on the
// payload we actually send to the courier, which is the thing that becomes a
// label and a tracking record.
//
// Run: deno test supabase/functions/shiprocket-book-leg/payload.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOutboundOrderPayload, buildInboundOrderPayload,
  buildHubPickupPayload, type HubLocation, type Addr,
} from "./payload.ts";

const HUB: HubLocation = {
  nickname: "zarketplace-hub",
  contact_name: "zarketplace",
  email: "contact@zarketplace.com",
  phone: "9000000000",
  address: "Unit 4, Hub Lane",
  address_2: "Okhla",
  city: "New Delhi",
  state: "Delhi",
  pincode: "110020",
};

// Every field of a vendor address, with values distinctive enough that any
// appearance anywhere in a serialised payload is unmistakable.
const VENDOR: Addr = {
  fullName: "VENDORNAME_LEAKCANARY",
  phone: "9812345678",
  address: "VENDORSTREET_LEAKCANARY 22",
  landmark: "VENDORLANDMARK_LEAKCANARY",
  city: "VENDORCITY_LEAKCANARY",
  state: "Haryana",
  pincode: "122001",
};

const BUYER: Addr = {
  fullName: "Buyer Name",
  phone: "9876500000",
  address: "12 Buyer Road",
  landmark: "Near the park",
  city: "Bangalore",
  state: "Karnataka",
  pincode: "560001",
};

const VENDOR_CANARIES = [
  "VENDORNAME_LEAKCANARY", "VENDORSTREET_LEAKCANARY",
  "VENDORLANDMARK_LEAKCANARY", "VENDORCITY_LEAKCANARY",
  "9812345678", "122001",
];

Deno.test("the outbound payload cannot carry a vendor address", () => {
  const payload = buildOutboundOrderPayload({
    hub: HUB,
    buyerDelivery: BUYER,
    buyerName: "Buyer Name",
    buyerEmail: "buyer@example.com",
    buyerPhone: "9876500000",
    reference: "ZK-0001",
    itemTitle: "Black wool coat",
    sku: "ZV-123",
    shippingCategory: "outerwear",
    saleValue: 5400,
  });

  const serialised = JSON.stringify(payload);
  for (const canary of VENDOR_CANARIES) {
    assert(
      !serialised.includes(canary),
      `outbound payload leaked the vendor value "${canary}"`,
    );
  }
});

Deno.test("the outbound consignor is the hub, never a per-order location", () => {
  const payload = buildOutboundOrderPayload({
    hub: HUB, buyerDelivery: BUYER, buyerName: "B", buyerEmail: "b@e.com",
    buyerPhone: "9876500000", reference: "ZK-0001", itemTitle: "Coat",
    sku: "ZV-123", shippingCategory: "outerwear", saleValue: 5400,
  });
  // The old code used `zk-<order id>` as the pickup nickname, registered to the
  // vendor's own address. Anything order-scoped here is that bug returning.
  assertEquals(payload.pickup_location, HUB.nickname);
  assert(!payload.pickup_location.includes("ZK-0001"));
});

Deno.test("the outbound delivery address is the buyer's", () => {
  const payload = buildOutboundOrderPayload({
    hub: HUB, buyerDelivery: BUYER, buyerName: "B", buyerEmail: "b@e.com",
    buyerPhone: "9876500000", reference: "ZK-0001", itemTitle: "Coat",
    sku: "ZV-123", shippingCategory: "outerwear", saleValue: 5400,
  });
  assertEquals(payload.billing_pincode, BUYER.pincode);
  assertEquals(payload.billing_city, BUYER.city);
});

Deno.test("the inbound consignee is the hub, not the buyer", () => {
  const payload = buildInboundOrderPayload({
    hub: HUB, vendorPickup: VENDOR, reference: "ZK-0001",
    itemTitle: "Coat", sku: "ZV-123", shippingCategory: "outerwear",
    declaredValue: 3200,
  }, "zk-vendor-abc");

  // The parcel ends at us.
  assertEquals(payload.billing_pincode, HUB.pincode);
  assertEquals(payload.billing_city, HUB.city);

  // And it must not carry the buyer anywhere - the vendor never learns one exists.
  const serialised = JSON.stringify(payload);
  assert(!serialised.includes(BUYER.address!));
  assert(!serialised.includes(BUYER.pincode!));
  assert(!serialised.includes("buyer@example.com"));
});

Deno.test("hub registration uses the hub's own address", () => {
  const payload = buildHubPickupPayload(HUB);
  assertEquals(payload.pickup_location, HUB.nickname);
  assertEquals(payload.pin_code, HUB.pincode);
  const serialised = JSON.stringify(payload);
  for (const canary of VENDOR_CANARIES) {
    assert(!serialised.includes(canary), `hub registration leaked "${canary}"`);
  }
});
