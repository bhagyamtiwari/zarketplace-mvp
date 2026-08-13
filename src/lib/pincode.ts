// Pincode -> GST state code, for the intra-state rule.
//
// WHY THIS EXISTS, AND WHY IT IS DELIBERATELY INCOMPLETE
//
// Place of supply for goods is where the movement terminates for delivery -
// the shipping address, not what the buyer picked in a dropdown. A buyer can
// select "Delhi" and type a Gurgaon pincode, and Gurgaon is Haryana: a
// different state for GST. The earlier check compared the dropdown to the
// seller's state and let exactly that through.
//
// The honest constraint: there is no authoritative pincode dataset in this
// repo, and India Post's numbering has real irregularities (Chandigarh sits
// inside Punjab's 16x band; 682555 is Lakshadweep inside Kerala's 682).
// Inventing the missing rows would produce a table that is right most of the
// time, which for a legal check is worse than one that admits what it does
// not know.
//
// So: only prefixes stated with confidence appear below, and resolve() returns
// null for everything else. Callers MUST treat null as "cannot sell here"
// rather than "probably fine". An unknown pincode blocks a sale; it never
// waves one through. Widening the table is a data problem, not a code one -
// drop verified rows in and the behaviour follows.
//
// See blocked_checkouts: every refusal is logged with the pincode, so the
// prefixes worth verifying next are the ones actually costing sales.

/** GST state codes. The numeric code is what tax logic compares, never the name. */
export const STATE_CODE_TO_NAME: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export const NAME_TO_STATE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name, code]),
);

// Full six-digit pincodes that contradict their own prefix. Checked first.
// 682555 is Kavaratti, Lakshadweep - inside Kerala's 682 band, and the reason
// a prefix table alone cannot be trusted.
const EXACT_OVERRIDES: Record<string, string> = {
  '682555': '31',
};

// Three-digit prefixes, verified. NCR is the priority: Delhi, Gurgaon and
// Noida are one metro to a buyer and three states to GST, and they separate
// cleanly here - 110 / 12x / 201.
const PREFIX_TO_STATE_CODE: Record<string, string> = {
  // Delhi
  '110': '07',

  // Haryana - the NCR side (Gurgaon, Faridabad) plus the rest of 12x/13x
  '121': '06', // Faridabad
  '122': '06', // Gurgaon
  '123': '06', // Rewari, Narnaul
  '124': '06', // Rohtak
  '125': '06', // Hisar
  '126': '06', // Jind
  '127': '06', // Bhiwani
  '131': '06', // Sonipat
  '132': '06', // Karnal
  '133': '06', // Ambala
  '134': '06', // Panchkula
  '135': '06', // Yamunanagar
  '136': '06', // Kurukshetra

  // Chandigarh - a union territory sitting inside Punjab's band
  '160': '04',

  // Uttar Pradesh - the NCR side (Noida, Ghaziabad) and Lucknow
  '201': '09', // Noida, Ghaziabad
  '226': '09', // Lucknow

  // Rajasthan
  '302': '08', // Jaipur

  // Gujarat
  '380': '24', // Ahmedabad
  '390': '24', // Vadodara
  '395': '24', // Surat

  // Maharashtra
  '400': '27', // Mumbai
  '411': '27', // Pune
  '440': '27', // Nagpur

  // Madhya Pradesh
  '452': '23', // Indore
  '462': '23', // Bhopal

  // Telangana
  '500': '36', // Hyderabad

  // Karnataka
  '560': '29', // Bengaluru

  // Tamil Nadu
  '600': '33', // Chennai
  '641': '33', // Coimbatore

  // Kerala - note the 682555 override above
  '682': '32', // Kochi

  // West Bengal
  '700': '19', // Kolkata

  // Assam
  '781': '18', // Guwahati
};

export interface PincodeResolution {
  /** GST state code, or null when this pincode is not in the verified table. */
  stateCode: string | null;
  /** Human-readable state, for messages. Null when unresolved. */
  stateName: string | null;
  /** True when the input was not six digits at all. */
  malformed: boolean;
}

/**
 * Resolve a pincode to a GST state code.
 *
 * Returns stateCode null when the pincode is well-formed but not in the
 * verified table. That is NOT permission to proceed - callers must block.
 */
export function resolvePincode(raw: string | null | undefined): PincodeResolution {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 6) {
    return { stateCode: null, stateName: null, malformed: true };
  }
  const code = EXACT_OVERRIDES[digits] ?? PREFIX_TO_STATE_CODE[digits.slice(0, 3)] ?? null;
  return {
    stateCode: code,
    stateName: code ? STATE_CODE_TO_NAME[code] ?? null : null,
    malformed: false,
  };
}

export type IntraStateVerdict =
  | { ok: true; stateCode: string }
  | { ok: false; reason: 'malformed' | 'unknown_pincode' | 'different_state'; buyerStateName: string | null };

/**
 * The rule: a buyer's delivery pincode must resolve to the seller's state.
 *
 * Fails closed. An unrecognised pincode is refused rather than assumed
 * acceptable, because the failure we cannot afford is completing a sale
 * across a state line, not declining one we could have made.
 */
export function checkIntraState(
  deliveryPincode: string | null | undefined,
  sellerStateCode: string | null | undefined,
): IntraStateVerdict {
  const resolved = resolvePincode(deliveryPincode);
  if (resolved.malformed) return { ok: false, reason: 'malformed', buyerStateName: null };
  if (!resolved.stateCode) return { ok: false, reason: 'unknown_pincode', buyerStateName: null };
  if (!sellerStateCode || resolved.stateCode !== sellerStateCode) {
    return { ok: false, reason: 'different_state', buyerStateName: resolved.stateName };
  }
  return { ok: true, stateCode: resolved.stateCode };
}
