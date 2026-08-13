// State comparison for the GST same-state rule, server side.
//
// Mirrors src/lib/states.ts. Duplicated rather than imported because these
// functions run on Deno and must not pull the browser bundle in.
//
// Never compare two state strings directly. Production already contains
// "Delhi " with a trailing space in a real order's shipping address, and the
// free-text field that produced it existed for months. Exact equality would
// reject that buyer at checkout for a stray keystroke.

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const ALIASES: Record<string, string> = {
  newdelhi: 'Delhi',
  nctofdelhi: 'Delhi',
  delhinct: 'Delhi',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
};

const fold = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
const BY_FOLDED = new Map(STATES.map((s) => [fold(s), s]));

export function normalizeState(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = fold(value);
  if (!key) return null;
  return BY_FOLDED.get(key) ?? ALIASES[key] ?? null;
}

/** True when buyer and seller are in the same state, so no GSTIN is needed. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeState(a);
  const right = normalizeState(b);
  return left !== null && left === right;
}
