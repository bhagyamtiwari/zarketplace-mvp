// The 28 states and 8 union territories, as GST reckons them.
//
// This exists because state stopped being a courier detail and became a rule.
// Interstate supply needs a GSTIN most individual sellers do not have, so
// until that is resolved a buyer and a seller have to be in the same state -
// which means the two values have to be *comparable*. A free-text box is not:
// "Delhi", "New Delhi", "delhi" and "NCT of Delhi" are one state and four
// strings, and no amount of matching logic recovers from that reliably.
//
// So every place that captures a state picks from this list, and every place
// that compares states compares these exact values.

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

// Where zarketplace's buyers and sellers actually are, floated above the full
// alphabetical list.
//
// The list has always held all 28 states and all 8 union territories, but
// strict A-Z put Delhi at position 32 of 36 - below every state, because the
// UTs sorted last - so the single most common answer looked absent and people
// concluded the picker was broken. Ordering is not cosmetics here: a picker
// where the likeliest answer is invisible gets abandoned.
//
// The city in each label is the recognition cue. People know where they live
// by city far faster than by state, and "Telangana" alone loses the person who
// would have picked "Hyderabad" instantly.
export const COMMON_STATES: Array<{ state: IndianState; label: string }> = [
  // Labelled by CITY, because that is how people locate themselves. Nobody
  // thinks "I am in Uttar Pradesh"; they think "I am in Noida". The state is
  // still what gets stored and compared - it is just no longer the thing a
  // buyer has to translate their own address into.
  //
  // NCR is split into its three real jurisdictions. There is no NCR concession
  // under GST: Delhi, Haryana and UP are three states, place of supply is
  // where delivery terminates, and an unregistered seller may not cross those
  // lines. Showing "Delhi NCR" as one option was the pincode bug reintroduced
  // one screen earlier - a Gurgaon buyer picks it, feels correct, and is
  // refused at checkout with no idea why.
  { state: 'Delhi', label: 'Delhi' },
  { state: 'Haryana', label: 'Gurgaon, Faridabad (Haryana)' },
  { state: 'Uttar Pradesh', label: 'Noida, Ghaziabad (Uttar Pradesh)' },
  { state: 'Maharashtra', label: 'Mumbai, Pune (Maharashtra)' },
  { state: 'Karnataka', label: 'Bengaluru (Karnataka)' },
  { state: 'Telangana', label: 'Hyderabad (Telangana)' },
  { state: 'West Bengal', label: 'Kolkata (West Bengal)' },
  { state: 'Rajasthan', label: 'Jaipur (Rajasthan)' },
  { state: 'Nagaland', label: 'Dimapur, Kohima (Nagaland)' },
];

// Where zarketplace actually operates today. One list, used by every picker,
// so buyers and sellers can never be offered different answers.
//
// Intra-state means a seller outside this list could only sell to buyers in
// their own state - and there are none there yet, so listing from there
// produces stock nobody can buy. Offering the option would be offering a dead
// end. The rest of the country stays visible but disabled, because "coming
// soon" is information and a missing option is just confusing.
//
// Adding a state is one line here. Nothing else needs to change.
export const SERVICEABLE_STATES: readonly IndianState[] = ['Delhi'];

const SERVICEABLE_SET = new Set<string>(SERVICEABLE_STATES);

export function isServiceable(state: string | null | undefined): boolean {
  return !!state && SERVICEABLE_SET.has(state);
}

const COMMON_SET = new Set<string>(COMMON_STATES.map((c) => c.state));

/** Everything not floated to the top, still alphabetical, states then UTs. */
export const OTHER_STATES: IndianState[] = INDIAN_STATES.filter((s) => !COMMON_SET.has(s));

// Free-text values already on file, plus the spellings people actually type.
// Keys are compared lowercased with non-letters stripped, so "new delhi",
// "New-Delhi" and "NEW DELHI" all land on the same entry.
const ALIASES: Record<string, IndianState> = {
  newdelhi: 'Delhi',
  nctofdelhi: 'Delhi',
  delhinct: 'Delhi',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
  jandk: 'Jammu and Kashmir',
  jk: 'Jammu and Kashmir',
  tn: 'Tamil Nadu',
  up: 'Uttar Pradesh',
  mp: 'Madhya Pradesh',
  ap: 'Andhra Pradesh',
  wb: 'West Bengal',
  westbengal: 'West Bengal',
  maharastra: 'Maharashtra',
  karnatka: 'Karnataka',
  tamilnad: 'Tamil Nadu',
  telengana: 'Telangana',
  chattisgarh: 'Chhattisgarh',
  puduchery: 'Puducherry',
};

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

const BY_FOLDED = new Map<string, IndianState>(
  INDIAN_STATES.map((s) => [fold(s), s]),
);

/**
 * Resolve a loosely-typed state to one of INDIAN_STATES, or null if it is not
 * recognisable. Used to read the free-text values written before the dropdown
 * existed: anything this cannot resolve has to be re-asked rather than guessed,
 * because a wrong guess here silently shows a listing to the wrong state.
 */
export function normalizeState(value: string | null | undefined): IndianState | null {
  if (!value) return null;
  const key = fold(value);
  if (!key) return null;
  return BY_FOLDED.get(key) ?? ALIASES[key] ?? null;
}

/** True when buyer and seller may transact without a GSTIN. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeState(a);
  const right = normalizeState(b);
  return left !== null && left === right;
}
