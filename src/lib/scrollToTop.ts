// Jump back to the top when a view swaps out underneath the user.
//
// Multi-step flows (the sell form, checkout, the seller portal's tabs) replace
// the whole panel without navigating, so the router's ScrollToTop never fires.
// On a phone that leaves you parked where the button was, staring at the bottom
// of a screen whose content changed - or worse, at an error message that
// rendered above the fold you can't see.
//
// Deliberately not used for the feed's "browse all listings": that appends to a
// list you are already reading, and yanking you to the top would lose your
// place.

/**
 * Scroll the window to the top.
 *
 * Smooth by default, instant for anyone who has asked their OS to reduce
 * motion - a long smooth scroll from the bottom of a form is exactly the kind
 * of movement that setting exists to stop.
 */
export function scrollToTop(): void {
  if (typeof window === 'undefined') return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}
