// Shared condition vocabulary for the Sell form, product page, and the
// public Conditions Guide, so a listing's condition always resolves to the
// same label/description wherever it's shown.

export interface ConditionOption {
  name: string;
  /** Grade out of five, shown alongside the name so the tiers rank at a glance. */
  grade: string;
  /**
   * The definition, one or two short sentences. Deliberately short enough to
   * read on a card: the seller form stacks all five while choosing, and the
   * paragraph-length version meant nobody read any of them.
   */
  desc: string;
}

export const CONDITIONS: ConditionOption[] = [
  { name: 'Pristine', grade: '5/5', desc: 'Like new. Never worn, or worn once, with no visible wear.' },
  { name: 'Great', grade: '4/5', desc: 'Lightly worn, well kept. No flaws. Ready to wear.' },
  { name: 'Good', grade: '3/5', desc: 'Used, with light fading or small marks. Solid shape, plenty of life left.' },
  { name: 'Fair', grade: '2/5', desc: 'Noticeable wear. Fading, loose threads or marks. Wearable, with character.' },
  { name: 'As Is', grade: '1/5', desc: 'Thrashed. Stains, holes or broken hardware. For upcycling, priced to match.' },
];

export function conditionByName(name: string): ConditionOption | undefined {
  return CONDITIONS.find((c) => c.name === name);
}
