// One list of sizes, read by the sell form and by the browse filters, so a
// size a vendor can choose is always a size a buyer can filter by.
//
// Letter sizes run to 4XL, since oversized and vintage outerwear often does.
// Trouser waists include the in-between inches common on denim and the small
// waists common on women's vintage. Shoes run UK 3 to UK 13 with the half
// sizes trainers are actually sold in.
const LETTER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'One Size'];
const WAIST = ['24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42', '44', '46', 'One Size'];
const SHOES = ['UK 3', 'UK 4', 'UK 5', 'UK 5.5', 'UK 6', 'UK 6.5', 'UK 7', 'UK 7.5', 'UK 8', 'UK 8.5', 'UK 9', 'UK 9.5', 'UK 10', 'UK 10.5', 'UK 11', 'UK 12', 'UK 13'];

export const CATEGORY_SIZES: Record<string, string[]> = {
  Tops: LETTER,
  Bottoms: WAIST,
  Outerwear: LETTER,
  Accessories: ['One Size'],
  Shoes: SHOES,
};

/** Every clothing size, for the filter when no category is chosen. */
export const ALL_SIZES = [...LETTER.filter((s) => s !== 'One Size'), ...WAIST.filter((s) => s !== 'One Size'), 'One Size'];
