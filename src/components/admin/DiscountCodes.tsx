// Promo codes, from the admin portal: make one for a special customer or to
// make up for something, see which are live and which have been used, and by
// whom.
//
// A code is a fixed rupee amount off an order (COPY_RULES). What it is worth
// is decided on the server when it is applied (apply_discount_code), so this
// page only ever writes the code's rules, never an order.
import * as React from 'react';
import { Check, Copy, Loader2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { cn, formatCurrency } from '../../lib/utils';
import { writeAudit } from '../../lib/adminAudit';
import {
  CODE_RE, PURPOSES, makeCode, normalizeCode, type DiscountCode, type DiscountRedemption,
} from '../../lib/discounts';

const LABEL = 'text-[11px] font-black uppercase tracking-widest';
const INPUT = 'w-full border border-black/20 px-3 py-2.5 text-sm focus:border-black focus:outline-none';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'Active' | 'Used up' | 'Expired' | 'Off';
type Filter = 'active' | 'used' | 'closed' | 'all';

interface Usage { used: number; paying: number; given: number }

function statusOf(c: DiscountCode, u: Usage): Status {
  if (!c.active) return 'Off';
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return 'Expired';
  if (c.max_uses != null && u.used >= c.max_uses) return 'Used up';
  return 'Active';
}

const STATUS_TONE: Record<Status, string> = {
  Active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Used up': 'bg-black/[0.04] text-black border-black/15',
  Expired: 'bg-black/[0.04] text-black border-black/15',
  Off: 'bg-black/[0.04] text-black border-black/15',
};

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function DiscountCodes() {
  const [codes, setCodes] = React.useState<DiscountCode[]>([]);
  const [redemptions, setRedemptions] = React.useState<DiscountRedemption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [making, setMaking] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>('active');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [c, r] = await Promise.all([
      supabase.from('discount_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('discount_redemptions').select('*').order('created_at', { ascending: false }),
    ]);
    if (c.error || r.error) setError((c.error ?? r.error)?.message ?? 'Could not load the codes.');
    setCodes(((c.data as DiscountCode[]) ?? []).map((x) => ({ ...x, amount_off: Number(x.amount_off), min_order: Number(x.min_order) })));
    setRedemptions(((r.data as DiscountRedemption[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
    setLoading(false);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const usage = React.useMemo(() => {
    const m = new Map<string, Usage>();
    const now = Date.now();
    for (const r of redemptions) {
      const u = m.get(r.code_id) ?? { used: 0, paying: 0, given: 0 };
      if (r.status === 'used') { u.used += 1; u.given += r.amount; }
      else if (r.status === 'held' && r.held_until && new Date(r.held_until).getTime() > now) u.paying += 1;
      m.set(r.code_id, u);
    }
    return m;
  }, [redemptions]);
  const usageOf = (id: string): Usage => usage.get(id) ?? { used: 0, paying: 0, given: 0 };

  const shown = codes.filter((c) => {
    const s = statusOf(c, usageOf(c.id));
    if (filter === 'active') return s === 'Active';
    if (filter === 'used') return usageOf(c.id).used > 0;
    if (filter === 'closed') return s !== 'Active';
    return true;
  });

  const totals = React.useMemo(() => {
    let active = 0, uses = 0, given = 0;
    for (const c of codes) {
      const u = usageOf(c.id);
      if (statusOf(c, u) === 'Active') active += 1;
      uses += u.used;
      given += u.given;
    }
    return { active, uses, given };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes, usage]);

  const toggle = async (c: DiscountCode) => {
    const next = !c.active;
    if (!next && !confirm(`Turn off ${c.code}? Nobody will be able to use it until it is turned back on.`)) return;
    setBusyId(c.id);
    try {
      const { data, error: upErr } = await supabase.from('discount_codes').update({ active: next }).eq('id', c.id).select('id');
      if (upErr) throw upErr;
      if (!data?.length) throw new Error('Nothing was saved. Check you are signed in as an admin.');
      await writeAudit({ entity: 'discount', entity_id: c.id, action: next ? 'discount.on' : 'discount.off', old_state: { active: c.active }, new_state: { active: next }, reason: c.code });
      await load();
    } catch (err: any) { alert(err?.message ?? 'Failed.'); } finally { setBusyId(null); }
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-8">
          <div><dt className={LABEL}>Active codes</dt><dd className="text-2xl font-black">{totals.active}</dd></div>
          <div><dt className={LABEL}>Times used</dt><dd className="text-2xl font-black">{totals.uses}</dd></div>
          <div><dt className={LABEL}>Given in discounts</dt><dd className="text-2xl font-black">{formatCurrency(totals.given)}</dd></div>
        </dl>
        {!making && (
          <button type="button" onClick={() => setMaking(true)}
            className="inline-flex items-center gap-2 bg-black px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800">
            <Plus className="h-4 w-4" /> New code
          </button>
        )}
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {making && (
        <NewCodeForm
          existing={new Set(codes.map((c) => c.code))}
          onCancel={() => setMaking(false)}
          onCreated={async (id) => { setMaking(false); await load(); setFilter('active'); setOpenId(id); }}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {([['active', 'Active'], ['used', 'Used'], ['closed', 'Used up, expired or off'], ['all', 'All']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={cn('border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest',
              filter === key ? 'border-black bg-black text-white' : 'border-black/20 hover:border-black')}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm ink-mid">{codes.length === 0 ? 'No codes yet. Make one with New code.' : 'No codes here.'}</p>
      ) : (
        <div className="overflow-x-auto border border-black/10">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.02]">
                {['Code', 'Worth', 'For', 'Used', 'Status', 'Expires', ''].map((h) => (
                  <th key={h} className={cn('py-2.5 px-3', LABEL, h === '' && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const u = usageOf(c.id);
                const s = statusOf(c, u);
                const open = openId === c.id;
                const mine = redemptions.filter((r) => r.code_id === c.id);
                return (
                  <React.Fragment key={c.id}>
                    <tr className="border-b border-black/5 align-top">
                      <td className="py-3 px-3">
                        <button type="button" onClick={() => setOpenId(open ? null : c.id)} className="text-left">
                          <span className="block font-mono text-[13px] font-bold">{c.code}</span>
                          <span className="block text-[11px] ink-mid">
                            {PURPOSES.find((p) => p.key === c.purpose)?.label}{c.note ? `: ${c.note}` : ''}
                          </span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-[13px] whitespace-nowrap">
                        {formatCurrency(c.amount_off)} off
                        {c.min_order > 0 && <span className="block text-[11px] ink-mid">orders of {formatCurrency(c.min_order)}+</span>}
                      </td>
                      <td className="py-3 px-3 text-[13px]">{c.for_email ?? 'Anyone with the code'}</td>
                      <td className="py-3 px-3 text-[13px] whitespace-nowrap">
                        {u.used}{c.max_uses != null ? ` of ${c.max_uses}` : ''}
                        {c.once_per_customer && <span className="block text-[11px] ink-mid">once each</span>}
                        {u.paying > 0 && <span className="block text-[11px] ink-mid">{u.paying} paying now</span>}
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn('inline-block border px-2 py-0.5 text-[11px] font-black uppercase tracking-wider', STATUS_TONE[s])}>{s}</span>
                      </td>
                      <td className="py-3 px-3 text-[13px] whitespace-nowrap">{c.expires_at ? dateText(c.expires_at) : 'Never'}</td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <CopyButton text={c.code} />
                        <button type="button" onClick={() => toggle(c)} disabled={busyId === c.id}
                          className="ml-3 text-[11px] font-black uppercase tracking-widest ink-mid hover:text-black disabled:opacity-40">
                          {c.active ? 'Turn off' : 'Turn on'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-black/5 bg-black/[0.015]">
                        <td colSpan={7} className="px-3 py-4">
                          {mine.length === 0 ? (
                            <p className="text-[13px] ink-mid">Not used yet.</p>
                          ) : (
                            <ul className="flex flex-col gap-2 text-[13px]">
                              {mine.map((r) => (
                                <li key={r.id} className="flex flex-wrap justify-between gap-x-6 gap-y-1">
                                  <span><span className="font-bold">{r.buyer_email ?? 'Unknown buyer'}</span>, {r.order_numbers.join(', ')}</span>
                                  <span className="whitespace-nowrap">
                                    {formatCurrency(r.amount)} off,{' '}
                                    {r.status === 'used' ? `paid ${dateText(r.used_at)}`
                                      : r.status === 'released' ? 'not paid, given back'
                                      : 'waiting for payment'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button type="button" aria-label={`Copy ${text}`}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* nothing to do */ } }}
      className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest ink-mid hover:text-black">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * A new code. The purpose picks a prefix for "Make one", so a code says what
 * it was for when it turns up on an order: THANKS- for a special customer,
 * SORRY- for making up for something, WELCOME- for someone new.
 */
function NewCodeForm({ existing, onCancel, onCreated }: {
  existing: Set<string>; onCancel: () => void; onCreated: (id: string) => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [purpose, setPurpose] = React.useState<DiscountCode['purpose']>('retention');
  const [code, setCode] = React.useState(() => makeCode('THANKS'));
  const [worth, setWorth] = React.useState('');
  const [minOrder, setMinOrder] = React.useState('');
  const [forEmail, setForEmail] = React.useState('');
  const [maxUses, setMaxUses] = React.useState('');
  const [oncePerCustomer, setOncePerCustomer] = React.useState(true);
  const [expires, setExpires] = React.useState('');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const prefixFor = (p: DiscountCode['purpose']) => PURPOSES.find((x) => x.key === p)?.prefix ?? 'ZARKET';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const c = normalizeCode(code);
    const amount = Number(worth);
    const min = minOrder.trim() ? Number(minOrder) : 0;
    const email = forEmail.trim().toLowerCase();
    const uses = maxUses.trim() ? Number(maxUses) : null;
    if (!CODE_RE.test(c)) { setError('A code is 3 to 32 capital letters, numbers or hyphens.'); return; }
    if (existing.has(c)) { setError('That code already exists.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Say how much it takes off, in rupees.'); return; }
    if (!Number.isFinite(min) || min < 0) { setError('Check the minimum order.'); return; }
    if (email && !EMAIL_RE.test(email)) { setError('Check the email address.'); return; }
    if (uses != null && (!Number.isInteger(uses) || uses < 1)) { setError('Uses allowed is a whole number, or empty for no limit.'); return; }

    const row = {
      code: c,
      amount_off: Math.round(amount),
      min_order: Math.round(min),
      for_email: email || null,
      max_uses: uses,
      once_per_customer: oncePerCustomer,
      // The end of the chosen day, in India.
      expires_at: expires ? new Date(`${expires}T23:59:59+05:30`).toISOString() : null,
      purpose,
      note: note.trim() || null,
      created_by: user?.id ?? null,
    };
    setSaving(true);
    try {
      const { data, error: insErr } = await supabase.from('discount_codes').insert(row).select('id').single();
      if (insErr) throw insErr;
      await writeAudit({ entity: 'discount', entity_id: (data as { id: string }).id, action: 'discount.create', new_state: row, reason: c });
      await onCreated((data as { id: string }).id);
    } catch (err: any) {
      setError(err?.code === '23505' ? 'That code already exists.' : (err?.message ?? 'Could not save the code.'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-6 border border-black p-4 sm:p-5">
      <h3 className="text-sm font-black uppercase tracking-widest">New code</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>What it is for</span>
          <select value={purpose} className={INPUT}
            onChange={(e) => { const p = e.target.value as DiscountCode['purpose']; setPurpose(p); setCode(makeCode(prefixFor(p))); }}>
            {PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Code</span>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} maxLength={32}
              className={cn(INPUT, 'font-mono uppercase')} autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setCode(makeCode(prefixFor(purpose)))}
              className="shrink-0 border border-black/20 px-3 text-[11px] font-black uppercase tracking-widest hover:border-black">
              Make one
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Takes off (Rs.)</span>
          <input type="number" inputMode="numeric" min={1} value={worth} onChange={(e) => setWorth(e.target.value)} placeholder="200" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Minimum order (Rs.)</span>
          <input type="number" inputMode="numeric" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="None" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>For one person (email)</span>
          <input type="email" value={forEmail}
            onChange={(e) => { setForEmail(e.target.value); if (e.target.value.trim() && !maxUses) setMaxUses('1'); }}
            placeholder="Empty: anyone with the code" className={INPUT} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Uses allowed in total</span>
          <input type="number" inputMode="numeric" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="No limit" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Expires after</span>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={INPUT} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-bold">
          <input type="checkbox" checked={oncePerCustomer} onChange={(e) => setOncePerCustomer(e.target.checked)} className="h-4 w-4 accent-black" />
          Once per customer
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={LABEL}>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who it is for and why, e.g. regular buyer, or parcel arrived late" className={INPUT} />
        </label>
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 bg-black px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Make code
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="border border-black/20 px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:border-black disabled:opacity-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
