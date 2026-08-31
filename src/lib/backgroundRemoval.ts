// Background removal, applied on upload and always undoable.
//
// The rule from the brief is that photo quality never blocks a listing, so
// every failure here is silent and returns the original file. A vendor whose
// photo could not be processed should not be able to tell that anything was
// attempted.

import { supabase } from './supabase';
import { log } from './log';

const blog = log('sell');

/** Result of an attempt. `processed` is null when the original should stand. */
export interface BackgroundRemovalResult {
  processed: File | null;
  reason?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Try to strip the background. Never throws, never blocks: any failure returns
 * `{ processed: null }` and the caller keeps what the vendor uploaded.
 */
export async function removeBackground(file: File): Promise<BackgroundRemovalResult> {
  try {
    const image_base64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke('remove-background', {
      body: { image_base64 },
    });
    if (error) return { processed: null, reason: error.message };

    const res = data as { ok?: boolean; reason?: string; image_base64?: string } | null;
    if (!res?.ok || !res.image_base64) {
      return { processed: null, reason: res?.reason ?? 'unavailable' };
    }

    const bytes = Uint8Array.from(atob(res.image_base64), (c) => c.charCodeAt(0));
    const processed = new File(
      [bytes],
      file.name.replace(/\.[^.]+$/, '') + '-clean.png',
      { type: 'image/png' },
    );
    return { processed };
  } catch (err) {
    blog.warn('background removal unavailable, keeping the original', err);
    return { processed: null, reason: 'error' };
  }
}
