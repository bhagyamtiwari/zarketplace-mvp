// The buyer's state, remembered on the device.
//
// Deliberately not on the account. Choosing a state has to happen on the first
// visit, before anyone signs up, or the feed cannot explain itself to the
// person most likely to bounce. localStorage also means a returning visitor is
// never asked twice.
//
// Why this exists at all: we collect, check and ship every item ourselves, and
// that operation does not reach every state yet, so an order currently only
// works when the buyer is in the same state as the item's pickup address. The
// buyer has to understand that before they fall in love with something they
// cannot buy today.

import * as React from 'react';
import { normalizeState, type IndianState } from './states';

const KEY = 'zk_buyer_state';
// Separate from the value: someone who explicitly closed the prompt without
// choosing has answered "not now", and must not be asked on every page.
const ASKED_KEY = 'zk_buyer_state_asked';

const listeners = new Set<() => void>();

function read(): IndianState | null {
  try {
    return normalizeState(localStorage.getItem(KEY));
  } catch {
    // Safari in private mode throws on localStorage access rather than
    // returning null. A buyer with no storage still gets a working feed.
    return null;
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function setBuyerState(state: IndianState | null) {
  try {
    if (state) localStorage.setItem(KEY, state);
    else localStorage.removeItem(KEY);
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Ignore: the in-memory notify below still updates this session.
  }
  emit();
}

export function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* see above */
  }
  emit();
}

export function hasBeenAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * The buyer's chosen state, or null if they have not chosen one. Shared across
 * every component through one subscription, so changing it in the sidebar
 * updates the prompt, the cards and the product page together.
 */
export function useBuyerState(): [IndianState | null, (s: IndianState | null) => void] {
  const [state, setState] = React.useState<IndianState | null>(read);

  React.useEffect(() => {
    const onChange = () => setState(read());
    listeners.add(onChange);
    // Another tab choosing a state should not leave this one disagreeing.
    window.addEventListener('storage', onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return [state, setBuyerState];
}
