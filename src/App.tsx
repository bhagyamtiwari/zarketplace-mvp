import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { Browse } from './pages/Browse';
import { ProductPage } from './pages/ProductPage';
import { Sell } from './pages/Sell';
import { Admin } from './pages/Admin';
import { Returns } from './pages/Returns';
import { Privacy } from './pages/Privacy';
import { Condition } from './pages/Condition';
import { Checkout } from './pages/Checkout';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { Instagram, Twitter, Facebook, ArrowUpRight } from 'lucide-react';

import { ScrollToTop } from './components/ScrollToTop';

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="min-h-screen bg-white font-sans text-black selection:bg-black selection:text-white">
        <Navbar />
        <main className="pt-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/product/:id" element={<ProductPage />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/condition" element={<Condition />} />
            <Route path="/checkout/:id" element={<Checkout />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </main>
        
        <footer className="bg-white text-black py-32 border-t border-black/5">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-start gap-20">
              <div className="flex flex-col gap-6">
                <Link to="/" className="flex items-center gap-3 group">
                  <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-10 w-auto" referrerPolicy="no-referrer" />
                  <span className="lowercase font-black tracking-tighter text-3xl">zarketplace</span>
                </Link>
              </div>

              <div className="flex flex-wrap md:flex-nowrap gap-16 md:gap-24 md:ml-auto">
                <div className="flex flex-col gap-6 text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-black">Navigation</h4>
                  <ul className="text-xs font-black uppercase tracking-widest space-y-4">
                    <li className="relative">
                      <Link to="/browse" className="hover:text-black/80 transition-colors">Buy</Link>
                    </li>
                    <li><Link to="/sell" className="hover:text-black/80 transition-colors">Sell</Link></li>
                    <li><Link to="/about" className="hover:text-black/80 transition-colors">About</Link></li>
                    <li><Link to="/contact" className="hover:text-black/80 transition-colors">Contact</Link></li>
                  </ul>
                </div>

                <div className="flex flex-col gap-6 text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-black">Legal</h4>
                  <ul className="text-xs font-black uppercase tracking-widest space-y-4">
                    <li><Link to="/returns" className="hover:text-black/80 transition-colors">Returns</Link></li>
                    <li><Link to="/privacy" className="hover:text-black/80 transition-colors">Privacy</Link></li>
                    <li><Link to="/condition" className="hover:text-black/80 transition-colors">Item Condition</Link></li>
                  </ul>
                </div>

                <div className="flex flex-col gap-6 text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-black">Social</h4>
                  <ul className="text-xs font-black uppercase tracking-widest space-y-4">
                    <li><a href="https://x.com/zarketplace" target="_blank" rel="noopener noreferrer" className="hover:text-black/80 transition-colors">X/Twitter</a></li>
                    <li><a href="https://www.instagram.com/zarketplace" target="_blank" rel="noopener noreferrer" className="hover:text-black/80 transition-colors">Instagram</a></li>
                    <li><a href="https://www.youtube.com/@zarketplace" target="_blank" rel="noopener noreferrer" className="hover:text-black/80 transition-colors">YouTube</a></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-32 pt-12 border-t border-black/5 flex flex-col items-center gap-12 text-center">
              <p className="text-[8px] font-bold uppercase tracking-widest text-black leading-relaxed max-w-4xl">
                Zarketplace is a resale and P2P/C2C marketplace. We are not affiliated with, associated with, or endorsed by the brands on our platform and claim no rights to their trademarks or intellectual property. For inquiries, contact us at contact@zarketplace.com
              </p>
              
              <div className="flex flex-col md:flex-row justify-end w-full items-center gap-8">
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-black">
                  © 2026 ZARKETPLACE. ALL RIGHTS RESERVED.
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}
