// Shared condition vocabulary for the Sell form, product page, and the
// public Conditions Guide, so a listing's condition always resolves to the
// same label/description wherever it's shown.

export interface ConditionOption {
  name: string;
  /** Grade out of five, shown alongside the name so the tiers rank at a glance. */
  grade: string;
  /**
   * One phrase, for picking between tiers at a glance. The seller form shows
   * this on the card and keeps `desc` behind an info tip, because five
   * paragraphs stacked up is a page nobody reads before choosing.
   */
  short: string;
  /** The full definition. Public Conditions Guide and product page use this. */
  desc: string;
}

export const CONDITIONS: ConditionOption[] = [
  { name: 'Pristine', grade: '5/5', short: 'Like new, no visible wear.', desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear. Tags may or may not be attached.' },
  { name: 'Great', grade: '4/5', short: 'Light wear, no flaws.', desc: 'Lightly worn and well cared for. Minimal signs of wear. No major flaws or damage. Clean and ready to wear.' },
  { name: 'Good', grade: '3/5', short: 'Some wear, light marks.', desc: 'Gently used with some signs of wear. Slight fading or small imperfections, but overall in solid shape. Still has many lives left.' },
  { name: 'Fair', grade: '2/5', short: 'Clearly worn, still wearable.', desc: 'Noticeable wear from regular use. May include fading, loose threads, or minor marks. Still wearable with character.' },
  { name: 'As Is', grade: '1/5', short: 'Heavy wear, priced to match.', desc: 'Thrashed. Heavily worn or naturally damaged, with visible flaws such as stains, holes, or broken hardware. Best for upcycling or collectors who appreciate the wear story. Priced accordingly.' },
];

export function conditionByName(name: string): ConditionOption | undefined {
  return CONDITIONS.find((c) => c.name === name);
}
