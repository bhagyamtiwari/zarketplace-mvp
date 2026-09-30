-- Promo codes can be made to make up for something (a late parcel, a mix-up),
-- as well as for a special customer. The purpose is a label for the admin
-- list and the code's prefix (SORRY-); it changes nothing about what a code
-- is worth or who can use it.
ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS discount_codes_purpose_check;
ALTER TABLE public.discount_codes ADD CONSTRAINT discount_codes_purpose_check
  CHECK (purpose IN ('acquisition', 'retention', 'make_good', 'other'));
