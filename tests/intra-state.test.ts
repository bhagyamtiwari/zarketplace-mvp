// Tests for the intra-state rule.
//
// Run with `npm test`. Uses node:test and node:assert, both built in, so this
// adds no dependency.
//
// The cases that matter are the NCR ones. Delhi, Gurgaon and Noida are one
// metro to a buyer and three states to GST, so a Delhi seller shipping to
// Gurgaon is an inter-state supply an unregistered seller may not make - and
// it is precisely the case a state dropdown misses, because the buyer thinks
// they live in "Delhi".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePincode, checkIntraState, NAME_TO_STATE_CODE } from '../src/lib/pincode.ts';

const DELHI = '07';
const HARYANA = '06';
const UP = '09';

test('resolves the NCR pincodes to three different states', () => {
  assert.equal(resolvePincode('110085').stateCode, DELHI, 'Rohini is Delhi');
  assert.equal(resolvePincode('122001').stateCode, HARYANA, 'Gurgaon is Haryana');
  assert.equal(resolvePincode('201301').stateCode, UP, 'Noida is Uttar Pradesh');
  assert.equal(resolvePincode('121001').stateCode, HARYANA, 'Faridabad is Haryana');
});

test('Delhi seller to Delhi buyer passes', () => {
  const v = checkIntraState('110085', DELHI);
  assert.equal(v.ok, true);
});

test('Delhi seller to Gurgaon buyer FAILS even though both are "NCR"', () => {
  const v = checkIntraState('122001', DELHI);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, 'different_state');
  assert.equal(v.ok === false && v.buyerStateName, 'Haryana');
});

test('Delhi seller to Noida buyer FAILS', () => {
  const v = checkIntraState('201301', DELHI);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, 'different_state');
});

test('an unverified pincode is refused, never assumed acceptable', () => {
  // 999999 is not a real pincode and must not resolve to anything.
  const v = checkIntraState('999999', DELHI);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.reason, 'unknown_pincode');
});

test('a malformed pincode is refused', () => {
  for (const bad of ['', '1100', '11008x', null, undefined]) {
    const v = checkIntraState(bad, DELHI);
    assert.equal(v.ok, false, `${String(bad)} must not pass`);
  }
});

test('a missing seller state is refused rather than skipped', () => {
  // The old server guard treated a missing seller state as "nothing to
  // compare", which meant exempt. It must refuse instead.
  const v = checkIntraState('110085', null);
  assert.equal(v.ok, false);
});

test('the 682555 override beats its own prefix', () => {
  // Kavaratti sits inside Kerala's 682 band but is Lakshadweep. If a prefix
  // table alone were trusted, this would be sold as Kerala.
  assert.equal(resolvePincode('682001').stateCode, '32', 'Kochi is Kerala');
  assert.equal(resolvePincode('682555').stateCode, '31', 'Kavaratti is Lakshadweep');
});

test('the client cannot bypass the rule by claiming a state', () => {
  // Simulates the bypass: the client posts shipping_address.state = "Delhi"
  // while the delivery pincode is in Gurgaon. The rule reads the pincode and
  // ignores the claim entirely, which is the whole point of resolving
  // server-side rather than comparing the dropdown.
  const claimedState = 'Delhi';
  const actualPincode = '122001';
  assert.equal(NAME_TO_STATE_CODE[claimedState], DELHI, 'the claim looks legitimate');

  const v = checkIntraState(actualPincode, DELHI);
  assert.equal(v.ok, false, 'the claim must not rescue an out-of-state pincode');
  assert.equal(v.ok === false && v.reason, 'different_state');
});

test('state names and codes round-trip', () => {
  assert.equal(NAME_TO_STATE_CODE['Delhi'], '07');
  assert.equal(NAME_TO_STATE_CODE['Haryana'], '06');
  assert.equal(NAME_TO_STATE_CODE['Uttar Pradesh'], '09');
  assert.equal(NAME_TO_STATE_CODE['Lakshadweep'], '31');
});
