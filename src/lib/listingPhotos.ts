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
  // The four files go up side by side rather than one after another.
  const [variants, card] = await Promise.all([encodeVariants(file), encodeSocialCard(file)]);
  const paths = (['thumb', 'grid', 'full'] as const).map((v) => {
    const { blob, width, ext } = variants[v];
    return { v, blob, path: `${base}-${width}.${ext}` };
  });
  await Promise.all([
    ...paths.map(({ path, blob }) => put(path, blob)),
    put(`${base}${SOCIAL_CARD_SUFFIX}`, card),
  ]);
  const fullPath = paths.find((p) => p.v === 'full')!.path;
  const fullUrl = supabase.storage.from('listing-images').getPublicUrl(fullPath).data.publicUrl;
  return fullUrl;
}
