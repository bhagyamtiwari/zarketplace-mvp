// The one state picker. Every place that asks for a state - the listing form,
// the payout address, the buyer's first-visit prompt, the browse rail - renders
// this, so the options, their order and their labels cannot drift apart.
//
// Two groups: the handful of places most of our people are, then all 36 states
// and union territories alphabetically. The full list is always present and
// complete; the top group only changes what you see first.

import * as React from 'react';
import { COMMON_STATES, OTHER_STATES, type IndianState } from '../lib/states';

interface Props {
  value: string;
  onChange: (value: IndianState | null) => void;
  onBlur?: () => void;
  /** Label for the empty option, e.g. "Select your state" or "All of India". */
  placeholder: string;
  className?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
}

export function StateSelect({
  value, onChange, onBlur, placeholder, className, autoFocus, ...rest
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange((e.target.value || null) as IndianState | null)}
      onBlur={onBlur}
      autoFocus={autoFocus}
      aria-label={rest['aria-label']}
      className={className}
    >
      <option value="">{placeholder}</option>

      <optgroup label="Where our buyers are">
        {COMMON_STATES.map(({ state, label }) => (
          <option key={state} value={state}>{label}</option>
        ))}
      </optgroup>

      <optgroup label="All states &amp; union territories">
        {OTHER_STATES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </optgroup>
    </select>
  );
}
