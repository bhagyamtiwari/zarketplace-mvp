import * as React from 'react';
import { useAuth } from '../lib/auth';
import { setFavoritesAccount, syncFavorites, forgetAccountFavorites } from '../lib/favorites';

// Keeps the device's favorites in step with the signed-in account (see
// src/lib/favorites.ts): syncs on sign-in and on every return to the tab, so
// a heart added on a phone is there on the laptop, and forgets the account's
// list on sign-out. Renders nothing.
export function FavoritesSync() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const previous = React.useRef<string | null | undefined>(undefined);

  React.useEffect(() => {
    if (loading) return;
    // Only an actual sign-out forgets: a first load that is signed out keeps
    // whatever was hearted on this device.
    if (previous.current && !userId) forgetAccountFavorites();
    previous.current = userId;
    setFavoritesAccount(userId);
    if (userId) void syncFavorites(userId);
  }, [userId, loading]);

  React.useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncFavorites(userId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  return null;
}
