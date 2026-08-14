// "Deliver to <state>" control. Sits at the top of the browse filter rail on
// desktop and inside the filter sheet on a phone.
//
// It is the standing answer to the question StatePrompt asks once, so a buyer
// who skipped the prompt, or who is shopping from somewhere else today, has an
// obvious place to set it without hunting through account settings.

import * as React from 'react';
import { MapPin } from 'lucide-react';
import { StateSelect } from './StateSelect';
import { useBuyerState } from '../lib/buyerState';
import { CoverageNote } from './CoverageNote';

export function DeliverToPicker({ compact = false }: { compact?: boolean }) {
  const [buyerState, setBuyerState] = useBuyerState();

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-2 border-b border-black/10 pb-4 mb-2'}>
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-black/40">
        <MapPin className="h-3.5 w-3.5" /> Deliver to
      </span>
      <StateSelect
        value={buyerState ?? ''}
        onChange={setBuyerState}
        placeholder="All of India"
        aria-label="Your state"
        serviceableOnly
        className="w-full border border-black/15 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-widest focus:border-black focus:outline-none"
      />
      <CoverageNote state={buyerState} />
    </div>
  );
}
