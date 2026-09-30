// /account on its own: straight to the tab that matters to this person. A
// vendor with an offer waiting, or items with us, lands on Your items; anyone
// else on Your orders.
import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';

export function AccountHome() {
  return (
    <RequireAuth message="Sign in to see your account.">
      <Choose />
    </RequireAuth>
  );
}

function Choose() {
  const { user } = useAuth();
  const [to, setTo] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const { count } = await supabase
        .from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', user.id);
      if (alive) setTo((count ?? 0) > 0 ? '/account/items' : '/account/orders');
    })();
    return () => { alive = false; };
  }, [user]);
  if (!to) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return <Navigate to={to} replace />;
}
