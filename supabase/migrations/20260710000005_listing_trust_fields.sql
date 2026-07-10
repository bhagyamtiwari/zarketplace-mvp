-- Seller listing flow trust fields: flaw disclosure, structured item
-- details, and an authenticity declaration. Additive only - existing
-- listings default to "no flaws declared" / "not specified" rather than
-- being rewritten, since we have no way to know their real answers.
--
-- Deliberately NOT storing per-photo flaw tags (e.g. which image shows which
-- flaw) - that's more structure than an MVP needs. "Has flaws" + a
-- description + at least one extra photo is enough to raise the trust bar
-- without over-engineering.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS has_flaws boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flaws_description text,
  ADD COLUMN IF NOT EXISTS original_tags_attached boolean,
  ADD COLUMN IF NOT EXISTS original_packaging boolean,
  ADD COLUMN IF NOT EXISTS item_altered boolean,
  ADD COLUMN IF NOT EXISTS wear_frequency text,
  ADD COLUMN IF NOT EXISTS authenticity_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_declared_at timestamptz;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_wear_frequency_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_wear_frequency_check
  CHECK (wear_frequency IS NULL OR wear_frequency = ANY (ARRAY[
    'never', '1_2_times', 'occasionally', 'frequently'
  ]::text[]));
