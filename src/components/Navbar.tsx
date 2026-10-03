import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
// Loaded when first opened. It and the header were the only things putting the
// animation library into the first download every visitor makes.
const AuthModal = React.lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));
import { Wordmark } from './Wordmark';
import { SOCIALS } from './Footer';
import { useFavorites } from '../lib/favorites';
import { useOpenOffers } from '../lib/openOffers';

// The header answers two questions and offers one action.
//
//   Left:   where am I going. Shop, or Sell to us.
//   Right:  who am I (Sign in, or Account) and what have I picked (Cart),
//           then the one thing we most want a visitor to do: Get an offer.
//
// Everything is a word, not an icon, set in the micro-label: an icon row of
// search, bag and person is the default of every template, and each one had
// to be decoded. Search lives on the Shop page, next to the catalogue it
// searches. The cart appears once you are signed in or have put something in
// it: a cart needs no account, and sign-in is asked for at checkout.
const NAV = 'text-[11px] font-black uppercase tracking-[0.2em]';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [showAuth, setShowAuth] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const offerIds = useOpenOffers();
  const offers = offerIds.length;
  const { count: cartCount } = useCart();

  const closeMenu = () => setIsMenuOpen(false);

  // Fetch the sign-in modal once the page has settled, so opening it is
  // instant without it weighing on the first load.
  React.useEffect(() => {
    const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2500));
    idle(() => { void import('./AuthModal'); });
  }, []);

  // Lock background scroll while the mobile drawer is open.
  React.useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMenuOpen]);


  // The feed opens on a black hero. On a phone the bar sits directly on
  // top of it, so it goes black and merges into the banner rather than cutting a
  // white strip across it. Desktop keeps the white bar.
  const onFeed = location.pathname === '/' || location.pathname === '/browse';
  const onFavorites = onFeed && new URLSearchParams(location.search).get('q') === 'saved';
  const onShop = (onFeed && !onFavorites) || location.pathname.startsWith('/item/') || location.pathname.startsWith('/product/');
  const onSell = location.pathname === '/sell' || location.pathname === '/how-it-works';

  const cartLabel = cartCount > 0 ? `Cart (${cartCount})` : 'Cart';
  // Favorites are kept on this device, signed in or not, so the link shows
  // for anyone who has hearted something.
  const favorites = useFavorites();

  return (
    <nav
      className={cn(
        'fixed top-0 z-50 w-full border-b',
        onFeed ? 'border-white/10 bg-black md:border-black/10 md:bg-white' : 'border-black/10 bg-white',
      )}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-8 lg:gap-10">
            <Link to="/" aria-label="zarketplace home" className="flex min-h-[44px] items-center">
              {onFeed && <Wordmark on="dark" heightClassName="h-7" className="md:hidden" />}
              <Wordmark on="light" heightClassName="h-7 sm:h-8" className={cn(onFeed && 'hidden md:block')} />
            </Link>
            {/* "Sell to us" steps aside at tablet width, where a signed-in bar
                (Account, Cart) has no room for it and Get an offer already
                serves the seller. */}
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              <NavLink to="/browse" active={onShop}>Shop</NavLink>
              <NavLink to="/how-it-works" active={onSell} className="hidden lg:inline">Sell to us</NavLink>
            </div>
          </div>

          <div className="flex items-center gap-6 lg:gap-8">
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              {user ? (
                <AccountMenu offerIds={offerIds} email={user.email ?? null}
                  onSignOut={async () => { await signOut(); navigate('/'); }} />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAuth(true)}
                  className={cn(NAV, 'hover:underline underline-offset-[6px] decoration-2')}
                >
                  Sign in
                </button>
              )}

              {favorites.size > 0 && (
                <NavLink to="/browse?q=saved" active={onFavorites} className="hidden lg:inline">
                  Favorites ({favorites.size})
                </NavLink>
              )}

              {(user || cartCount > 0) && (
                <NavLink to="/cart" active={location.pathname === '/cart'}>{cartLabel}</NavLink>
              )}

              <Link
                to="/sell"
                className={cn(NAV, 'bg-black px-6 py-3.5 text-white transition-colors hover:bg-zinc-800')}
              >
                Get an offer
              </Link>
            </div>

            {/* A phone shows the cart only when there is something in it. */}
            {cartCount > 0 && (
              <Link to="/cart" className={cn(NAV, 'md:hidden', onFeed && 'text-white')}>
                {cartLabel}
              </Link>
            )}
            <button
              className={cn('md:hidden flex h-11 w-11 items-center justify-center -mr-2', onFeed && 'text-white')}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile side drawer - portaled to body so it's never affected by the
          nav's own stacking context. Drawer and its scrim sit above the
          consent bar (z-60): an open drawer with its own primary action hidden
          behind the cookie notice is unusable. */}
      {/* Always mounted and slid with CSS rather than an animation library:
          closed, it is off screen, invisible once the slide ends, and inert,
          so nothing inside it can be reached by keyboard or screen reader. */}
      {createPortal(
        <>
          <div
            aria-hidden
            onClick={() => setIsMenuOpen(false)}
            // Runs past the bottom of the screen: on iOS Safari the floating
            // toolbar sits over the page, and a scrim that stopped at
            // bottom: 0 left a strip of undimmed page underneath it.
            className={cn(
              'md:hidden fixed inset-x-0 top-0 -bottom-[30vh] z-[65] bg-black/40 transition-opacity duration-200',
              isMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
          <div
            inert={!isMenuOpen}
            aria-hidden={!isMenuOpen}
            className={cn(
              'md:hidden fixed inset-y-0 right-0 z-[70] w-full max-w-xs bg-white border-l border-black/10 flex flex-col',
              'transition-[transform,visibility] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
              isMenuOpen ? 'visible translate-x-0' : 'invisible translate-x-full',
            )}
          >
              {/* The panel's content ends where the screen does; its white
                  carries on beneath Safari's toolbar, for the same reason as
                  the scrim above. */}
              <div aria-hidden className="pointer-events-none absolute left-[-1px] right-0 top-full h-[30vh] border-l border-black/10 bg-white" />
              <div className="flex items-center justify-between h-20 px-6 border-b border-black/10 shrink-0">
                <Link to="/" className="flex min-h-[44px] items-center" onClick={() => setIsMenuOpen(false)}>
                  <Wordmark on="light" heightClassName="h-7" />
                </Link>
                <button className="flex h-11 w-11 items-center justify-center -mr-2" onClick={() => setIsMenuOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Two groups and nothing else. The policies all live in the
                  footer; repeating them here made the menu a second footer. */}
              <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-10">
                <nav className="flex flex-col gap-1" aria-label="Main">
                  <MainLink to="/browse" onClick={closeMenu}>Shop</MainLink>
                  <MainLink to="/sell" onClick={closeMenu}>Get an offer</MainLink>
                  <MainLink to="/how-it-works" onClick={closeMenu}>Sell to us</MainLink>
                  <MainLink to="/browse?q=saved" onClick={closeMenu}>{favorites.size > 0 ? `Favorites (${favorites.size})` : 'Favorites'}</MainLink>
                  {(user || cartCount > 0) && <MainLink to="/cart" onClick={closeMenu}>{cartLabel}</MainLink>}
                </nav>

                <div className="flex flex-col gap-1 border-t border-black/10 pt-6">
                  {user ? (
                    <>
                      {offers > 0 && (
                        <Link to={offerHref(offerIds)} onClick={closeMenu}
                          className="mb-3 flex items-center gap-3 bg-amber-100 px-4 py-3 text-[15px] font-bold">
                          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
                          {offerNotice(offers)}
                        </Link>
                      )}
                      {ACCOUNT_LINKS.map((l) => (
                        <React.Fragment key={l.to}>
                          <SubLink to={l.to} onClick={closeMenu}>{l.label}</SubLink>
                        </React.Fragment>
                      ))}
                      <SubLink to="/contact" onClick={closeMenu}>Contact us</SubLink>
                      <button
                        onClick={async () => { await signOut(); closeMenu(); navigate('/'); }}
                        className="self-start py-2.5 text-[15px]"
                      >
                        Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setShowAuth(true); closeMenu(); }}
                        className="self-start py-2.5 text-[15px] font-bold"
                      >
                        Sign in
                      </button>
                      <SubLink to="/contact" onClick={closeMenu}>Contact us</SubLink>
                    </>
                  )}
                </div>
              </div>

              <div className="px-6 py-5 border-t border-black/10 shrink-0 flex items-center gap-8">
                {SOCIALS.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-11 w-11 -m-3 items-center justify-center text-black hover:text-black/60 transition-colors"
                  >
                    {s.icon('h-[18px] w-[18px]')}
                  </a>
                ))}
              </div>
          </div>
        </>,
        document.body,
      )}
      {showAuth && (
        <React.Suspense fallback={null}>
          <AuthModal open onClose={() => setShowAuth(false)} />
        </React.Suspense>
      )}
    </nav>
  );
}

// A header link. The current section is underlined, so the header says where
// you are without a second colour.
function NavLink({ to, active, className, children }: { to: string; active?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        NAV,
        'underline-offset-[6px] decoration-2',
        active ? 'underline' : 'hover:underline',
        className,
      )}
    >
      {children}
    </Link>
  );
}

function MainLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link to={to} onClick={onClick} className="py-2 text-2xl font-black uppercase tracking-tighter hover:text-black/60 transition-colors">
      {children}
    </Link>
  );
}

function SubLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link to={to} onClick={onClick} className="self-start py-2.5 text-[15px] hover:text-black/60 transition-colors">
      {children}
    </Link>
  );
}

const ACCOUNT_LINKS = [
  { to: '/account/orders', label: 'Your orders' },
  { to: '/account/items', label: 'Your items' },
  { to: '/account/payouts', label: 'Your payouts' },
  { to: '/account/profile', label: 'Profile' },
];

function offerNotice(n: number): string {
  return n === 1 ? 'You have a new offer' : `You have ${n} new offers`;
}

/** One offer opens it directly; several open the list they sit in. */
function offerHref(ids: string[]): string {
  return ids.length === 1 ? `/offer/${ids[0]}` : '/account/items';
}

// Your account, as a menu: where each part of the account is, a new offer
// said in words at the top, and the way to sign out. Opens on click, and on
// hover for a mouse; closes on a click outside, on Escape and on navigating.
function AccountMenu({ offerIds, email, onSignOut }: { offerIds: string[]; email: string | null; onSignOut: () => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<number | undefined>(undefined);
  // When hover opened it. A mouse click lands right after the hover that
  // opened the menu, and must not then close it.
  const openedAt = React.useRef(0);
  const { pathname } = useLocation();
  const offers = offerIds.length;

  React.useEffect(() => { setOpen(false); }, [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const hoverOpen = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(closeTimer.current);
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <div ref={ref} className="relative" onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
      <button
        type="button"
        onClick={() => setOpen((o) => (o && Date.now() - openedAt.current < 600 ? true : !o))}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={offers > 0 ? `Your account, ${offerNotice(offers).toLowerCase()}` : 'Your account'}
        className={cn(NAV, 'relative flex items-center gap-1.5 py-7 hover:underline underline-offset-[6px] decoration-2')}
      >
        Your account
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        {offers > 0 && <span aria-hidden className="absolute -right-2.5 top-[1.45rem] h-2 w-2 rounded-full bg-amber-400" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 -mt-2 w-72 border border-black bg-white shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
          {offers > 0 && (
            <Link role="menuitem" to={offerHref(offerIds)}
              className="flex items-start gap-3 border-b border-black bg-amber-100 px-5 py-4 hover:bg-amber-200 transition-colors">
              <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 ring-4 ring-amber-400/30" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-black">{offerNotice(offers)}</span>
                <span className="text-xs">Accept it before it runs out.</span>
              </span>
            </Link>
          )}
          <div className="flex flex-col py-2">
            {ACCOUNT_LINKS.map((l) => (
              <Link key={l.to} role="menuitem" to={l.to}
                className={cn('flex items-center justify-between px-5 py-2.5 text-sm hover:bg-zinc-100', pathname === l.to && 'font-bold')}>
                {l.label}
                {l.to === '/account/items' && offers > 0 && (
                  <span className="min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[11px] font-black">{offers}</span>
                )}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-t border-black/10 px-5 py-3">
            {email && <span className="truncate text-xs">Signed in as {email}</span>}
            <button type="button" role="menuitem" onClick={onSignOut} className="self-start py-1 text-sm font-bold underline underline-offset-4">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
