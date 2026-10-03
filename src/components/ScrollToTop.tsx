import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Where each visited page was left, by history entry, so Back lands where you
// were (the shop's grid, several pages down) instead of at the top.
const positions = new Map<string, number>();

// Top of the page on every new route, or the section a link names
// (/terms#promo-codes). Back and Forward restore the old position. Pages load
// lazily, so the target may not exist straight away: keep trying for up to a
// second before settling.
export function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  // A filter change on the same page (a new query string) is not a new page:
  // it must not jump to the top.
  const lastPage = useRef<string | null>(null);

  // The outgoing entry's position, read while rendering the new location:
  // the old page is still on screen then, so this is where it was left.
  // Reading it later (on scroll, or in an effect) races the browser clamping
  // the scroll as the old page is swapped for a shorter one.
  const shownKey = useRef(key);
  if (shownKey.current !== key) {
    positions.set(shownKey.current, window.scrollY);
    shownKey.current = key;
  }

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const page = pathname + hash;
    const samePage = lastPage.current === page;
    lastPage.current = page;
    const saved = navType === 'POP' ? positions.get(key) : undefined;
    if (saved !== undefined) {
      const restore = () => {
        const reachable = document.documentElement.scrollHeight - window.innerHeight >= saved;
        if (reachable || ++tries > 60) { window.scrollTo(0, saved); return; }
        timer = window.setTimeout(restore, 16);
      };
      restore();
      return () => clearTimeout(timer);
    }
    if (samePage) return;
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const find = () => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView(); return; }
      if (++tries > 60) { window.scrollTo(0, 0); return; }
      timer = window.setTimeout(find, 16);
    };
    find();
    return () => clearTimeout(timer);
  }, [pathname, hash, key, navType]);

  return null;
}
