// Left-nav for the "about zarketplace" cluster of pages (About, Buyer
// Protection, Conditions Guide, FAQ, Contact) - a shared wayfinding sidebar
// so someone reading one lands on the others, instead of each page being an
// island only reachable from the footer.
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const ITEMS = [
  { label: 'What Is zarketplace', to: '/about' },
  { label: 'Buyer Protection', to: '/buyer-protection' },
  { label: 'Conditions Guide', to: '/conditions-guide' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' },
];

export function InfoPageNav() {
  const { pathname } = useLocation();

  return (
    <>
      {/* Desktop: persistent left column */}
      <nav className="hidden lg:flex flex-col gap-1 w-56 shrink-0">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-black/30 mb-3">About zarketplace</span>
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'text-xs font-bold uppercase tracking-widest py-2.5 border-l-2 pl-4 transition-colors',
              pathname === item.to ? 'border-black text-black' : 'border-black/5 text-black/50 hover:text-black hover:border-black/30',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: horizontal scroll pills */}
      <nav className="lg:hidden flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'shrink-0 border px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors',
              pathname === item.to ? 'bg-black text-white border-black' : 'bg-white text-black border-black/10',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
