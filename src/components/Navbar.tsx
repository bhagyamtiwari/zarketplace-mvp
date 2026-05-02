import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, User, Menu, X, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isBrowseOpen, setIsBrowseOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  const browseCategories = {
    Men: ['Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes'],
    Women: ['Tops', 'Bottoms', 'Outerwear', 'Accessories', 'Shoes']
  };

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-black/5 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-12">
            <Link to="/" className="flex items-center gap-3 group">
              <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-8 w-auto group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
              <span className="lowercase font-black tracking-tighter text-3xl">zarketplace</span>
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
                      className="absolute left-0 top-full w-[400px] bg-white border border-black/5 shadow-2xl p-8 grid grid-cols-2 gap-8"
                    >
                      {Object.entries(browseCategories).map(([gender, cats]) => (
                        <div key={gender} className="flex flex-col gap-4">
                          <Link 
                            to={`/browse?gender=${gender}`}
                            className="text-[10px] font-black uppercase tracking-[0.3em] border-b border-black/5 pb-2"
                            onClick={() => setIsBrowseOpen(false)}
                          >
                            {gender}
                          </Link>
                          <div className="flex flex-col gap-2">
                            {cats.map(cat => (
                              <Link
                                key={cat}
                                to={`/browse?gender=${gender}&category=${cat}`}
                                className="text-[9px] font-bold uppercase tracking-widest text-black/60 hover:text-black transition-colors"
                                onClick={() => setIsBrowseOpen(false)}
                              >
                                {cat}
                              </Link>
                            ))}
                          </div>
                        </div>
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
              <Link to="/sell" className="bg-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all hover:scale-105 active:scale-95">
                List Item
              </Link>
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

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-black/5 bg-white px-4 py-4 space-y-4">
          <Link
            to="/browse"
            className="block text-lg font-medium"
            onClick={() => setIsMenuOpen(false)}
          >
            Buy
          </Link>
          <Link
            to="/sell"
            className="block text-lg font-medium"
            onClick={() => setIsMenuOpen(false)}
          >
            Sell
          </Link>
          <Link
            to="/sell"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-black py-3 text-white"
            onClick={() => setIsMenuOpen(false)}
          >
            <Plus className="h-5 w-5" />
            <span>List Item</span>
          </Link>
        </div>
      )}
    </nav>
  );
}
