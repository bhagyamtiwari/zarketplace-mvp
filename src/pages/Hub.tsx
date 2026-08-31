// The hub console. What an operator does with an item once it physically
// arrives: check it against its listing, accept it into inventory or refuse
// it, pay the vendor, repack it, send it out.
//
// This screen deliberately shows no buyer. The hub handles items, not
// customers, and an operator holding a garment has no reason to know who
// bought it. Every action goes through a database function that moves the
// lifecycle, the acquisition and the shipment together, so an item can never
// end up half-received or accepted without the payout it causes.

import * as React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, PackageCheck, PackageX, Truck, IndianRupee, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RequireAuth } from '../components/RequireAuth';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { variantUrl } from '../lib/images';
import { cn, formatCurrency } from '../lib/utils';
import { log } from '../lib/log';

const hlog = log('hub');

interface HubRow {
  listing_id: string;
  title: string; brand: string | null; sku: string | null;
  image_url: string; condition: string | null;
  has_flaws: boolean; flaws_description: string | null; description: string | null;
  lifecycle_state: string;
  lifecycle_updated_at: string;
  offer_amount: number | null;
  intake_status: string | null;
  hub_notes: string | null;
  ship_by_deadline: string | null;
  ship_by_overdue: boolean;
  awb: string | null; courier: string | null;
  inbound_status: string | null; picked_up_at: string | null;
  payout_id: string | null; payout_status: string | null; payout_amount: number | null;
}

interface RefundRow {
  failure_id: string; listing_id: string; order_id: string; reason: string;
  hours_pending: number; order_number: string; total_amount: number;
  razorpay_payment_id: string | null; order_status: string;
}

interface AbandonedRow {
  failure_id: string; listing_id: string; title: string; reason: string;
  vendor_email: string | null; abandonment_deadline: string;
  return_requested: boolean;
}

type Tab = 'inbound' | 'bench' | 'outbound' | 'refunds' | 'holding';

// Where each lifecycle state belongs on this screen.
const TAB_STATES: Record<Exclude<Tab, 'refunds' | 'holding'>, string[]> = {
  inbound: ['SOLD', 'LABEL_ISSUED', 'PICKED_UP', 'IN_TRANSIT_INBOUND'],
  bench: ['RECEIVED_AT_HUB', 'ACCEPTED'],
  outbound: ['PAYOUT_SENT', 'REPACKED', 'SHIPPED_OUTBOUND'],
};

export function Hub() {
  useDocumentTitle('Hub');
  return (
    <RequireAuth message="Sign in to open the hub.">
      <HubInner />
    </RequireAuth>
  );
}

function HubInner() {
  const { profile } = useAuth();
  const [tab, setTab] = React.useState<Tab>('inbound');
  const [rows, setRows] = React.useState<HubRow[]>([]);
  const [refunds, setRefunds] = React.useState<RefundRow[]>([]);
  const [abandoned, setAbandoned] = React.useState<AbandonedRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [q, r, a] = await Promise.all([
        supabase.from('hub_queue').select('*').order('lifecycle_updated_at', { ascending: true }),
        supabase.from('pending_refunds').select('*').order('hours_pending', { ascending: false }),
        supabase.from('abandoned_items').select('*'),
      ]);
      if (q.error) throw q.error;
      setRows((q.data as unknown as HubRow[]) ?? []);
      setRefunds((r.data as unknown as RefundRow[]) ?? []);
      setAbandoned((a.data as unknown as AbandonedRow[]) ?? []);
    } catch (err: any) {
      hlog.error('hub load', err);
      setError(err?.message ?? 'Could not load the hub.');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  if (profile && !profile.is_admin) {
    return <Shell><p className="body-copy text-black/60">This is an operator screen.</p></Shell>;
  }

  const inTab = (r: HubRow) =>
    tab === 'refunds' || tab === 'holding' ? false : TAB_STATES[tab].includes(r.lifecycle_state);
  const visible = rows.filter(inTab);

  const TABS: Array<{ key: Tab; label: string; count: number; alert: boolean }> = [
    { key: 'inbound', label: 'Coming in', count: rows.filter((r) => TAB_STATES.inbound.includes(r.lifecycle_state)).length,
      alert: rows.some((r) => r.ship_by_overdue && TAB_STATES.inbound.includes(r.lifecycle_state)) },
    { key: 'bench', label: 'On the bench', count: rows.filter((r) => TAB_STATES.bench.includes(r.lifecycle_state)).length, alert: false },
    { key: 'outbound', label: 'Going out', count: rows.filter((r) => TAB_STATES.outbound.includes(r.lifecycle_state)).length, alert: false },
    { key: 'refunds', label: 'Refunds due', count: refunds.length, alert: refunds.length > 0 },
    { key: 'holding', label: 'Holding', count: abandoned.length, alert: false },
  ];

  return (
    <Shell>
      <div className="flex flex-col gap-3 mb-12">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">Operations</span>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-none">Hub</h1>
      </div>

      <nav className="flex flex-wrap gap-2 mb-12">
        {TABS.map((t) => (
          <button
            key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors',
              tab === t.key ? 'border-black bg-black text-white' : 'border-black/10 hover:border-black',
            )}
          >
            {t.label}
            <span className={cn('tabular-nums', t.alert && tab !== t.key && 'text-red-600')}>{t.count}</span>
          </button>
        ))}
      </nav>

      {error && <p className="mb-8 text-xs font-bold uppercase tracking-widest text-red-700">{error}</p>}

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-black/20" /></div>
      ) : tab === 'refunds' ? (
        <RefundQueue rows={refunds} onDone={load} />
      ) : tab === 'holding' ? (
        <HoldingQueue rows={abandoned} onDone={load} />
      ) : visible.length === 0 ? (
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">Nothing here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((r) => <ItemCard key={r.listing_id} row={r} onDone={load} />)}
        </ul>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-20">{children}</div>
  );
}

// One item, with only the actions its current state allows.
function ItemCard({ row, onDone }: { key?: string; row: HubRow; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState<'CONDITION_MISMATCH' | 'AUTHENTICITY_CONCERN'>('CONDITION_MISMATCH');

  const run = async (fn: () => PromiseLike<{ error: unknown }>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await fn();
      if (error) throw error;
      onDone();
    } catch (e: any) { setErr(e?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  };

  const s = row.lifecycle_state;

  return (
    <li className="border border-black/10">
      <div className="flex gap-5 p-5">
        <img
          src={variantUrl(row.image_url, 'thumb')} alt=""
          className="h-24 w-[72px] shrink-0 object-cover bg-zinc-100"
        />
        <div className="flex flex-1 min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-black uppercase tracking-tight">{row.title}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
              {row.brand} · {row.sku ?? '—'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-black uppercase tracking-widest">
            <span>{s.replace(/_/g, ' ')}</span>
            <span className="text-black/40">Condition: {row.condition ?? '—'}</span>
            {row.offer_amount != null && (
              <span className="text-black/40">Payout {formatCurrency(Number(row.offer_amount))}</span>
            )}
            {row.awb && <span className="text-black/40">AWB {row.awb}</span>}
            {row.ship_by_overdue && (
              <span className="text-red-600">Past ship-by</span>
            )}
          </div>
          {row.has_flaws && row.flaws_description && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800 leading-relaxed">
              Declared flaw: {row.flaws_description}
            </p>
          )}
          {row.hub_notes && (
            <p className="text-[11px] text-black/50 leading-relaxed">Hub note: {row.hub_notes}</p>
          )}

          {/* Actions, gated by where the item actually is. */}
          <div className="flex flex-wrap gap-2 pt-2">
            {TAB_STATES.inbound.includes(s) && (
              <Action icon={PackageCheck} label="Received" busy={busy}
                onClick={() => run(() => supabase.rpc('hub_receive_item', { p_listing_id: row.listing_id, p_notes: notes || null }))} />
            )}
            {s === 'RECEIVED_AT_HUB' && (
              <>
                <Action icon={PackageCheck} label="Accept into inventory" busy={busy}
                  onClick={() => run(
                    () => supabase.rpc('hub_accept_item', { p_listing_id: row.listing_id, p_notes: notes || null }),
                    `Accept "${row.title}"? This makes the payout of ${formatCurrency(Number(row.offer_amount ?? 0))} due.`,
                  )} />
                <Action icon={PackageX} label="Refuse" danger busy={busy} onClick={() => setRejecting((v) => !v)} />
              </>
            )}
            {s === 'ACCEPTED' && (
              <Action icon={IndianRupee}
                label={row.payout_status === 'sent' ? 'Mark payout sent' : `Pay ${formatCurrency(Number(row.payout_amount ?? row.offer_amount ?? 0))}`}
                busy={busy}
                onClick={() => run(
                  async () => {
                    if (row.payout_id) {
                      const { error } = await supabase.from('payouts')
                        .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.payout_id);
                      if (error) return { error };
                    }
                    return supabase.rpc('hub_advance', { p_listing_id: row.listing_id, p_to: 'PAYOUT_SENT' });
                  },
                  'Confirm you have sent the vendor their payout.',
                )} />
            )}
            {s === 'PAYOUT_SENT' && (
              <Action icon={PackageCheck} label="Repacked" busy={busy}
                onClick={() => run(() => supabase.rpc('hub_advance', { p_listing_id: row.listing_id, p_to: 'REPACKED' }))} />
            )}
            {s === 'REPACKED' && (
              <Action icon={Truck} label="Shipped to buyer" busy={busy}
                onClick={() => run(() => supabase.rpc('hub_advance', { p_listing_id: row.listing_id, p_to: 'SHIPPED_OUTBOUND' }))} />
            )}
            {s === 'SHIPPED_OUTBOUND' && (
              <Action icon={PackageCheck} label="Delivered" busy={busy}
                onClick={() => run(() => supabase.rpc('hub_advance', { p_listing_id: row.listing_id, p_to: 'DELIVERED' }))} />
            )}
            <Link
              to={`/product/${row.listing_id}`}
              className="border border-black/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:border-black transition-colors"
            >
              Listing
            </Link>
          </div>

          {(s === 'RECEIVED_AT_HUB' || TAB_STATES.inbound.includes(s)) && (
            <input
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Hub note (what you saw)"
              className="mt-1 border border-black/10 px-3 py-2 text-xs font-medium focus:border-black focus:outline-none"
            />
          )}

          {rejecting && (
            <RejectPanel
              row={row} reason={reason} setReason={setReason} busy={busy}
              onCancel={() => setRejecting(false)} onDone={onDone}
            />
          )}

          {err && <p className="text-[11px] font-bold uppercase tracking-widest text-red-700">{err}</p>}
        </div>
      </div>
    </li>
  );
}

// Refusing an item is the one action with consequences in three directions:
// the buyer is refunded, the vendor loses trust and gets 60 days to claim the
// item back. It goes through the shared failure path so all three happen.
function RejectPanel({ row, reason, setReason, busy, onCancel, onDone }: {
  row: HubRow;
  reason: 'CONDITION_MISMATCH' | 'AUTHENTICITY_CONCERN';
  setReason: (r: 'CONDITION_MISMATCH' | 'AUTHENTICITY_CONCERN') => void;
  busy: boolean; onCancel: () => void; onDone: () => void;
}) {
  const [detail, setDetail] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const reject = async () => {
    if (!detail.trim()) { setErr('Say what was wrong. It is the record.'); return; }
    if (!confirm(`Refuse "${row.title}"? The buyer is refunded and the vendor has 60 days to claim it back.`)) return;
    setWorking(true); setErr(null);
    try {
      const { error } = await supabase.rpc('hub_reject_item', {
        p_listing_id: row.listing_id, p_reason: reason, p_detail: detail.trim(),
      });
      if (error) throw error;
      onDone();
    } catch (e: any) { setErr(e?.message ?? 'That did not work.'); }
    finally { setWorking(false); }
  };

  return (
    <div className="mt-2 flex flex-col gap-3 border border-red-200 bg-red-50/50 p-4">
      <div className="flex gap-2">
        {(['CONDITION_MISMATCH', 'AUTHENTICITY_CONCERN'] as const).map((r) => (
          <button
            key={r} type="button" onClick={() => setReason(r)}
            className={cn(
              'border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors',
              reason === r ? 'border-black bg-black text-white' : 'border-black/15 hover:border-black',
            )}
          >
            {r === 'CONDITION_MISMATCH' ? 'Condition' : 'Authenticity'}
          </button>
        ))}
      </div>
      <textarea
        value={detail} onChange={(e) => setDetail(e.target.value)} rows={2}
        placeholder="What did not match?"
        className="border border-black/15 px-3 py-2 text-xs font-medium leading-relaxed focus:border-black focus:outline-none"
      />
      <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
        The buyer is told only that the item is no longer available and refunded in full.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={reject} disabled={busy || working}
          className="bg-black px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
          {working ? 'Refusing…' : 'Refuse and refund'}
        </button>
        <button type="button" onClick={onCancel} disabled={working}
          className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black">
          Cancel
        </button>
      </div>
      {err && <p className="text-[11px] font-bold uppercase tracking-widest text-red-700">{err}</p>}
    </div>
  );
}

// A buyer who paid and got nothing is the worst state this system has, so the
// queue is loud and ordered by how long they have been waiting.
function RefundQueue({ rows, onDone }: { rows: RefundRow[]; onDone: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">No refunds outstanding.</p>;
  }

  const refund = async (r: RefundRow) => {
    if (!confirm(`Refund ${formatCurrency(Number(r.total_amount))} on ${r.order_number}?`)) return;
    setBusy(r.failure_id); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('razorpay-refund', {
        body: { order_id: r.order_id, reason: `Fulfillment failure: ${r.reason}`, relist: false },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string } | null;
      if (res && res.ok === false) throw new Error(res.error ?? 'Refund failed');
      await supabase.rpc('mark_refund_done', { p_failure_id: r.failure_id, p_ok: true });
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Refund failed.');
      await supabase.rpc('mark_refund_done', { p_failure_id: r.failure_id, p_ok: false });
      onDone();
    } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      {err && <p className="text-xs font-bold uppercase tracking-widest text-red-700">{err}</p>}
      {rows.map((r) => (
        <div key={r.failure_id} className={cn(
          'flex flex-wrap items-center justify-between gap-4 border p-5',
          r.hours_pending > 24 ? 'border-red-300 bg-red-50/50' : 'border-black/10',
        )}>
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-sm font-black uppercase tracking-tight">{r.order_number}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
              {r.reason.replace(/_/g, ' ')} · waiting {r.hours_pending}h
              {!r.razorpay_payment_id && ' · no captured payment'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-black tabular-nums">{formatCurrency(Number(r.total_amount))}</span>
            <button type="button" onClick={() => refund(r)} disabled={busy === r.failure_id}
              className="bg-black px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
              {busy === r.failure_id ? 'Refunding…' : 'Refund buyer'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Items we refused whose 60 days have run out. Donating or disposing before
// that window closes is refused by the database, not just discouraged here.
function HoldingQueue({ rows, onDone }: { rows: AbandonedRow[]; onDone: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-[11px] font-bold uppercase tracking-widest text-black/30">
        Nothing past its 60-day window.
      </p>
    );
  }

  const closeOut = async (r: AbandonedRow, method: 'returned' | 'donated' | 'disposed') => {
    if (!confirm(`Close out "${r.title}" as ${method}?`)) return;
    setBusy(r.failure_id); setErr(null);
    try {
      const { error } = await supabase.rpc('close_out_rejected_item', {
        p_failure_id: r.failure_id, p_method: method,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) { setErr(e?.message ?? 'That did not work.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      {err && <p className="text-xs font-bold uppercase tracking-widest text-red-700">{err}</p>}
      {rows.map((r) => (
        <div key={r.failure_id} className="flex flex-wrap items-center justify-between gap-4 border border-black/10 p-5">
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-sm font-black uppercase tracking-tight">{r.title}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">
              {r.reason.replace(/_/g, ' ')} · window closed {new Date(r.abandonment_deadline).toLocaleDateString()}
              {r.return_requested && ' · return requested'}
            </span>
          </div>
          <div className="flex gap-2">
            {(['returned', 'donated', 'disposed'] as const).map((m) => (
              <button key={m} type="button" onClick={() => closeOut(r, m)} disabled={busy === r.failure_id}
                className="border border-black/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:border-black disabled:opacity-50">
                {m}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Action({ icon: Icon, label, onClick, busy, danger }: {
  icon: typeof PackageCheck; label: string; onClick: () => void; busy: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={busy}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50',
        danger ? 'border border-red-300 text-red-700 hover:bg-red-50' : 'bg-black text-white hover:bg-zinc-800',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
