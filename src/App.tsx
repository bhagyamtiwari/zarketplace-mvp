import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Marketplace } from './pages/Marketplace';
import { AuthProvider } from './lib/auth';
import { CartProvider } from './lib/cart';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import { ScrollToTop } from './components/ScrollToTop';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { PhoneCapturePrompt } from './components/PhoneCapturePrompt';
import { StatePrompt } from './components/StatePrompt';
import { useConsent } from './lib/cookieConsent';
import { initAnalytics, trackPageview } from './lib/analytics';

// Route-level code splitting. The entry bundle was 917 KB, and a first-time
// visitor on mobile data was downloading the admin console, checkout and the
// listing form before the feed could paint. Only the marketplace - which is
// "/" - is eager; everything else arrives when its route does.
const ProductPage = lazy(() => import('./pages/ProductPage').then((m) => ({ default: m.ProductPage })));
const Sell = lazy(() => import('./pages/Sell').then((m) => ({ default: m.Sell })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const Returns = lazy(() => import('./pages/Returns').then((m) => ({ default: m.Returns })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Trademark = lazy(() => import('./pages/Trademark').then((m) => ({ default: m.Trademark })));
const Condition = lazy(() => import('./pages/Condition').then((m) => ({ default: m.Condition })));
const Checkout = lazy(() => import('./pages/Checkout').then((m) => ({ default: m.Checkout })));
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));
const Contact = lazy(() => import('./pages/Contact').then((m) => ({ default: m.Contact })));
const TrackOrder = lazy(() => import('./pages/TrackOrder').then((m) => ({ default: m.TrackOrder })));
const SellerPortal = lazy(() => import('./pages/SellerPortal').then((m) => ({ default: m.SellerPortal })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const Faq = lazy(() => import('./pages/Faq').then((m) => ({ default: m.Faq })));
const ShippingPolicy = lazy(() => import('./pages/ShippingPolicy').then((m) => ({ default: m.ShippingPolicy })));
const SellerPolicy = lazy(() => import('./pages/SellerPolicy').then((m) => ({ default: m.SellerPolicy })));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy').then((m) => ({ default: m.RefundPolicy })));
const BuyerProtection = lazy(() => import('./pages/BuyerProtection').then((m) => ({ default: m.BuyerProtection })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));
const GrievanceOfficer = lazy(() => import('./pages/GrievanceOfficer').then((m) => ({ default: m.GrievanceOfficer })));
const AuthCallback = lazy(() => import('./pages/AuthCallback').then((m) => ({ default: m.AuthCallback })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Cart = lazy(() => import('./pages/Cart').then((m) => ({ default: m.Cart })));


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
          {/* Reserve more than two viewports while a route chunk loads. At
              80vh the footer sat on screen and was then shoved down as the real
              page mounted, which is where most of the site's layout shift came
              from. Below the fold, the same growth costs nothing. */}
          <Suspense fallback={<div className="min-h-[220vh]" aria-busy="true" />}>
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
          </Suspense>
          </RoutedErrorBoundary>
        </main>

        <Footer />
        <CookieConsent />
        {/* Only renders for a signed-in account with no phone on file, which
            in practice means Google signups. Phone becomes the login identity
            once OTP lands, so the gap has to close before then. */}
        <PhoneCapturePrompt />
        {/* Asked once per device, before sign-up: the GST state rule has to be
            understandable to a first-time visitor who has no account. */}
        <StatePrompt />
      </div>
      </CartProvider>
      </AuthProvider>
      <ConsentedAnalytics />
    </Router>
  );
}
