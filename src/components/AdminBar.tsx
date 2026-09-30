// The one bar across the top of the admin host, in place of the shop's header.
// Black, and it says Admin, so there is never a moment of wondering which site
// this tab is. The shop is reachable from it as a preview: an operator can see
// every page a buyer or a vendor sees, but an admin account cannot buy or send
// an item (the database refuses both), so the preview can never become a sale.
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useFirstName } from '../lib/auth';
import { cn } from '../lib/utils';

const LINK = 'text-[11px] font-black uppercase tracking-[0.2em] transition-colors';

export function AdminBar() {
  const { user, signOut } = useAuth();
  const firstName = useFirstName();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inConsole = pathname.startsWith('/admin');
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(LINK, isActive ? 'text-white underline underline-offset-[6px] decoration-2' : 'text-white/70 hover:text-white');

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-6 border-b border-white/15 bg-black px-4 text-white sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/admin/today" className="flex items-center gap-2.5">
            <span className="text-lg font-black tracking-tighter">zarketplace</span>
            <span className="rounded-sm bg-amber-400 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-black">Admin</span>
          </Link>
          <nav className="hidden items-center gap-5 sm:flex" aria-label="Admin">
            <NavLink to="/admin/today" className={() => tab({ isActive: inConsole })}>Console</NavLink>
            <NavLink to="/browse" className={tab}>Shop</NavLink>
            <NavLink to="/sell" className={tab}>Sell form</NavLink>
          </nav>
        </div>
        {user && (
          <div className="flex min-w-0 items-center gap-4">
            <span className="hidden truncate text-xs text-white/70 md:inline">{firstName ? `Hi ${firstName}` : user.email}</span>
            <button type="button" onClick={async () => { await signOut(); navigate('/admin/today'); }} className={cn(LINK, 'text-white/70 hover:text-white')}>
              Sign out
            </button>
          </div>
        )}
      </header>
      {/* Out of the console, a standing reminder of what this is. */}
      {!inConsole && (
        <div className="fixed inset-x-0 top-16 z-40 bg-amber-400 px-4 py-1.5 text-center text-xs font-bold text-black">
          Preview of the shop. Admin accounts cannot buy or send items.{' '}
          <Link to="/admin/today" className="underline underline-offset-2">Back to the console</Link>
        </div>
      )}
    </>
  );
}
