// What a buyer is told about their own state.
//
// Two messages, and the difference matters more than the wording. A covered
// state gets a plain confirmation. An uncovered one gets told there is no
// seller there YET - not that we refuse to ship, which is what an empty grid
// silently implies and what makes a young marketplace look dead instead of
// early.
//
// Deliberately short. The rule is unusual enough that a paragraph reads as an
// excuse; one line reads as a fact, and people forgive facts.

import * as React from 'react';
import { MapPin } from 'lucide-react';
import { useCoveredStates } from '../lib/coverage';
import { cn } from '../lib/utils';

export function CoverageNote({ state, className }: { state: string | null; className?: string }) {
  const covered = useCoveredStates();

  // Unknown coverage says nothing. Guessing "no sellers here" about a state we
  // simply failed to look up would be a lie told to a real buyer.
  if (!state || covered === null) return null;

  const hasSellers = covered.has(state);

  return (
    <p className={cn(
      'flex items-start gap-1.5 text-[9px] font-bold uppercase tracking-widest leading-relaxed',
      hasSellers ? 'text-black/40' : 'text-amber-800',
      className,
    )}>
      <MapPin className="h-3 w-3 shrink-0 mt-[1px]" />
      {hasSellers
        ? <span>Sellers in {state} can ship to you. Others are marked.</span>
        : <span>No sellers in {state} yet. We are signing them up now.</span>}
    </p>
  );
}
