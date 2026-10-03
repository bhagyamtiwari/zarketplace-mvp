// One account, three places: what you have bought, what you have sent us, and
// your details. Each is its own address (/account/orders, /account/items,
// /account/profile), so a reload or a link lands on the right one, and the
// tabs are the only navigation between them.
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useFirstName } from '../lib/auth';
import { useOpenOffers } from '../lib/openOffers';
import { ui } from '../lib/ui';
import { cn } from '../lib/utils';

export type AccountTab = 'orders' | 'items' | 'payouts' | 'profile';

const TABS: Array<{ key: AccountTab; to: string; label: string }> = [
  { key: 'orders', to: '/account/orders', label: 'Your orders' },
  { key: 'items', to: '/account/items', label: 'Your items' },
  { key: 'payouts', to: '/account/payouts', label: 'Your payouts' },
  { key: 'profile', to: '/account/profile', label: 'Profile' },
];

export function AccountLayout({ tab, children }: { tab: AccountTab; children: React.ReactNode }) {
  const { user, emailVerified, resendVerification, signOut } = useAuth();
  const navigate = useNavigate();
  const firstName = useFirstName();
  const offerIds = useOpenOffers();
  const offers = offerIds.length;
  const [notice, setNotice] = React.useState<string | null>(null);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        {/* Their name says whose account this is. An account made before
            sign-up asked for a name falls back to the plain heading. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h1 className={ui.pageTitle}>{firstName ? `Hi ${firstName}` : 'Your account'}</h1>
          {user && (
            <button type="button" onClick={async () => { await signOut(); navigate('/'); }} className={cn(ui.link, 'text-sm font-bold')}>
              Sign out
            </button>
          )}
        </div>
        {user && !emailVerified && (
          <p className="text-sm">
            Your email is not verified yet.{' '}
            <button
              type="button"
              onClick={async () => { setNotice(null); const { error } = await resendVerification(); setNotice(error ? error : 'Verification email sent.'); }}
              className={cn(ui.link, 'font-bold')}
            >
              Send the link again
            </button>
            {notice && <span className="ml-2">{notice}</span>}
          </p>
        )}
        {/* A new offer is said in words on every part of the account, not
            only as a number on a tab: an offer runs out, so it should be
            seen the moment someone opens their account. */}
        {offers > 0 && (
          <Link to={offers === 1 ? `/offer/${offerIds[0]}` : '/account/items'}
            className="group flex items-center justify-between gap-4 border-2 border-black bg-amber-100 px-4 py-3 sm:px-5 hover:bg-amber-200 transition-colors">
            <span className="flex items-center gap-3">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 ring-4 ring-amber-400/30" />
              <span className="text-sm font-bold">
                {offers === 1 ? 'You have a new offer.' : `You have ${offers} new offers.`}{' '}
                <span className="font-normal">Review {offers === 1 ? 'it' : 'them'} before {offers === 1 ? 'it runs' : 'they run'} out.</span>
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.2em] group-hover:underline underline-offset-4">Review</span>
          </Link>
        )}
        <nav className="-mb-px flex gap-7 overflow-x-auto border-b border-black/10" aria-label="Your account">
          {TABS.map((t) => (
            <Link
              key={t.key}
              to={t.to}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 border-b-2 pb-3 text-[11px] font-black uppercase tracking-[0.2em] transition-colors',
                tab === t.key ? 'border-black text-black' : 'border-transparent hover:border-black/30',
              )}
            >
              {t.label}
              {t.key === 'items' && offers > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-black tracking-normal text-black"
                  aria-label={`${offers} ${offers === 1 ? 'offer' : 'offers'} waiting`}>
                  {offers}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
