// UPI VPA dual-input. Two fields, the second blocks paste/drop/context-menu so
// the seller has to type their VPA twice. Surfaces inline validation +
// match status to the parent. Once both fields are valid + match, parent
// receives the normalized VPA string via onChange.

import * as React from 'react';
import { Check, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

const VPA_REGEX = /^[A-Za-z0-9._\-]{2,256}@[A-Za-z]{2,64}$/;

interface Props {
  value: string;
  onChange: (vpa: string, valid: boolean) => void;
  disabled?: boolean;
}

export function UpiVpaInput({ value, onChange, disabled }: Props) {
  const [first, setFirst] = React.useState(value);
  const [confirm, setConfirm] = React.useState(value && first === value ? value : '');
  const [touched, setTouched] = React.useState(false);

  const firstValid = VPA_REGEX.test(first);
  const matches = first.toLowerCase() === confirm.toLowerCase();
  const valid = firstValid && matches && !!first;

  React.useEffect(() => {
    onChange(valid ? first : '', valid);
  }, [first, valid, onChange]);

  const blockPaste = (e: React.ClipboardEvent | React.DragEvent | React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-black uppercase tracking-widest">UPI ID (VPA)</label>
        <input
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value.trim())}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          placeholder="yourname@upi"
          autoComplete="off"
          spellCheck={false}
          className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all tracking-wider"
        />
        {touched && first && !firstValid && (
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Enter a valid VPA like name@upi.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-black uppercase tracking-widest">
          Confirm UPI ID - type it again (paste disabled)
        </label>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.trim())}
          onPaste={blockPaste}
          onDrop={blockPaste}
          onContextMenu={blockPaste}
          disabled={disabled}
          placeholder="re-type your UPI ID"
          autoComplete="off"
          spellCheck={false}
          className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all tracking-wider"
        />
        {confirm && (
          <p className={cn('text-[11px] font-bold uppercase tracking-widest flex items-center gap-1', matches ? 'text-emerald-600' : 'text-red-600')}>
            {matches ? <><Check className="h-3 w-3" /> Matches</> : <><AlertTriangle className="h-3 w-3" /> UPI IDs do not match</>}
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 bg-zinc-50 border border-black/5 p-4">
        <Info className="h-3.5 w-3.5 text-black/30 mt-0.5 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-widest leading-relaxed text-black/60">
          UPI ID and Instagram are locked to this listing once submitted.<br />Make sure they're correct - we can't change them later.
        </p>
      </div>
    </div>
  );
}

export { VPA_REGEX };
