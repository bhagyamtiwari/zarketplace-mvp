import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Top of the page on every new route, or the section a link names
// (/terms#promo-codes). Pages load lazily, so the section may not exist on the
// first frame: look for it for up to a second before settling for the top.
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let frame = 0;
    const find = () => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView(); return; }
      if (++tries > 60) { window.scrollTo(0, 0); return; }
      frame = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}
