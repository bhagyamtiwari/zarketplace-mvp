// Shared condition vocabulary for the Sell form, product page, and the
// public Conditions Guide, so a listing's condition always resolves to the
// same label/description wherever it's shown.

export interface ConditionOption {
  name: string;
  /** Grade out of five, shown alongside the name so the tiers rank at a glance. */
  grade: string;
  desc: string;
}

export const CONDITIONS: ConditionOption[] = [
  { name: 'Pristine', grade: '5/5', desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear. Tags may or may not be attached.' },
  { name: 'Great', grade: '4/5', desc: 'Lightly worn and well cared for. Minimal signs of wear. No major flaws or damage. Clean and ready to wear.' },
  { name: 'Good', grade: '3/5', desc: 'Gently used with some signs of wear. Slight fading or small imperfections, but overall in solid shape. Still has many lives left.' },
  { name: 'Fair', grade: '2/5', desc: 'Noticeable wear from regular use. May include fading, loose threads, or minor marks. Still wearable with character.' },
  { name: 'As Is', grade: '1/5', desc: 'Thrashed. Heavily worn or naturally damaged, with visible flaws such as stains, holes, or broken hardware. Best for upcycling or collectors who appreciate the wear story. Priced accordingly.' },
];

export function conditionByName(name: string): ConditionOption | undefined {
  return CONDITIONS.find((c) => c.name === name);
}
