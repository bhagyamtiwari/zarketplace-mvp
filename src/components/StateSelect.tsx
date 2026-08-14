// The one state picker. Every place that asks for a state - the listing form,
// the payout address, the buyer's first-visit prompt, the browse rail - renders
// this, so the options, their order and their labels cannot drift apart.
//
// Two groups: the handful of places most of our people are, then all 36 states
// and union territories alphabetically. The full list is always present and
// complete; the top group only changes what you see first.

import * as React from 'react';
import { COMMON_STATES, OTHER_STATES, SERVICEABLE_STATES, isServiceable, INDIAN_STATES, type IndianState } from '../lib/states';

interface Props {
  value: string;
  onChange: (value: IndianState | null) => void;
  onBlur?: () => void;
  /** Label for the empty option, e.g. "Select your state" or "All of India". */
  placeholder: string;
  className?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
  /**
   * Restrict to states zarketplace currently serves, greying out the rest.
   *
   * True for BUYERS: picking a state we have no sellers in leads to an empty
   * grid and a checkout that refuses, so the dead end is better shown than
   * walked into.
   *
   * False for SELLERS, which is the default. A seller anywhere should be able
   * to list - their stock is how a state becomes servable in the first place,
   * and refusing them is refusing the supply that unlocks their city. Their
   * listing simply waits for buyers there.
   */
  serviceableOnly?: boolean;
}

export function StateSelect({
  value, onChange, onBlur, placeholder, className, autoFocus, serviceableOnly = false, ...rest
}: Props) {
  // Sellers get the plain list: every state selectable, cities first.
  if (!serviceableOnly) {
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
        <optgroup label="Where our sellers are">
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

      {/* Live states first and selectable. Everywhere else is shown but
          disabled: a greyed "coming soon" says we are not there yet, whereas
          a missing option just looks like a broken list. */}
      <optgroup label="Available now">
        {SERVICEABLE_STATES.map((state) => (
          <option key={state} value={state}>
            {COMMON_STATES.find((c) => c.state === state)?.label ?? state}
          </option>
        ))}
      </optgroup>

      <optgroup label="Coming soon">
        {COMMON_STATES.filter(({ state }) => !isServiceable(state)).map(({ state, label }) => (
          <option key={state} value={state} disabled>{label}</option>
        ))}
        {INDIAN_STATES
          .filter((s) => !isServiceable(s) && !COMMON_STATES.some((c) => c.state === s))
          .map((s) => (
            <option key={s} value={s} disabled>{s}</option>
          ))}
      </optgroup>
    </select>
  );
}
