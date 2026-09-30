// One account, three places: what you have bought, what you have sent us, and
// your details. Each is its own address (/account/orders, /account/items,
// /account/profile), so a reload or a link lands on the right one, and the
// tabs are the only navigation between them.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useFirstName } from '../lib/auth';
import { useOpenOfferCount } from '../lib/openOffers';
import { ui } from '../lib/ui';
import { cn } from '../lib/utils';

export type AccountTab = 'orders' | 'items' | 'profile';

const TABS: Array<{ key: AccountTab; to: string; label: string }> = [
  { key: 'orders', to: '/account/orders', label: 'Your orders' },
  { key: 'items', to: '/account/items', label: 'Your items' },
  { key: 'profile', to: '/account/profile', label: 'Profile' },
];

export function AccountLayout({ tab, children }: { tab: AccountTab; children: React.ReactNode }) {
  const { user, emailVerified, resendVerification } = useAuth();
  const firstName = useFirstName();
  const offers = useOpenOfferCount();
  const [notice, setNotice] = React.useState<string | null>(null);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        {/* Their name says whose account this is. An account made before
            sign-up asked for a name falls back to the plain heading. */}
        <h1 className={ui.pageTitle}>{firstName ? `Hi ${firstName}` : 'Your account'}</h1>
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
