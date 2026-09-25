// The operator's control over a listing, whatever the vendor sent: photos
// (add, remove, reorder, choose the cover), the words (title, brand,
// description), how it is filed (category, gender, size, fits like),
// condition and flaws, measurements, and price. We sell the item in our own
// name, so the listing is ours to write; the vendor's offer and payout are
// fixed separately and nothing here touches them.
//
// Saving writes only what changed, and records the before and after in the
// admin audit log, so the vendor's original wording is never lost.
import * as React from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../types';
import { cn } from '../../lib/utils';
import { normalizePhoto, variantUrl } from '../../lib/images';
import { uploadListingPhoto } from '../../lib/listingPhotos';
import { usePhotoDrop } from '../../lib/photoDrop';
import { CONDITIONS } from '../../lib/condition';
import { CATEGORY_SIZES } from '../../lib/sizes';
import { writeAudit } from '../../lib/adminAudit';
import { useAuth } from '../../lib/auth';

// More than a vendor may send: an operator may add our own shots.
const MAX_PHOTOS = 10;
const CATEGORIES = ['Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'];
const GENDERS = ['Men', 'Women', 'Unisex'];
const MEASURES = [
  ['pit_to_pit_cm', 'Pit to pit'],
  ['length_cm', 'Length'],
  ['sleeve_cm', 'Sleeve'],
  ['waist_cm', 'Waist'],
  ['inseam_cm', 'Inseam'],
  ['outseam_cm', 'Outseam'],
] as const;
type MeasureKey = typeof MEASURES[number][0];

const LABEL = 'text-[11px] font-black uppercase tracking-widest';
const INPUT = 'w-full border border-black/20 px-3 py-2.5 text-sm focus:border-black focus:outline-none';

function photosOf(l: Listing): string[] {
  const list = (l.image_urls ?? []).filter(Boolean);
  if (list.length) return list;
  return l.image_url ? [l.image_url] : [];
}

const numText = (v: number | null | undefined) => (v == null ? '' : String(v));
const textOrNull = (v: string) => (v.trim() ? v.trim() : null);
function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function ListingEditor({ listing, onCancel, onSaved }: {
  listing: Listing;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [photos, setPhotos] = React.useState<string[]>(() => photosOf(listing));
  const [title, setTitle] = React.useState(listing.title ?? '');
  const [brand, setBrand] = React.useState(listing.brand ?? '');
  const [description, setDescription] = React.useState(listing.description ?? '');
  const [category, setCategory] = React.useState(listing.category ?? '');
  const [gender, setGender] = React.useState(listing.gender ?? '');
  const [sizeType, setSizeType] = React.useState(listing.size_type ?? '');
  const [fitsLike, setFitsLike] = React.useState(listing.size ?? '');
  const [condition, setCondition] = React.useState(listing.condition ?? '');
  const [hasFlaws, setHasFlaws] = React.useState(!!listing.has_flaws);
  const [flaws, setFlaws] = React.useState(listing.flaws_description ?? '');
  const [measures, setMeasures] = React.useState<Record<MeasureKey, string>>(() => ({
    pit_to_pit_cm: numText(listing.pit_to_pit_cm),
    length_cm: numText(listing.length_cm),
    sleeve_cm: numText(listing.sleeve_cm),
    waist_cm: numText(listing.waist_cm),
    inseam_cm: numText(listing.inseam_cm),
    outseam_cm: numText(listing.outseam_cm),
  }));
  const [price, setPrice] = React.useState(listing.price ? String(listing.price) : '');
  const [salePrice, setSalePrice] = React.useState(numText(listing.sale_price));

  const [uploading, setUploading] = React.useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sizes = CATEGORY_SIZES[category] ?? [];

  const move = (i: number, dir: -1 | 1) => setPhotos((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const makeCover = (i: number) => setPhotos((prev) => [prev[i], ...prev.filter((_, k) => k !== i)]);
  const remove = (i: number) => setPhotos((prev) => prev.filter((_, k) => k !== i));

  // Picked, or dragged onto the photos from a computer.
  const addFiles = async (files: File[]) => {
    const picked = files.filter((f) => !f.type || f.type.startsWith('image/'));
    if (!picked.length || !user || uploading) return;
    const room = MAX_PHOTOS - photos.length;
    const batch = picked.slice(0, Math.max(0, room));
    if (!batch.length) { setError(`${MAX_PHOTOS} photos is the most a listing takes.`); return; }
    setError(null);
    setUploading({ done: 0, total: batch.length });
    let failed = 0;
    for (let i = 0; i < batch.length; i++) {
      try {
        const url = await uploadListingPhoto(await normalizePhoto(batch[i]), user.id);
        setPhotos((prev) => [...prev, url]);
      } catch {
        failed++;
      }
      setUploading({ done: i + 1, total: batch.length });
    }
    setUploading(null);
    if (failed) setError(`${failed === 1 ? 'One photo' : `${failed} photos`} could not be uploaded. Try again, or try a different file.`);
    else if (picked.length > batch.length) setError(`${MAX_PHOTOS} photos is the most, so the first ${batch.length} were added.`);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked: File[] = input.files ? Array.from(input.files) : [];
    input.value = '';
    void addFiles(picked);
  };
  const drop = usePhotoDrop((files) => { void addFiles(files); }, !!uploading || photos.length >= MAX_PHOTOS);

  const save = async () => {
    setError(null);
    if (!title.trim()) { setError('The listing needs a title.'); return; }
    if (!photos.length) { setError('The listing needs at least one photo.'); return; }
    if (hasFlaws && !flaws.trim()) { setError('Describe the flaw, or untick "Has a flaw".'); return; }
    const priceNum = numOrNull(price);
    const saleNum = numOrNull(salePrice);
    if (Number.isNaN(priceNum) || (priceNum != null && priceNum < 0)) { setError('Check the price.'); return; }
    if (listing.status === 'approved' && !(priceNum && priceNum > 0)) { setError('A live listing needs a price.'); return; }
    if (Number.isNaN(saleNum) || (saleNum != null && (saleNum <= 0 || (priceNum != null && saleNum >= priceNum)))) {
      setError('A sale price has to be above zero and below the price, or left empty.'); return;
    }
    const measureValues: Partial<Record<MeasureKey, number | null>> = {};
    for (const [key, label] of MEASURES) {
      const n = numOrNull(measures[key]);
      if (Number.isNaN(n) || (n != null && (n <= 0 || n > 300))) { setError(`Check the ${label.toLowerCase()} measurement (in cm).`); return; }
      measureValues[key] = n;
    }

    const next: Record<string, unknown> = {
      title: title.trim(),
      brand: textOrNull(brand),
      description: textOrNull(description),
      category: category || null,
      gender: gender || null,
      size_type: sizeType || null,
      size: textOrNull(fitsLike),
      condition: condition || null,
      has_flaws: hasFlaws,
      flaws_description: hasFlaws ? flaws.trim() : null,
      price: priceNum ?? 0,
      sale_price: saleNum,
      ...measureValues,
    };
    const before = listing as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const old: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      const was = before[k] ?? null;
      const same = typeof v === 'number' || typeof was === 'number' ? Number(was) === Number(v) && (was == null) === (v == null) : was === v;
      if (!same) { patch[k] = v; old[k] = was; }
    }
    if (JSON.stringify(photos) !== JSON.stringify(photosOf(listing))) {
      patch.image_urls = photos;
      patch.image_url = photos[0];
      old.image_urls = photosOf(listing);
    }
    if (!Object.keys(patch).length) { onCancel(); return; }

    setSaving(true);
    try {
      // .select() so a refusal is visible: an update the database's rules
      // filter out returns no error and no rows, and would look saved.
      const { data: updated, error: upErr } = await supabase.from('listings').update(patch).eq('id', listing.id).select('id');
      if (upErr) throw upErr;
      if (!updated?.length) throw new Error('Nothing was saved. Check you are signed in as an admin.');
      await writeAudit({ entity: 'listing', entity_id: listing.id, action: 'listing.edit', old_state: old, new_state: patch, reason: title.trim() });
      await onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-8 border border-black p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-black uppercase tracking-widest">Edit listing</h3>
        <p className="text-xs ink-mid">
          {listing.status === 'approved' ? 'This item is live: changes show on the site as soon as you save.' : 'Changes are saved to the listing now and show once it goes live.'}
          {' '}The vendor&apos;s offer and payout do not change.
        </p>
      </div>

      {/* Photos: the first is the cover everywhere. Photos dropped anywhere
          here are added. */}
      <div className="flex flex-col gap-3" {...drop.bind}>
        <span className={LABEL}>Photos ({photos.length}/{MAX_PHOTOS})</span>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((url, i) => (
            <div key={`${url}-${i}`} className="flex flex-col gap-1">
              <div className="relative aspect-[3/4] overflow-hidden bg-zinc-100">
                <img src={variantUrl(url, 'thumb')} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                {i === 0 && <span className="absolute left-1 top-1 bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">Cover</span>}
                <button type="button" onClick={() => remove(i)} aria-label="Remove photo"
                  className="absolute right-1 top-1 bg-black/75 p-1.5 text-white hover:bg-black">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier"
                  className="p-1 disabled:opacity-25"><ArrowLeft className="h-3.5 w-3.5" /></button>
                {i !== 0 ? (
                  <button type="button" onClick={() => makeCover(i)} className="text-[11px] font-bold underline underline-offset-2">Make cover</button>
                ) : <span />}
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Move later"
                  className="p-1 disabled:opacity-25"><ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className={cn('relative flex aspect-[3/4] flex-col items-center justify-center gap-1 border border-dashed text-center',
              'has-[:focus-visible]:border-solid has-[:focus-visible]:border-black',
              drop.over ? 'border-solid border-black bg-black/[0.04]' : 'border-black/30',
              !uploading && 'hover:border-black')}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-[11px] font-bold">{uploading.done}/{uploading.total}</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="text-[11px] font-bold">Add photos</span>
                  <span className="hidden text-[11px] pointer-fine:block">or drop them here</span>
                </>
              )}
              {/* Covers the tile, so a tap lands on the input itself: iOS
                  Safari will not open a hidden one through its label. */}
              <input type="file" accept="image/*" multiple onChange={onPick} disabled={!!uploading}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 file:cursor-pointer disabled:cursor-wait" />
            </label>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={LABEL}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Brand</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className={INPUT}>
            <option value="">Choose</option>
            {CONDITIONS.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.grade})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={LABEL}>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Category</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setSizeType(''); }} className={INPUT}>
            <option value="">Choose</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>For</span>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={INPUT}>
            <option value="">Choose</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Size</span>
          <select value={sizeType} onChange={(e) => setSizeType(e.target.value)} className={INPUT} disabled={!category}>
            <option value="">{category ? 'Choose' : 'Choose a category first'}</option>
            {/* Keep an existing size even if the category's list no longer has it. */}
            {sizeType && !sizes.includes(sizeType) && <option value={sizeType}>{sizeType}</option>}
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Fits like</span>
          <input value={fitsLike} onChange={(e) => setFitsLike(e.target.value)} placeholder="e.g. Oversized, fits like XL" className={INPUT} />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={hasFlaws} onChange={(e) => setHasFlaws(e.target.checked)} className="h-4 w-4 accent-black" />
          Has a flaw
        </label>
        {hasFlaws && (
          <textarea value={flaws} onChange={(e) => setFlaws(e.target.value)} rows={2} placeholder="What and where, e.g. small stain on the left cuff" className={INPUT} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className={LABEL}>Measurements, laid flat (cm)</span>
        <div className="grid grid-cols-3 gap-3">
          {MEASURES.map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs">{label}</span>
              <input type="number" inputMode="decimal" value={measures[key]}
                onChange={(e) => setMeasures((prev) => ({ ...prev, [key]: e.target.value }))} className={INPUT} />
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Price (Rs.)</span>
          <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Sale price (Rs.)</span>
          <input type="number" inputMode="numeric" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="None" className={INPUT} />
        </label>
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={saving || !!uploading}
          className="inline-flex items-center gap-2 bg-black px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="border border-black/20 px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:border-black disabled:opacity-50">
          Cancel
        </button>
      </div>
    </section>
  );
}
