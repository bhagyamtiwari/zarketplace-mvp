import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { AuthModal } from './AuthModal';
import { Wordmark } from './Wordmark';
import { SOCIALS } from './Footer';
import { useFavorites } from '../lib/favorites';

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
  const [isAccountOpen, setIsAccountOpen] = React.useState(false);
  const [showAuth, setShowAuth] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, emailVerified, resendVerification, signOut } = useAuth();
  const [verifyNotice, setVerifyNotice] = React.useState<string | null>(null);
  const { count: cartCount } = useCart();

  const closeMenu = () => setIsMenuOpen(false);

  // Lock background scroll while the mobile drawer is open.
  React.useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMenuOpen]);

  // Close the account menu on navigation.
  React.useEffect(() => { setIsAccountOpen(false); }, [location.pathname]);

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
                <div
                  className="relative"
                  onMouseEnter={() => setIsAccountOpen(true)}
                  onMouseLeave={() => setIsAccountOpen(false)}
                >
                  <button
                    type="button"
                    aria-expanded={isAccountOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsAccountOpen((v) => !v)}
                    className={cn(NAV, 'py-7 hover:underline underline-offset-[6px] decoration-2')}
                  >
                    Account
                  </button>
                  {isAccountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full w-64 border border-black bg-white p-5 flex flex-col gap-3 text-sm"
                    >
                      <div className="flex flex-col gap-1 border-b border-black/10 pb-4">
                        <span className="truncate font-bold">{profile?.email ?? user.email}</span>
                        {!emailVerified && (
                          <span>
                            Email not verified.{' '}
                            <button
                              type="button"
                              onClick={async () => {
                                setVerifyNotice(null);
                                const { error } = await resendVerification();
                                setVerifyNotice(error ? error : 'Verification email sent.');
                              }}
                              className="underline underline-offset-4"
                            >
                              Resend link
                            </button>
                          </span>
                        )}
                        {verifyNotice && <span>{verifyNotice}</span>}
                      </div>
                      <MenuLink to="/track-order">My orders</MenuLink>
                      <MenuLink to="/vendor-portal">Your items</MenuLink>
                      <MenuLink to="/account">My profile</MenuLink>
                      {profile?.is_admin && <MenuLink to="/admin">Admin</MenuLink>}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={async () => { await signOut(); setIsAccountOpen(false); navigate('/'); }}
                        className="border-t border-black/10 pt-3 text-left hover:underline underline-offset-4"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
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
      {createPortal(
      <AnimatePresence>
        {isMenuOpen && [
          <motion.div
            key="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            // Runs past the bottom of the screen: on iOS Safari the floating
            // toolbar sits over the page, and a scrim that stopped at
            // bottom: 0 left a strip of undimmed page underneath it.
            className="md:hidden fixed inset-x-0 top-0 -bottom-[30vh] z-[65] bg-black/40"
          />,
          <motion.div
            key="drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden fixed inset-y-0 right-0 z-[70] w-full max-w-xs bg-white border-l border-black/10 flex flex-col"
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
                      <SubLink to="/track-order" onClick={closeMenu}>My orders</SubLink>
                      <SubLink to="/vendor-portal" onClick={closeMenu}>Your items</SubLink>
                      <SubLink to="/account" onClick={closeMenu}>My profile</SubLink>
                      {profile?.is_admin && <SubLink to="/admin" onClick={closeMenu}>Admin</SubLink>}
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
            </motion.div>,
        ]}
      </AnimatePresence>,
      document.body,
      )}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
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

function MenuLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} role="menuitem" className="hover:underline underline-offset-4">
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
