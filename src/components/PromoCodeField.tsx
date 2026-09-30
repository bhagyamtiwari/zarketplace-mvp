// The promo code box: one line, the box and Apply. Used in the cart and in
// the checkout order summary, above the totals it changes. Always open: a code
// is something we hand to a particular person, and they should not have to
// hunt for where it goes.
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { ui } from '../lib/ui';
import { cn } from '../lib/utils';

export function PromoCodeField({ applied, appliedNote = 'applied', onApply, onRemove, locked = false, notice = null, divider = true }: {
  /** The code in use, or null. */
  applied: string | null;
  /** What follows the code once it is in: "applied", or "applied at checkout". */
  appliedNote?: string;
  /** Resolves to a reason when the code cannot be used, or null when it is in. */
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
  locked?: boolean;
  /** A reason a code carried over from earlier could not be used. */
  notice?: string | null;
  /** A rule above it. Off where the list above already ends in one. */
  divider?: boolean;
}) {
  const edge = divider ? 'border-t border-black/10 pt-5' : '';
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const id = React.useId();

  if (applied) {
    return (
      <div className={cn('flex items-center justify-between gap-4 text-sm', edge)}>
        <span>Promo code <span className="font-bold">{applied}</span> {appliedNote}</span>
        <button type="button" onClick={onRemove} disabled={locked} className={cn(ui.link, 'shrink-0 disabled:opacity-40')}>Remove</button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    const problem = await onApply(value);
    setBusy(false);
    if (problem) setMessage(problem);
    else setValue('');
  };

  const shown = message ?? notice;
  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-2', edge)}>
      <div className="flex items-stretch gap-3">
        <input
          id={id} value={value} aria-label="Promo code" placeholder="Promo code"
          onChange={(e) => { setValue(e.target.value.toUpperCase().replace(/\s+/g, '')); setMessage(null); }}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32}
          className="min-w-0 flex-1 border border-black/20 px-3 py-2.5 text-sm uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal placeholder:text-black/40 focus:border-black focus:outline-none"
        />
        <button
          type="submit" disabled={busy || !value.trim() || locked}
          className="inline-flex shrink-0 items-center gap-2 border border-black px-5 text-[11px] font-black uppercase tracking-[0.2em] transition-colors hover:bg-black hover:text-white disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Apply
        </button>
      </div>
      {shown && <p role="alert" className={ui.error}>{shown}</p>}
    </form>
  );
}
