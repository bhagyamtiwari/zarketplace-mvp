// Who we are, legally, in one place.
//
// The legal name, the GST registration and the registered office appear on the
// footer, on Terms, Privacy, Contact and the Grievance page, in the order
// emails and on anything that reads as a receipt. They used to be typed out
// again at each of those, which is how an address goes stale in four places at
// different times. Everything on the site reads them from here.
//
// The edge functions keep their own copy in
// supabase/functions/_shared/business.ts, because they are deployed on their
// own and cannot import from src/. tests/business-constants.test.ts fails if
// the two ever disagree, so there is still only one value to change and then
// one file to paste it into.

/** The company. zarketplace is its trading name, never its legal name. */
export const LEGAL_NAME = 'ADNIZ Private Limited';

/** GST registration. Delhi (state code 07), filed on the office below. */
export const GSTIN = '07AAZCA1680Q1ZQ';

/** Company identification number, from incorporation. */
export const CIN = 'U47711DL2023PTC418107';

/**
 * The registered office, line by line, so a caller can set it as a block
 * (footer, letterhead) or join it into a sentence.
 */
export const ADDRESS_LINES = [
  '5th Floor, Wing-A, Statesman House, 148 Barakhamba Road,',
  'Connaught Place, New Delhi 110001',
] as const;

/** The same address on one line, for prose and for a dl value. */
export const ADDRESS_ONE_LINE =
  '5th Floor, Wing-A, Statesman House, 148 Barakhamba Road, Connaught Place, New Delhi 110001';

/** Address with the company in front, for anything addressed to us by post. */
export const POSTAL_ADDRESS = `${LEGAL_NAME}, ${ADDRESS_ONE_LINE}`;

/**
 * The office in the form a person can place: the building and the
 * neighbourhood, no floor or street number. For the footer, where the point is
 * that there is a real address, not what to write on an envelope.
 */
export const SHORT_ADDRESS = 'Statesman House, Connaught Place, New Delhi';
