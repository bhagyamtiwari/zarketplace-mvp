// Shared condition vocabulary for the Sell form and product page, so a
// listing's condition always resolves to the same label/description
// wherever it's shown.
//
// Legacy listings still carry the old 5-tier names (Pristine/Great/Good/
// Fair/As Is) from before this list existed - those aren't rewritten, and
// ProductPage falls back to its own legacy meter for them. New listings
// only ever use CONDITIONS below.

export interface ConditionOption {
  name: string;
  emoji: string;
  desc: string;
}

export const CONDITIONS: ConditionOption[] = [
  { name: 'Brand New (Tags Attached)', emoji: '🏷️', desc: 'Unworn, with the original tags still attached.' },
  { name: 'Never Worn (No Tags)', emoji: '✨', desc: 'Unworn, but tags are missing or were removed.' },
  { name: 'Worn Once', emoji: '👕', desc: 'Worn a single time. No visible wear.' },
  { name: 'Gently Used', emoji: '👍', desc: 'Worn a few times and well cared for. Minimal signs of wear.' },
  { name: 'Very Good', emoji: '👌', desc: 'Regularly worn but well maintained. Slight signs of wear.' },
  { name: 'Good', emoji: '📦', desc: 'Noticeable wear from regular use, but nothing significant.' },
  { name: 'Fair (Visible Wear)', emoji: '⚠️', desc: 'Clearly used, with visible wear such as fading or minor marks.' },
];

export function conditionByName(name: string): ConditionOption | undefined {
  return CONDITIONS.find((c) => c.name === name);
}
