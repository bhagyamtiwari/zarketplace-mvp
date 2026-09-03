// Pincode -> GST state code, server side.
//
// Mirrors src/lib/pincode.ts. Duplicated rather than imported because these
// functions run on Deno and must not pull the browser bundle in. Keep the two
// tables in step: the client copy decides what a buyer is told, this one
// decides whether their money is taken.
//
// Deliberately incomplete and fails closed. Only prefixes stated with
// confidence are listed; anything else resolves to null and MUST be refused.
// An unrecognised pincode blocks a sale, it never waves one through. See the
// long note in src/lib/pincode.ts for why a partial table beats an invented
// complete one.

export const STATE_CODE_TO_NAME: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

// Six-digit pincodes that contradict their own prefix. Checked first.
const EXACT_OVERRIDES: Record<string, string> = {
  '682555': '31', // Kavaratti, Lakshadweep - inside Kerala's 682 band
};

const PREFIX_TO_STATE_CODE: Record<string, string> = {
  '110': '07',
  '121': '06', '122': '06', '123': '06', '124': '06', '125': '06',
  '126': '06', '127': '06', '131': '06', '132': '06', '133': '06',
  '134': '06', '135': '06', '136': '06',
  '160': '04',
  '201': '09', '226': '09',
  '302': '08',
  '380': '24', '390': '24', '395': '24',
  '400': '27', '411': '27', '440': '27',
  '452': '23', '462': '23',
  '500': '36',
  '560': '29',
  '600': '33', '641': '33',
  '682': '32',
  '700': '19',
  '781': '18',
};

export interface PincodeResolution {
  stateCode: string | null;
  stateName: string | null;
  malformed: boolean;
}

export function resolvePincode(raw: string | null | undefined): PincodeResolution {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 6) return { stateCode: null, stateName: null, malformed: true };
  const code = EXACT_OVERRIDES[digits] ?? PREFIX_TO_STATE_CODE[digits.slice(0, 3)] ?? null;
  return {
    stateCode: code,
    stateName: code ? STATE_CODE_TO_NAME[code] ?? null : null,
    malformed: false,
  };
}

export type IntraStateVerdict =
  | { ok: true; stateCode: string; stateName: string | null }
  | { ok: false; reason: 'malformed' | 'unknown_pincode' | 'different_state' | 'no_seller_state'; stateCode: string | null; stateName: string | null };

/** A buyer's delivery pincode must resolve to the state we ship FROM (the
 * hub, under our own GSTIN). Never a vendor's state: the purchase from a
 * vendor is a separate transaction and does not decide this one. Fails
 * closed. */
export function checkIntraState(
  deliveryPincode: string | null | undefined,
  originStateCode: string | null | undefined,
): IntraStateVerdict {
  const r = resolvePincode(deliveryPincode);
  if (r.malformed) return { ok: false, reason: 'malformed', stateCode: null, stateName: null };
  if (!r.stateCode) return { ok: false, reason: 'unknown_pincode', stateCode: null, stateName: null };
  if (!originStateCode) return { ok: false, reason: 'no_seller_state', stateCode: r.stateCode, stateName: r.stateName };
  if (r.stateCode !== originStateCode) {
    return { ok: false, reason: 'different_state', stateCode: r.stateCode, stateName: r.stateName };
  }
  return { ok: true, stateCode: r.stateCode, stateName: r.stateName };
}
