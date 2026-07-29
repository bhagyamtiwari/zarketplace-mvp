import { useEffect, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Marketplace } from './pages/Marketplace';
import { ProductPage } from './pages/ProductPage';
import { Sell } from './pages/Sell';
import { Admin } from './pages/Admin';
import { Returns } from './pages/Returns';
import { Privacy } from './pages/Privacy';
import { Trademark } from './pages/Trademark';
import { Condition } from './pages/Condition';
import { Checkout } from './pages/Checkout';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { TrackOrder } from './pages/TrackOrder';
import { SellerPortal } from './pages/SellerPortal';
import { Account } from './pages/Account';
import { Faq } from './pages/Faq';
import { ShippingPolicy } from './pages/ShippingPolicy';
import { SellerPolicy } from './pages/SellerPolicy';
import { RefundPolicy } from './pages/RefundPolicy';
import { BuyerProtection } from './pages/BuyerProtection';
import { Terms } from './pages/Terms';
import { GrievanceOfficer } from './pages/GrievanceOfficer';
import { AuthCallback } from './pages/AuthCallback';
import { ResetPassword } from './pages/ResetPassword';
import { AuthProvider } from './lib/auth';
import { CartProvider } from './lib/cart';
import { Cart } from './pages/Cart';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import { ScrollToTop } from './components/ScrollToTop';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { useConsent } from './lib/cookieConsent';
import { initAnalytics, trackPageview } from './lib/analytics';

// Keying by pathname remounts the boundary (clearing any caught error) the
// moment the user navigates to a different route, instead of leaving them
// stuck on the fallback until a manual reload.
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

// Reject actually disables Analytics/Speed Insights/PostHog - it isn't
// decorative. All stay off until a choice is made (no analytics-before-consent).
function ConsentedAnalytics() {
  const [consent] = useConsent();
  const accepted = consent === 'accepted';

  // PostHog is only loaded (and only ever collects) after acceptance.
  useEffect(() => {
    if (accepted) initAnalytics();
  }, [accepted]);

  if (!accepted) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <PageviewTracker />
    </>
  );
}

// Single place that reports SPA route changes to PostHog. Rendered only inside
// the consented tree, so it cannot fire before consent.
function PageviewTracker() {
  const { pathname } = useLocation();
  useEffect(() => { trackPageview(pathname); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
      <CartProvider>
      <ScrollToTop />
      <div className="min-h-screen bg-white font-sans text-black selection:bg-black selection:text-white overflow-x-clip">
        <Navbar />
        <main>
          <RoutedErrorBoundary>
          <Routes>
            {/* Home *is* browse. Both paths render the same feed so existing
                /browse links (and every filter query string on them) keep
                working, with no "landing page" in between. */}
            <Route path="/" element={<Marketplace />} />
            <Route path="/browse" element={<Marketplace />} />
            <Route path="/product/:id" element={<ProductPage />} />
            <Route path="/item/:sku" element={<ProductPage />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/trademark-notice" element={<Trademark />} />
            <Route path="/trademark" element={<Navigate to="/trademark-notice" replace />} />
            <Route path="/conditions-guide" element={<Condition />} />
            <Route path="/condition" element={<Navigate to="/conditions-guide" replace />} />
            <Route path="/grievance-officer" element={<GrievanceOfficer />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/:id" element={<Checkout />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/track-order" element={<TrackOrder />} />
            <Route path="/seller-portal" element={<SellerPortal />} />
            <Route path="/account" element={<Account />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/shipping-policy" element={<ShippingPolicy />} />
            <Route path="/seller-policy" element={<SellerPolicy />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/buyer-protection" element={<BuyerProtection />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
          </RoutedErrorBoundary>
        </main>

        <Footer />
        <CookieConsent />
      </div>
      </CartProvider>
      </AuthProvider>
      <ConsentedAnalytics />
    </Router>
  );
}
