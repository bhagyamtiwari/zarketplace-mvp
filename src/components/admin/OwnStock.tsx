// Own stock: items we have already bought outright and hold at the hub.
//
// They skip the offer: there is no vendor to make an offer to. One form puts
// the item live as Instant Ship and records the purchase (what we paid, when,
// from whom), which the margin scheme needs: GST is on the sale price minus
// what we paid, item by item. The register below is that record.
//
// The work happens in one database function, admin_add_own_stock, so the
// listing and its purchase record are written together or not at all.
import * as React from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { cn, formatCurrency } from '../../lib/utils';
import { normalizePhoto, variantUrl } from '../../lib/images';
import { uploadListingPhoto } from '../../lib/listingPhotos';
import { CONDITIONS } from '../../lib/condition';
import { CATEGORY_SIZES } from '../../lib/sizes';
import { itemPath } from '../../lib/pageMeta';

const LABEL = 'text-[11px] font-black uppercase tracking-widest';
const INPUT = 'w-full border border-black/20 px-3 py-2.5 text-sm focus:border-black focus:outline-none';
const CATEGORIES = ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories'];
const GENDERS = ['Men', 'Women', 'Unisex'];
const MEASURES: Array<{ key: string; label: string; for: string[] }> = [
  { key: 'pit_to_pit_cm', label: 'Pit to pit', for: ['Tops', 'Outerwear'] },
  { key: 'length_cm', label: 'Length', for: ['Tops', 'Outerwear'] },
  { key: 'sleeve_cm', label: 'Sleeve', for: ['Tops', 'Outerwear'] },
  { key: 'waist_cm', label: 'Waist (flat)', for: ['Bottoms'] },
  { key: 'inseam_cm', label: 'Inseam', for: ['Bottoms'] },
  { key: 'outseam_cm', label: 'Outseam', for: ['Bottoms'] },
];
const today = () => new Date().toISOString().slice(0, 10);

interface Photo { file: File; preview: string }
interface RegisterRow {
  listing_id: string; offer_amount: number | null; supplier_name: string | null; supplier_contact: string | null;
  purchased_on: string | null; purchase_note: string | null;
  listing: { sku: string | null; title: string; brand: string | null; price: number; sale_price: number | null; is_sold: boolean; image_url: string } | null;
}

const EMPTY = {
  title: '', brand: '', category: 'Tops', gender: 'Men', size_type: '', condition: 'Great',
  price: '', sale_price: '', description: '', has_flaws: false, flaws_description: '',
  authenticity_confirmed: true, original_tags_attached: false,
  cost: '', purchased_on: today(), supplier_name: '', supplier_contact: '', note: '',
};

export function OwnStock() {
  const { user } = useAuth();
  const [f, setF] = React.useState(EMPTY);
  const [measures, setMeasures] = React.useState<Record<string, string>>({});
  const [unit, setUnit] = React.useState<'in' | 'cm'>('in');
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [busy, setBusy] = React.useState<null | string>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<{ sku: string; path: string } | null>(null);
  const [hub, setHub] = React.useState<Record<string, string> | null | undefined>(undefined);
  const [rows, setRows] = React.useState<RegisterRow[]>([]);

  const load = React.useCallback(async () => {
    const [{ data: cfg }, { data: reg }] = await Promise.all([
      supabase.from('fulfillment_config').select('hub_address').eq('id', 1).maybeSingle(),
      supabase.from('acquisitions')
        .select('listing_id, offer_amount, supplier_name, supplier_contact, purchased_on, purchase_note, listing:listings(sku, title, brand, price, sale_price, is_sold, image_url)')
        .eq('source', 'own_stock').order('purchased_on', { ascending: false }).limit(200),
    ]);
    setHub((cfg as { hub_address: Record<string, string> | null } | null)?.hub_address ?? null);
    setRows((reg as unknown as RegisterRow[]) ?? []);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next: Photo[] = [];
    for (const file of Array.from(files).slice(0, 10 - photos.length)) {
      try { const n = await normalizePhoto(file); next.push({ file: n, preview: URL.createObjectURL(n) }); } catch { /* skip unreadable */ }
    }
    setPhotos((p) => [...p, ...next]);
  };

  const sizes = CATEGORY_SIZES[f.category] ?? [];
  const shownMeasures = MEASURES.filter((m) => m.for.includes(f.category));
  const needsMeasures = f.category === 'Tops' || f.category === 'Outerwear';
  const cost = Number(f.cost);
  const sell = Number(f.sale_price || f.price);
  const margin = cost >= 0 && sell > 0 && f.cost !== '' ? sell - cost : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setAdded(null);
    if (!user) return;
    if (!photos.length) { setError('Add at least one photo.'); return; }
    if (!f.title.trim()) { setError('Add a title.'); return; }
    if (!(Number(f.price) > 0)) { setError('Add the price we sell it at.'); return; }
    if (f.cost === '' || cost < 0) { setError('Add what we paid for it.'); return; }
    if (!f.supplier_name.trim()) { setError('Add who we bought it from.'); return; }
    if (needsMeasures && (!measures.pit_to_pit_cm || !measures.length_cm)) { setError('Tops and outerwear need pit to pit and length.'); return; }
    if (f.sale_price && Number(f.sale_price) >= Number(f.price)) { setError('The sale price must be lower than the price.'); return; }

    try {
      setBusy('Uploading photos');
      const urls = await Promise.all(photos.map((p) => uploadListingPhoto(p.file, user.id)));
      setBusy('Adding');
      const toCm = (v: string) => (v ? String(Math.round(Number(v) * (unit === 'in' ? 2.54 : 1) * 10) / 10) : '');
      const item: Record<string, unknown> = {
        title: f.title.trim(), brand: f.brand.trim(), category: f.category, gender: f.gender,
        size_type: f.size_type, condition: f.condition, price: f.price, sale_price: f.sale_price,
        description: f.description.trim(), has_flaws: f.has_flaws, flaws_description: f.has_flaws ? f.flaws_description.trim() : '',
        authenticity_confirmed: f.authenticity_confirmed, original_tags_attached: f.original_tags_attached,
        image_url: urls[0], image_urls: urls,
      };
      for (const m of shownMeasures) item[m.key] = toCm(measures[m.key] ?? '');
      const { data, error: rpcError } = await supabase.rpc('admin_add_own_stock', {
        p_item: item,
        p_purchase: { amount: f.cost, purchased_on: f.purchased_on, supplier_name: f.supplier_name.trim(), supplier_contact: f.supplier_contact.trim(), note: f.note.trim() },
      });
      if (rpcError) throw rpcError;
      const res = data as { id: string; sku: string };
      setAdded({ sku: res.sku, path: itemPath({ sku: res.sku, title: f.title, brand: f.brand }) });
      // Keep what is usually the same for the next item from the same lot.
      setF((p) => ({ ...EMPTY, category: p.category, gender: p.gender, purchased_on: p.purchased_on, supplier_name: p.supplier_name, supplier_contact: p.supplier_contact }));
      setMeasures({});
      setPhotos([]);
      void load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not add it.');
    } finally {
      setBusy(null);
    }
  };

  const totals = rows.reduce((t, r) => {
    const c = Number(r.offer_amount ?? 0);
    const p = Number(r.listing?.sale_price ?? r.listing?.price ?? 0);
    t.cost += c; if (r.listing?.is_sold) { t.soldCost += c; t.soldValue += p; }
    return t;
  }, { cost: 0, soldCost: 0, soldValue: 0 });

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={submit} className="flex flex-col gap-8 border border-black p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Add an item we own</h2>
          <p className="text-xs ink-mid">Goes live straight away as Instant Ship. No offer, no vendor emails, no payout.</p>
          {hub === null && <p className="text-xs font-bold text-red-700">The hub address is not set, so this will fail. Set fulfillment_config.hub_address first.</p>}
          {hub && <p className="text-xs ink-mid">Held at: {[hub.address, hub.city, hub.pincode].filter(Boolean).join(', ')}</p>}
        </div>

        <fieldset className="flex flex-col gap-3">
          <span className={LABEL}>Photos (first is the cover)</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.preview} className="relative h-28 w-20 overflow-hidden bg-zinc-100">
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 bg-black/70 p-1 text-white"><X className="h-3 w-3" /></button>
                {i > 0 && (
                  <button type="button" onClick={() => setPhotos((all) => [all[i], ...all.filter((_, j) => j !== i)])}
                    className="absolute bottom-1 left-1 bg-white/90 px-1 text-[10px] font-bold">Cover</button>
                )}
              </div>
            ))}
            {photos.length < 10 && (
              <label className="relative flex h-28 w-20 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-black/30 text-xs hover:border-black">
                <Plus className="h-4 w-4" /> Add
                <input type="file" accept="image/*" multiple onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }}
                  className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            )}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title"><input value={f.title} onChange={set('title')} className={INPUT} placeholder="Carhartt Detroit Jacket" /></Field>
          <Field label="Brand"><input value={f.brand} onChange={set('brand')} className={INPUT} /></Field>
          <Field label="Category">
            <select value={f.category} onChange={(e) => { set('category')(e); setF((p) => ({ ...p, size_type: '' })); }} className={INPUT}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Gender">
            <select value={f.gender} onChange={set('gender')} className={INPUT}>{GENDERS.map((g) => <option key={g}>{g}</option>)}</select>
          </Field>
          <Field label="Size">
            <select value={f.size_type} onChange={set('size_type')} className={INPUT}>
              <option value="">Choose</option>
              {sizes.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select value={f.condition} onChange={set('condition')} className={INPUT}>{CONDITIONS.map((c) => <option key={c.name}>{c.name}</option>)}</select>
          </Field>
        </div>

        {shownMeasures.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={LABEL}>Measurements{needsMeasures ? ' (pit to pit and length required)' : ''}</span>
              <span className="flex gap-2 text-xs">
                {(['in', 'cm'] as const).map((u) => (
                  <button key={u} type="button" onClick={() => setUnit(u)} className={cn(unit === u ? 'font-bold' : 'underline')}>{u}</button>
                ))}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {shownMeasures.map((m) => (
                <Field key={m.key} label={`${m.label} (${unit})`}>
                  <input inputMode="decimal" value={measures[m.key] ?? ''} className={INPUT}
                    onChange={(e) => setMeasures((p) => ({ ...p, [m.key]: e.target.value.replace(/[^0-9.]/g, '') }))} />
                </Field>
              ))}
            </div>
          </fieldset>
        )}

        <Field label="Description"><textarea value={f.description} onChange={set('description')} rows={4} className={INPUT} /></Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.authenticity_confirmed} onChange={set('authenticity_confirmed')} className="accent-black" /> Checked authentic</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.original_tags_attached} onChange={set('original_tags_attached')} className="accent-black" /> Original tags attached</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.has_flaws} onChange={set('has_flaws')} className="accent-black" /> Has flaws</label>
        </div>
        {f.has_flaws && <Field label="Flaws"><input value={f.flaws_description} onChange={set('flaws_description')} className={INPUT} placeholder="Small mark on left cuff" /></Field>}

        <div className="grid grid-cols-1 gap-4 border-t border-black/10 pt-6 sm:grid-cols-3">
          <Field label="Price (what the buyer pays)"><input inputMode="numeric" value={f.price} onChange={set('price')} className={INPUT} placeholder="Rs." /></Field>
          <Field label="Sale price (optional)"><input inputMode="numeric" value={f.sale_price} onChange={set('sale_price')} className={INPUT} placeholder="Rs." /></Field>
          <div className="flex flex-col justify-end gap-1 text-sm">
            {margin != null && <span>Margin: <strong className={margin < 0 ? 'text-red-700' : ''}>{formatCurrency(margin)}</strong></span>}
          </div>
        </div>

        <fieldset className="grid grid-cols-1 gap-4 border-t border-black/10 pt-6 sm:grid-cols-2">
          <legend className={cn(LABEL, 'mb-3')}>Purchase record (for GST)</legend>
          <Field label="What we paid"><input inputMode="numeric" value={f.cost} onChange={set('cost')} className={INPUT} placeholder="Rs." /></Field>
          <Field label="Bought on"><input type="date" value={f.purchased_on} onChange={set('purchased_on')} className={INPUT} /></Field>
          <Field label="Bought from"><input value={f.supplier_name} onChange={set('supplier_name')} className={INPUT} placeholder="Name, shop or lot" /></Field>
          <Field label="Their phone or email (optional)"><input value={f.supplier_contact} onChange={set('supplier_contact')} className={INPUT} /></Field>
          <div className="sm:col-span-2"><Field label="Note (optional)"><input value={f.note} onChange={set('note')} className={INPUT} placeholder="Paid by UPI, ref 1234" /></Field></div>
        </fieldset>

        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        {added && (
          <p className="text-sm font-bold text-emerald-700">
            Added {added.sku}. It is live. <a href={added.path} target="_blank" rel="noreferrer" className="underline">View it</a>
          </p>
        )}
        <button type="submit" disabled={!!busy}
          className="inline-flex items-center justify-center gap-2 self-start bg-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ?? 'Add and put live'}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Purchase register</h2>
          <span className="text-xs">
            Bought: <strong>{formatCurrency(totals.cost)}</strong>
            {totals.soldValue > 0 && <> · Sold for <strong>{formatCurrency(totals.soldValue)}</strong> against <strong>{formatCurrency(totals.soldCost)}</strong> paid</>}
          </span>
        </div>
        {rows.length === 0 ? <p className="text-sm ink-mid">Nothing yet.</p> : (
          <div className="overflow-x-auto border border-black/10">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-50 text-left text-[11px] font-black uppercase tracking-widest">
                <tr><th className="p-3">Item</th><th className="p-3">Bought on</th><th className="p-3">From</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Margin</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const price = Number(r.listing?.sale_price ?? r.listing?.price ?? 0);
                  const paid = Number(r.offer_amount ?? 0);
                  return (
                    <tr key={r.listing_id} className="border-t border-black/10">
                      <td className="p-3">
                        <span className="flex items-center gap-3">
                          {r.listing?.image_url && <img src={variantUrl(r.listing.image_url, 'thumb')} alt="" className="h-10 w-8 object-cover" />}
                          <span className="flex flex-col"><span className="font-bold">{r.listing?.title}</span><span className="text-xs ink-mid">{r.listing?.sku}</span></span>
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">{r.purchased_on}</td>
                      <td className="p-3">{r.supplier_name}{r.supplier_contact ? <span className="block text-xs ink-mid">{r.supplier_contact}</span> : null}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(paid)}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(price)}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(price - paid)}</td>
                      <td className="p-3">{r.listing?.is_sold ? 'Sold' : 'Live'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1.5"><span className={LABEL}>{label}</span>{children}</label>
);
