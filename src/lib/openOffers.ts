// How many offers are waiting on this vendor to accept or turn down. Shown as
// a dot on Account in the header and a number on the Your items tab, so an
// offer is seen the moment it exists instead of being found by looking.
//
// Checked on sign-in, on every page change and on coming back to the tab: an
// offer is made by an operator at any time, and there is no push channel to
// the browser.
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import { useAuth } from './auth';

export function useOpenOfferCount(): number {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!user) { setCount(0); return; }
    let alive = true;
    const check = async () => {
      const { count: n, error } = await supabase
        .from('vendor_offers')
        .select('listing_id', { count: 'exact', head: true })
        .eq('offer_status', 'offered');
      if (alive && !error) setCount(n ?? 0);
    };
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [user, pathname]);

  return count;
}
