// The launch offer's numbers and its two lines of copy, kept apart from the
// component that renders them so the offer can be changed or withdrawn
// without touching layout. Nothing else in the product knows about it: there
// is no counter, no balance and no code. We watch acceptances ourselves and
// email the code.
//
// The condition names both halves on purpose. Sending us items is not enough
// and accepting is not something that happens on its own, so a vendor who
// reads only this line still knows what the offer asks of them.
export const LAUNCH_OFFER = { acceptedOffers: 10, credit: 500 } as const;

export const LAUNCH_OFFER_TERMS = {
  reward: `Rs. ${LAUNCH_OFFER.credit} off anything you buy`,
  condition:
    `Send us items and accept ${LAUNCH_OFFER.acceptedOffers} offers. `
    + 'We email you the code. One per vendor.',
} as const;
