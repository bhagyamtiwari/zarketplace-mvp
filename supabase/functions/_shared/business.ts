// Who we are, legally: the edge functions' copy.
//
// src/lib/business.ts is where these are decided. The functions are deployed
// on their own, by hand, so they cannot import out of src/, and this file
// holds the same values. tests/business-constants.test.ts fails if the two
// ever disagree: change src/lib/business.ts, then paste the value here.

export const LEGAL_NAME = "ADNIZ Private Limited";
export const GSTIN = "07AAZCA1680Q1ZQ";
export const CIN = "U47711DL2023PTC418107";
export const ADDRESS_ONE_LINE =
  "5th Floor, Wing-A, Statesman House, 148 Barakhamba Road, Connaught Place, New Delhi – 110001";
export const POSTAL_ADDRESS = `${LEGAL_NAME}, ${ADDRESS_ONE_LINE}`;
