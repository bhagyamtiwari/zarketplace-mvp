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
  return useOpenOffers().length;
}

/** The listings with an offer waiting on this vendor, so a notice can link straight to one. */
export function useOpenOffers(): string[] {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!user) { setIds([]); return; }
    let alive = true;
    const check = async () => {
      const { data, error } = await supabase
        .from('vendor_offers')
        .select('listing_id')
        .eq('offer_status', 'offered');
      if (alive && !error) {
        const next = (data ?? []).map((r: { listing_id: string }) => r.listing_id);
        setIds((prev) => (prev.join() === next.join() ? prev : next));
      }
    };
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [user, pathname]);

  return ids;
}
