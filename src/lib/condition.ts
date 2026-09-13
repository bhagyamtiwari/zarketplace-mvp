// Shared condition vocabulary for the Sell form, product page, and the
// public Conditions Guide, so a listing's condition always resolves to the
// same label/description wherever it's shown.

export interface ConditionOption {
  name: string;
  /** Grade out of four, shown alongside the name so the tiers rank at a glance. */
  grade: string;
  /**
   * A rank colour, used on the Conditions Guide and nowhere else.
   *
   * BrandKit keeps the palette monochrome and says colour is a signal, never a
   * style. A four-step ladder is a signal, so it earns its place here: the
   * guide's whole job is to make the tiers rank at a glance, and four cards of
   * identical grey do not. It stays off product pages, where a coloured chip
   * beside a price would be decoration, and would read as a rating of the
   * listing rather than of the garment.
   */
  accent: string;
  /**
   * The definition, one or two short sentences. Deliberately short enough to
   * read on a card: the vendor form stacks all four while choosing, and the
   * paragraph-length version meant nobody read any of them.
   */
  desc: string;
}

// Four tiers, not five. Fair and As Is were the bottom two and between them
// held one listing in the whole catalogue; "Fair" was a euphemism and "As Is"
// was a disclaimer rather than a description of a garment. What a buyer needs
// at the bottom of the scale is not a finer shelf label, it is the specific
// damage, and the form already requires that in writing and in a close-up
// photograph before a flawed item can be submitted.
export const CONDITIONS: ConditionOption[] = [
  { name: 'Pristine', grade: '4/4', accent: '#6D28D9', desc: 'Like new. Never worn, or worn once, with no visible wear.' },
  { name: 'Great',    grade: '3/4', accent: '#1D4ED8', desc: 'Lightly worn, well kept. No flaws. Ready to wear.' },
  { name: 'Good',     grade: '2/4', accent: '#0F766E', desc: 'Used, with light fading or small marks. Solid shape, plenty of life left.' },
  { name: 'Worn',     grade: '1/4', accent: '#A1A1AA', desc: 'Clear wear: fading, marks, loose threads or damage. The specifics are described and photographed on the listing.' },
];

/** Retired tiers, mapped so an older listing still resolves to a live one. */
const RETIRED: Record<string, string> = { Fair: 'Worn', 'As Is': 'Worn' };

export function conditionByName(name: string): ConditionOption | undefined {
  const resolved = RETIRED[name] ?? name;
  return CONDITIONS.find((c) => c.name === resolved);
}
