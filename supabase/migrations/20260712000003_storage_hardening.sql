-- Finding 5: harden the public storage buckets.
--
-- Both public buckets had no size or MIME limits, letting any authenticated
-- user upload arbitrary content types at any size to a CDN-served origin.
-- Cap them at 8 MiB (matching order-attachments) and restrict to web image
-- types. digitalassets only holds brand PNGs, so image-only types are safe.
-- Existing objects are unaffected; limits apply to future uploads.
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
where id in ('listing-images', 'digitalassets');

-- Remove the broad SELECT policy that let anyone enumerate/list every object
-- in listing-images. Public buckets serve objects by their public=true flag via
-- getPublicUrl, not via this SELECT policy (which only governs the list API),
-- so direct image URLs keep working after this drop.
drop policy if exists listing_images_public_read on storage.objects;
