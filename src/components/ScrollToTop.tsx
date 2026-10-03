import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Where each visited page was scrolled to, by history entry, so Back lands
// where you left it (the shop's grid, several pages down) instead of the top.
const positions = new Map<string, number>();

// Top of the page on every new route, or the section a link names
// (/terms#promo-codes). Back and Forward restore the old position. Pages load
// lazily, so the target may not exist on the first frame: keep trying for up
// to a second before settling.
export function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  // A filter change on the same page (a new query string) is not a new page:
  // it must not jump to the top.
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  // Record the position of the entry being looked at.
  useEffect(() => {
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.set(key, window.scrollY));
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.removeEventListener('scroll', save); cancelAnimationFrame(frame); };
  }, [key]);

  useEffect(() => {
    let tries = 0;
    let frame = 0;
    const page = pathname + hash;
    const samePage = lastPage.current === page;
    lastPage.current = page;
    const saved = navType === 'POP' ? positions.get(key) : undefined;
    if (saved !== undefined) {
      const restore = () => {
        const reachable = document.documentElement.scrollHeight - window.innerHeight >= saved;
        if (reachable || ++tries > 60) { window.scrollTo(0, saved); return; }
        frame = requestAnimationFrame(restore);
      };
      restore();
      return () => cancelAnimationFrame(frame);
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
      frame = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key, navType]);

  return null;
}
