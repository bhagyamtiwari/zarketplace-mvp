// One photo into the listing-images bucket: the three sizes the shop uses and
// the 1200x630 link-preview card, named so variantUrl() and socialCardUrl()
// find them. Shared by the sell form and the admin listing editor, so a photo
// an operator adds is stored exactly like one a vendor sent.
import { supabase } from './supabase';
import { encodeVariants, encodeSocialCard, SOCIAL_CARD_SUFFIX } from './images';

/** Uploads the photo and returns the URL to store: the 1600px variant. */
export async function uploadListingPhoto(file: File, userId: string): Promise<string> {
  const base = `listings/${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const put = async (path: string, blob: Blob) => {
    const { error } = await supabase.storage
      .from('listing-images')
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' });
    if (error) throw error;
  };
  // Three sizes per photo; the stored URL is the 1600px one and variantUrl()
  // derives the other two from its name.
  const variants = await encodeVariants(file);
  let fullUrl = '';
  for (const variant of ['thumb', 'grid', 'full'] as const) {
    const { blob, width, ext } = variants[variant];
    const path = `${base}-${width}.${ext}`;
    await put(path, blob);
    if (variant === 'full') fullUrl = supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
  }
  // The link-preview card, made for every photo because any of them can end
  // up as the cover. socialCardUrl() finds it by name.
  await put(`${base}${SOCIAL_CARD_SUFFIX}`, await encodeSocialCard(file));
  return fullUrl;
}
