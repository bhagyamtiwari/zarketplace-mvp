// Errors visitors hit in their browser (src/lib/errorReport.ts), newest
// first. One row per failure per page per hour, with how many times it
// happened, so a broken checkout shows up as one loud row rather than a
// hundred quiet ones. Open a row for the stack and the browser.
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

interface ClientError {
  id: number;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  kind: string;
  message: string;
  path: string | null;
  stack: string | null;
  user_agent: string | null;
  release: string | null;
  user_id: string | null;
}

const LABEL = 'text-[11px] font-black uppercase tracking-widest';

const KIND: Record<string, string> = {
  error: 'Script error',
  promise: 'Script error',
  react: 'Page crashed',
  load: 'Could not load',
  slow: 'Slow load',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "iPhone, Safari" from a user agent, which is all an operator needs to know. */
function device(ua: string | null): string {
  if (!ua) return '';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '';
  const browser = /Instagram/.test(ua) ? 'Instagram' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(', ');
}

export function SiteErrors() {
  const [rows, setRows] = React.useState<ClientError[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    const { data, error: e } = await supabase
      .from('client_errors').select('*').order('last_seen_at', { ascending: false }).limit(200);
    if (e) setError(e.message);
    setRows((data as ClientError[]) ?? []);
    setLoading(false);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const clearAll = async () => {
    if (!confirm('Clear every logged error? New ones will still be recorded.')) return;
    const { error: e } = await supabase.from('client_errors').delete().gte('id', 0);
    if (e) { alert(e.message); return; }
    await load();
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  const lastDay = rows.filter((r) => Date.now() - new Date(r.last_seen_at).getTime() < 864e5);
  const hits = lastDay.reduce((n, r) => n + r.occurrences, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-8">
          <div><dt className={LABEL}>Last 24 hours</dt><dd className="text-2xl font-black">{hits}</dd></div>
          <div><dt className={LABEL}>Different errors</dt><dd className="text-2xl font-black">{lastDay.length}</dd></div>
        </dl>
        {rows.length > 0 && (
          <button type="button" onClick={clearAll}
            className="border border-black/20 px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:border-black">
            Clear all
          </button>
        )}
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm ink-mid">No errors logged. Anything a visitor hits in their browser shows up here.</p>
      ) : (
        <div className="overflow-x-auto border border-black/10">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.02]">
                {['Last seen', 'What', 'Page', 'Times', 'Device'].map((h) => (
                  <th key={h} className={cn('py-2.5 px-3', LABEL)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = openId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-black/5 align-top cursor-pointer hover:bg-black/[0.02]" onClick={() => setOpenId(open ? null : r.id)}>
                      <td className="py-3 px-3 text-[11px] ink-mid whitespace-nowrap">{when(r.last_seen_at)}</td>
                      <td className="py-3 px-3 text-[13px]">
                        <span className={cn('block text-[11px] font-black uppercase tracking-wider', r.kind === 'react' ? 'text-red-600' : 'ink-mid')}>
                          {KIND[r.kind] ?? r.kind}
                        </span>
                        <span className="block max-w-[420px] break-words">{r.message}</span>
                      </td>
                      <td className="py-3 px-3 text-[11px] font-mono whitespace-nowrap">{r.path ?? '-'}</td>
                      <td className="py-3 px-3 text-[13px] font-bold tabular-nums">{r.occurrences}</td>
                      <td className="py-3 px-3 text-[11px] whitespace-nowrap">{device(r.user_agent)}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-black/5 bg-black/[0.015]">
                        <td colSpan={5} className="px-3 py-4">
                          <dl className="mb-3 flex flex-wrap gap-x-8 gap-y-1 text-[11px]">
                            <div><dt className="inline ink-mid">First seen </dt><dd className="inline">{when(r.first_seen_at)}</dd></div>
                            <div><dt className="inline ink-mid">Signed in </dt><dd className="inline">{r.user_id ? 'yes' : 'no'}</dd></div>
                            <div><dt className="inline ink-mid">Build </dt><dd className="inline font-mono">{r.release || '-'}</dd></div>
                          </dl>
                          {r.user_agent && <p className="mb-3 text-[11px] ink-mid break-words">{r.user_agent}</p>}
                          {r.stack && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-black/[0.03] p-3 text-[11px] leading-relaxed">{r.stack}</pre>}
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
