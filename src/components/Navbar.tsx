import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, User, Menu, X, ArrowRight, LogOut, LayoutGrid, Package, ShoppingBag } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { AuthModal } from './AuthModal';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isBrowseOpen, setIsBrowseOpen] = React.useState(false);
  const [isAccountOpen, setIsAccountOpen] = React.useState(false);
  const [showAuth, setShowAuth] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, emailVerified, resendVerification, signOut } = useAuth();
  const [verifyNotice, setVerifyNotice] = React.useState<string | null>(null);
  const { count: cartCount } = useCart();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  const GENDERS = ['Men', 'Women', 'Unisex'];

  // Lock background scroll while the mobile drawer is open.
  React.useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMenuOpen]);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-black/5 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-12">
            <Link to="/" className="flex items-center gap-2 group">
              <img src="/images/zarketplace-tp.png" alt="zarketplace" className="h-6 w-auto group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
              <span className="lowercase font-black tracking-tighter text-xl">zarketplace</span>
            </Link>
            <div className="hidden md:block">
              <div className="flex items-baseline space-x-10">
                <div 
                  className="relative group"
                  onMouseEnter={() => setIsBrowseOpen(true)}
                  onMouseLeave={() => setIsBrowseOpen(false)}
                >
                  <Link
                    to="/browse"
                    className={cn(
                      "relative text-[10px] font-black uppercase tracking-[0.3em] transition-colors hover:text-black py-8",
                      location.pathname === '/browse' ? "text-black" : "text-black hover:text-black/80"
                    )}
                  >
                    Buy
                  </Link>
                  
                  {isBrowseOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute left-0 top-full w-48 bg-white border border-black/5 shadow-2xl p-4 flex flex-col gap-1"
                    >
                      {GENDERS.map((gender) => (
                        <Link
                          key={gender}
                          to={`/browse?gender=${gender}`}
                          className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-50 transition-colors"
                          onClick={() => setIsBrowseOpen(false)}
                        >
                          {gender}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </div>

                <Link
                  to="/sell"
                  className={cn(
                    "relative text-[10px] font-black uppercase tracking-[0.3em] transition-colors hover:text-black",
                    location.pathname === '/sell' ? "text-black" : "text-black hover:text-black/80"
                  )}
                >
                  Sell
                </Link>

              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-8 md:flex">
              <div className="relative flex items-center">
                <button 
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className="p-2 text-black hover:text-black/80 transition-colors"
                >
                  <Search className="h-4 w-4" />
                </button>
                {isSearchOpen && (
                  <motion.form 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onSubmit={handleSearch}
                    className="absolute right-full mr-4"
                  >
                    <input 
                      autoFocus
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      className="w-64 border-b border-black py-1 text-[10px] font-black uppercase tracking-widest focus:outline-none bg-transparent"
                    />
                  </motion.form>
                )}
              </div>
              {user ? (
                <Link
                  to="/cart"
                  className="relative p-2 text-black hover:text-black/80 transition-colors"
                  aria-label="Cart"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {cartCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-black text-white text-[9px] font-black flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </Link>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="relative p-2 text-black hover:text-black/80 transition-colors"
                  aria-label="Cart"
                >
                  <ShoppingBag className="h-4 w-4" />
                </button>
              )}
              <Link to="/sell" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all hover:scale-105 active:scale-95">
                List Item
              </Link>

              {user ? (
                <div
                  className="relative"
                  onMouseEnter={() => setIsAccountOpen(true)}
                  onMouseLeave={() => setIsAccountOpen(false)}
                >
                  <button className="p-2 text-black hover:text-black/80 transition-colors flex items-center gap-2">
                    <User className="h-4 w-4" />
                  </button>
                  {isAccountOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 top-full w-64 bg-white border border-black/5 shadow-2xl p-6 flex flex-col gap-4"
                    >
                      <div className="flex flex-col gap-2 pb-3 border-b border-black/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-black/40">Signed in as</p>
                        <p className="text-xs font-bold truncate">{profile?.email ?? user.email}</p>
                        {emailVerified ? (
                          <span className="self-start text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1">
                            Email Verified
                          </span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <span className="self-start text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1">
                              Email Unverified
                            </span>
                            <button
                              onClick={async () => {
                                setVerifyNotice(null);
                                const { error } = await resendVerification();
                                setVerifyNotice(error ? error : 'Verification email sent.');
                              }}
                              className="self-start text-[10px] font-black uppercase tracking-widest underline hover:text-black/60"
                            >
                              Resend verification
                            </button>
                            {verifyNotice && (
                              <p className="text-[9px] font-bold uppercase tracking-widest text-black/50">{verifyNotice}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <Link to="/track-order" onClick={() => setIsAccountOpen(false)} className="flex flex-col gap-0.5 hover:text-black/60">
                        <span className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                          <Package className="h-3.5 w-3.5" /> My Purchases
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-black/40 ml-6">Items you bought</span>
                      </Link>
                      <Link to="/seller-portal" onClick={() => setIsAccountOpen(false)} className="flex flex-col gap-0.5 hover:text-black/60">
                        <span className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                          <LayoutGrid className="h-3.5 w-3.5" /> Seller Portal
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-black/40 ml-6">Items you sold</span>
                      </Link>
                      <Link to="/account" onClick={() => setIsAccountOpen(false)} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest hover:text-black/60">
                        <User className="h-3.5 w-3.5" /> My Profile
                      </Link>
                      {profile?.is_admin && (
                        <Link to="/admin" onClick={() => setIsAccountOpen(false)} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest hover:text-black/60">
                          <User className="h-3.5 w-3.5" /> Admin
                        </Link>
                      )}
                      <button
                        onClick={async () => { await signOut(); setIsAccountOpen(false); navigate('/'); }}
                        className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-red-600 hover:text-red-700 pt-3 border-t border-black/5"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sign Out
                      </button>
                    </motion.div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="text-[10px] font-black uppercase tracking-[0.3em] text-black hover:text-black/80 transition-colors"
                >
                  Sign In
                </button>
              )}
            </div>
            
            <button 
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile side drawer - portaled to body so it's never affected by the
          nav's own backdrop-blur/stacking context (backdrop-filter on an
          ancestor can break position:fixed descendants in some browsers). */}
      {createPortal(
      <AnimatePresence>
        {isMenuOpen && [
          <motion.div
            key="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="md:hidden fixed inset-0 z-40 bg-black/40"
          />,
          <motion.div
            key="drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden fixed inset-y-0 right-0 z-50 w-full max-w-xs bg-white border-l border-black/5 flex flex-col"
          >
              <div className="flex items-center justify-between h-20 px-4 border-b border-black/5 shrink-0">
                <Link to="/" className="flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                  <img src="/images/zarketplace-tp.png" alt="zarketplace" className="h-6 w-auto" referrerPolicy="no-referrer" />
                  <span className="lowercase font-black tracking-tighter text-xl">zarketplace</span>
                </Link>
                <button className="p-2" onClick={() => setIsMenuOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-1">
                <DrawerSection title="Marketplace">
                  <DrawerLink to="/browse" onClick={() => setIsMenuOpen(false)}>Buy</DrawerLink>
                  <DrawerLink to="/sell" onClick={() => setIsMenuOpen(false)}>Sell</DrawerLink>
                  <DrawerLink to="/cart" onClick={() => setIsMenuOpen(false)} badge={cartCount > 0 ? cartCount : undefined}>Cart</DrawerLink>
                </DrawerSection>

                {user && (
                  <DrawerSection title="My Account">
                    <DrawerLink to="/track-order" onClick={() => setIsMenuOpen(false)}>My Orders</DrawerLink>
                    <DrawerLink to="/account" onClick={() => setIsMenuOpen(false)}>My Profile</DrawerLink>
                    <DrawerLink to="/seller-portal" onClick={() => setIsMenuOpen(false)}>Seller Portal</DrawerLink>
                    {profile?.is_admin && <DrawerLink to="/admin" onClick={() => setIsMenuOpen(false)}>Admin</DrawerLink>}
                  </DrawerSection>
                )}

                <DrawerSection title="Help">
                  <DrawerLink to="/faq" onClick={() => setIsMenuOpen(false)}>FAQ</DrawerLink>
                  <DrawerLink to="/contact" onClick={() => setIsMenuOpen(false)}>Contact</DrawerLink>
                </DrawerSection>

                {user ? (
                  <div className="mt-3 pt-5 border-t border-black/5 flex flex-col gap-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-black/40">Signed in as</p>
                    <p className="text-xs font-bold truncate mb-3">{profile?.email ?? user.email}</p>
                    <button
                      onClick={async () => { await signOut(); setIsMenuOpen(false); navigate('/'); }}
                      className="flex items-center justify-between py-3 text-[11px] font-black uppercase tracking-[0.3em] text-red-600"
                    >
                      <span>Sign Out</span>
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAuth(true); setIsMenuOpen(false); }}
                    className="flex items-center justify-between py-4 text-[11px] font-black uppercase tracking-[0.3em] text-black border-t border-black/5 mt-3"
                  >
                    <span>Sign In</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="px-4 py-4 border-t border-black/5 shrink-0">
                <Link
                  to="/sell"
                  className="flex w-full items-center justify-center gap-3 bg-black py-5 text-[11px] font-black uppercase tracking-[0.3em] text-white"
                  onClick={() => setIsMenuOpen(false)}
                >
                  List Item
                </Link>
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

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pb-3 mb-3 border-b border-black/5">
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-black/40 mb-1">{title}</p>
      {children}
    </div>
  );
}

function DrawerLink({ to, onClick, badge, children }: { to: string; onClick: () => void; badge?: number; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center justify-between py-4 text-[11px] font-black uppercase tracking-[0.3em] text-black hover:text-black/60 transition-colors"
    >
      <span className="flex items-center gap-2">
        {children}
        {!!badge && (
          <span className="h-4 min-w-4 px-1 rounded-full bg-black text-white text-[9px] font-black flex items-center justify-center">
            {badge}
          </span>
        )}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-black/30" />
    </Link>
  );
}
