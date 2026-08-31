// Pincode -> state, used to route a courier and to normalise a stored address.
//
// WHY THIS EXISTS, AND WHY IT IS DELIBERATELY INCOMPLETE
//
// A pincode is the only location a vendor gives us: the sell form asks for one
// and derives the state from it, rather than asking twice and then having to
// reconcile two answers that disagree.
//
// It was originally built for the intra-state delivery rule, where an
// unrecognised pincode had to fail closed and refuse a sale. That rule is gone
// - we ship nationwide from our own hub - so an unresolved pincode now costs a
// tidier address, not an order.
//
// The table is prefix-based and does not cover every pincode in India. That is
// fine for what it now does; resolvePincode returns nulls it cannot place and
// callers treat that as "unknown", not as "refuse".

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
