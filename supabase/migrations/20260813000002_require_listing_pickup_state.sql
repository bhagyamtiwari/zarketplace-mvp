-- Make the GST same-state rule enforceable rather than merely enforced.
--
-- create-razorpay-order refuses an order whose delivery address is outside the
-- seller's state, but it reads that state from listings.pickup_state, and only
-- the listing form was requiring it. A listing created any other way - the
-- admin console, a script, a direct insert - would carry no state, and the
-- checkout guard would wave it through, because a NULL state cannot mismatch
-- anything. That is the exact case the rule exists to stop.
--
-- Two constraints, because "present" and "comparable" are different problems:
--
--   1. NOT NULL. Every listing has to declare where it ships from. Safe to
--      apply directly: all existing rows were backfilled by
--      20260813000001_listing_pickup_state.
--
--   2. A canonical value. sameState() folds case and spacing when comparing,
--      but that is a rescue for data already written, not a licence to keep
--      writing junk. The orders table already holds "Delhi " with a trailing
--      space from a free-text field. Restricting the column to the same 36
--      names src/lib/states.ts offers means the stored value is always exactly
--      what the comparison expects.
--
-- Verified before applying: 6 rows, 0 null, 0 outside the canonical list.

ALTER TABLE public.listings
  ALTER COLUMN pickup_state SET NOT NULL;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_pickup_state_canonical;
ALTER TABLE public.listings ADD CONSTRAINT listings_pickup_state_canonical
  CHECK (pickup_state IN (
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
    'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
  ));
