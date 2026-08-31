// Shiprocket payload construction for both legs.
//
// Pure functions, deliberately. The rule that matters here - the vendor's
// address must never appear on an outbound label, in tracking, or in anything
// the buyer can see - is only testable if building the payload is separable
// from sending it. See payload.test.ts.

export interface Addr {
  fullName?: string;
  phone?: string;
  address?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface HubLocation {
  nickname: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  address_2: string;
  city: string;
  state: string;
  pincode: string;
}

export type Leg = "INBOUND" | "OUTBOUND";

const CATEGORY_WEIGHT_KG: Record<string, number> = {
  tops: 0.3, bottoms: 0.5, footwear: 1.0, outerwear: 0.8, accessories: 0.2,
};
const DEFAULT_WEIGHT_KG = 0.5;
const PARCEL_DIMS = { length: 30, breadth: 25, height: 5 };

function tenDigits(v: string | undefined, fallback = "9999999999"): string {
  return (v ?? "").replace(/\D/g, "").slice(-10) || fallback;
}

/**
 * Register a pickup location. Only ever called for the hub.
 *
 * A vendor address is never registered as a pickup location: the old code did
 * that per order and then used it as the origin of the buyer's parcel, which
 * is precisely the exposure this rewrite removes. The vendor's address appears
 * only as a *delivery* address on the inbound leg, where the consignee is us.
 */
export function buildHubPickupPayload(hub: HubLocation) {
  return {
    pickup_location: hub.nickname,
    name: hub.contact_name,
    email: hub.email,
    phone: tenDigits(hub.phone),
    address: hub.address,
    address_2: hub.address_2,
    city: hub.city,
    state: hub.state,
    country: "India",
    pin_code: hub.pincode,
  };
}

interface InboundArgs {
  hub: HubLocation;
  vendorPickup: Addr;
  reference: string;
  itemTitle: string;
  sku: string;
  shippingCategory: string | null;
  declaredValue: number;
}

/**
 * Vendor -> hub.
 *
 * Shiprocket's adhoc order always ships FROM a registered pickup_location TO
 * the billing address. For this leg that is inverted from the obvious reading:
 * the parcel starts at the vendor and ends at us, so the vendor's address goes
 * in as the pickup and OUR address is the delivery.
 *
 * That requires the vendor's address to be a registered pickup location, which
 * is the one place a vendor address legitimately appears - and it never touches
 * an outbound parcel.
 */
export function buildInboundOrderPayload(args: InboundArgs, vendorPickupNickname: string) {
  const now = new Date();
  return {
    order_id: `${args.reference}-IN`,
    order_date: `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`,
    pickup_location: vendorPickupNickname,

    // Consignee is the hub. This is us receiving our own purchase.
    billing_customer_name: args.hub.contact_name,
    billing_last_name: "",
    billing_address: args.hub.address,
    billing_address_2: args.hub.address_2,
    billing_city: args.hub.city,
    billing_pincode: args.hub.pincode,
    billing_state: args.hub.state,
    billing_country: "India",
    billing_email: args.hub.email,
    billing_phone: tenDigits(args.hub.phone),
    shipping_is_billing: true,

    order_items: [{
      name: args.itemTitle,
      sku: args.sku,
      units: 1,
      selling_price: args.declaredValue,
    }],
    payment_method: "Prepaid",
    sub_total: args.declaredValue,
    length: PARCEL_DIMS.length,
    breadth: PARCEL_DIMS.breadth,
    height: PARCEL_DIMS.height,
    weight: CATEGORY_WEIGHT_KG[args.shippingCategory ?? ""] ?? DEFAULT_WEIGHT_KG,
  };
}

export function buildVendorPickupPayload(vendorPickup: Addr, nickname: string, vendorEmail: string) {
  return {
    pickup_location: nickname,
    name: vendorPickup.fullName || "Vendor",
    email: vendorEmail,
    phone: tenDigits(vendorPickup.phone),
    address: vendorPickup.address ?? "",
    address_2: vendorPickup.landmark ?? "",
    city: vendorPickup.city ?? "",
    state: vendorPickup.state ?? "",
    country: "India",
    pin_code: vendorPickup.pincode ?? "",
  };
}

interface OutboundArgs {
  hub: HubLocation;
  buyerDelivery: Addr;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  reference: string;
  itemTitle: string;
  sku: string;
  shippingCategory: string | null;
  saleValue: number;
}

/**
 * Hub -> buyer.
 *
 * Takes no vendor argument at all. It cannot leak a vendor address because it
 * is never given one - which is a stronger guarantee than remembering not to
 * use it, and is what payload.test.ts asserts.
 */
export function buildOutboundOrderPayload(args: OutboundArgs) {
  const now = new Date();
  return {
    order_id: `${args.reference}-OUT`,
    order_date: `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`,

    // Consignor of record: the hub, under our own registration.
    pickup_location: args.hub.nickname,

    billing_customer_name: args.buyerDelivery.fullName || args.buyerName,
    billing_last_name: "",
    billing_address: args.buyerDelivery.address,
    billing_address_2: args.buyerDelivery.landmark || "",
    billing_city: args.buyerDelivery.city,
    billing_pincode: args.buyerDelivery.pincode,
    billing_state: args.buyerDelivery.state,
    billing_country: "India",
    billing_email: args.buyerEmail,
    billing_phone: tenDigits(args.buyerDelivery.phone || args.buyerPhone),
    shipping_is_billing: true,

    order_items: [{
      name: args.itemTitle,
      sku: args.sku,
      units: 1,
      selling_price: args.saleValue,
    }],
    payment_method: "Prepaid",
    sub_total: args.saleValue,
    length: PARCEL_DIMS.length,
    breadth: PARCEL_DIMS.breadth,
    height: PARCEL_DIMS.height,
    weight: CATEGORY_WEIGHT_KG[args.shippingCategory ?? ""] ?? DEFAULT_WEIGHT_KG,
  };
}
