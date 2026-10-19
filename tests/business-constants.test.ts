// The site and the edge functions each hold the company's legal details, and
// they are deployed separately, so nothing but this test stops one from going
// stale while the other is correct. src/lib/business.ts is the one to edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as site from '../src/lib/business.ts';
import * as fn from '../supabase/functions/_shared/business.ts';

test('the edge functions carry the same legal details as the site', () => {
  assert.equal(fn.LEGAL_NAME, site.LEGAL_NAME);
  assert.equal(fn.GSTIN, site.GSTIN);
  assert.equal(fn.CIN, site.CIN);
  assert.equal(fn.ADDRESS_ONE_LINE, site.ADDRESS_ONE_LINE);
  assert.equal(fn.POSTAL_ADDRESS, site.POSTAL_ADDRESS);
});

test('the GSTIN is a well formed Delhi registration', () => {
  assert.match(site.GSTIN, /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/);
  assert.equal(site.GSTIN.slice(0, 2), '07');
});
