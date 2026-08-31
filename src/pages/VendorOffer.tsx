// The offer screen and the agreement screen: the two most important surfaces
// in the vendor flow.
//
// The offer screen shows one number and nothing else. There is no breakdown to
// expand, no working shown, and no resale price anywhere on the page - not
// hidden behind a toggle, not in the markup, not in the data this page fetches.
// A vendor agrees to what we will pay them. What we later sell it for is not
// part of that agreement and is not theirs to see.
//
// The agreement is a separate screen rather than a checkbox under the number,
// because it is a legal record and it should feel like one. Accepting is one
// action that writes the acceptance and the signed clauses together.

import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RequireAuth } from '../components/RequireAuth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { scrollToTop } from '../lib/scrollToTop';
import { cn, formatCurrency } from '../lib/utils';
import { trackEvent } from '../lib/analytics';
import {
  getVendorOffer, acceptOffer, declineOffer,
  AGREEMENT_CLAUSES, type VendorOffer,
} from '../lib/acquisition';

export function VendorOfferPage() {
  useDocumentTitle('Your offer');
  return (
    <RequireAuth message="Sign in to see your offer.">
      <VendorOfferInner />
    </RequireAuth>
  );
}

type Phase = 'offer' | 'agreement' | 'done';

function VendorOfferInner() {
  const { listingId = '' } = useParams();
  const navigate = useNavigate();

  const [offer, setOffer] = React.useState<VendorOffer | null>(null);
  const [title, setTitle] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>('offer');
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [o, l] = await Promise.all([
        getVendorOffer(listingId),
        // Title only. This page has no reason to read anything else about the
        // listing, so it does not.
        supabase.from('listings').select('title').eq('id', listingId).maybeSingle(),
      ]);
      if (!alive) return;
      setOffer(o);
      setTitle((l.data as { title?: string } | null)?.title ?? 'your item');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [listingId]);

  const allChecked = AGREEMENT_CLAUSES.every((c) => checked[c.key]);

  const onAccept = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await acceptOffer(listingId);
      trackEvent('acquisition_offer_accepted', { listing_id: listingId });
      setPhase('done');
      scrollToTop();
    } catch (err: any) {
      setError(err?.message ?? 'Could not record your acceptance. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDecline = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await declineOffer(listingId);
      navigate('/vendor-portal');
    } catch (err: any) {
      setError(err?.message ?? 'Could not record that. Try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-black/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[11px] font-black uppercase tracking-[0.3em]">Loading</span>
        </div>
      </Shell>
    );
  }

  if (!offer) return <Shell><Notice>We could not find an offer for this item.</Notice></Shell>;

  if (offer.offer_status === 'accepted' || phase === 'done') {
    return <Shell><Accepted amount={offer.offer_amount} /></Shell>;
  }

  if (offer.offer_status === 'pending_pricing') {
    return (
      <Shell>
        <Notice>
          We are still working out what we can pay for {title}. You will hear from us
          shortly, and nothing goes live until you have seen the number and agreed to it.
        </Notice>
      </Shell>
    );
  }

  if (offer.offer_status !== 'offered') {
    return (
      <Shell>
        <Notice>
          {offer.offer_status === 'expired'
            ? 'This offer has expired. Get in touch and we will look at it again.'
            : 'This item is not being taken forward.'}
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      {phase === 'offer'
        ? <OfferScreen
            title={title}
            amount={offer.offer_amount ?? 0}
            expiresAt={offer.offer_expires_at}
            onContinue={() => { setPhase('agreement'); scrollToTop(); }}
            onDecline={onDecline}
            submitting={submitting}
          />
        : <AgreementScreen
            amount={offer.offer_amount ?? 0}
            checked={checked}
            onToggle={(k) => setChecked((c) => ({ ...c, [k]: !c[k] }))}
            allChecked={allChecked}
            submitting={submitting}
            onBack={() => { setPhase('offer'); scrollToTop(); }}
            onAccept={onAccept}
          />}
      {error && (
        <div className="mt-8 flex gap-3 border border-amber-500/40 bg-amber-50 px-5 py-4">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
          <p className="text-[11px] font-bold uppercase tracking-widest leading-[1.8] text-amber-900">{error}</p>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-20 sm:pb-28">
      <Link to="/vendor-portal" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Your items
      </Link>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {children}
      </motion.div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="body-copy text-black/70 max-w-prose">{children}</p>;
}

/**
 * One number, given the whole screen. The amount is the largest thing on the
 * page by a wide margin - it is the entire decision, and the layout should not
 * pretend otherwise.
 */
function OfferScreen({
  title, amount, expiresAt, onContinue, onDecline, submitting,
}: {
  title: string; amount: number; expiresAt: string | null;
  onContinue: () => void; onDecline: () => void; submitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-3">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">Your offer</span>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
          zarketplace will pay you
        </h1>
      </div>

      <div className="border-y border-black py-12 sm:py-16 flex flex-col items-start gap-5">
        <span className="text-[3.5rem] sm:text-[5.5rem] font-black tracking-tighter leading-[0.85]">
          {formatCurrency(amount)}
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-black/50">
          when {title} sells
        </span>
      </div>

      <div className="flex flex-col gap-5 body-copy text-black/70 max-w-prose">
        <p>
          This is the amount we pay you, in full. It is fixed now, before your item is
          listed, and it does not change afterwards for any reason.
        </p>
        <p>
          Once you accept, we list the item, and it is sold and shipped by zarketplace.
          When it sells we send you a prepaid label, you post it to us, and we pay you as
          soon as we have checked it in.
        </p>
        {expiresAt && (
          <p className="text-black/40">
            This offer is open until {new Date(expiresAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}.
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="button" onClick={onContinue} disabled={submitting}
          className="flex items-center justify-between gap-3 bg-black px-7 py-5 text-[11px] font-black uppercase tracking-widest text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 sm:min-w-[260px]"
        >
          Accept this offer <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button" onClick={onDecline} disabled={submitting}
          className="px-7 py-5 text-[11px] font-black uppercase tracking-widest text-black/40 transition-colors hover:text-black disabled:opacity-50"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

/**
 * Three acknowledgements, each ticked deliberately. Nothing is pre-ticked and
 * there is no "accept all": the record has to reflect three separate decisions
 * because that is what it will be read as later.
 */
function AgreementScreen({
  amount, checked, onToggle, allChecked, submitting, onBack, onAccept,
}: {
  amount: number; checked: Record<string, boolean>; onToggle: (k: string) => void;
  allChecked: boolean; submitting: boolean; onBack: () => void; onAccept: () => void;
}) {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-3">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">Before we list it</span>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
          Three things to agree to
        </h1>
        <p className="body-copy text-black/70 max-w-prose mt-2">
          You are accepting {formatCurrency(amount)} for this item. Please read each of these
          and tick it. We keep a record of what you agreed to and when.
        </p>
      </div>

      <ul className="flex flex-col">
        {AGREEMENT_CLAUSES.map((clause, i) => {
          const on = !!checked[clause.key];
          return (
            <li key={clause.key} className="border-t border-black/10 last:border-b">
              <button
                type="button"
                onClick={() => onToggle(clause.key)}
                aria-pressed={on}
                className="group flex w-full items-start gap-5 py-7 text-left"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border transition-colors',
                    on ? 'border-black bg-black text-white' : 'border-black/25 group-hover:border-black',
                  )}
                >
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="flex flex-col gap-2 min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/30">
                    0{i + 1}
                  </span>
                  <span className="body-copy text-black">{clause.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="button" onClick={onAccept} disabled={!allChecked || submitting}
          className="flex items-center justify-between gap-3 bg-black px-7 py-5 text-[11px] font-black uppercase tracking-widest text-white transition-transform enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:opacity-40 sm:min-w-[260px]"
        >
          {submitting ? 'Recording...' : 'Agree and list it'}
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
        <button
          type="button" onClick={onBack} disabled={submitting}
          className="px-7 py-5 text-[11px] font-black uppercase tracking-widest text-black/40 transition-colors hover:text-black disabled:opacity-50"
        >
          Back
        </button>
      </div>

      {!allChecked && (
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/30 -mt-8">
          Tick all three to continue
        </p>
      )}
    </div>
  );
}

function Accepted({ amount }: { amount: number | null }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex h-14 w-14 items-center justify-center bg-black text-white">
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
          Agreed. It goes live shortly.
        </h1>
        <p className="body-copy text-black/70 max-w-prose">
          {amount != null && <>We will pay you {formatCurrency(amount)} when this item sells. </>}
          You do not need to do anything until then. When it sells we will send you a prepaid
          label and let you know.
        </p>
      </div>
      <Link
        to="/vendor-portal"
        className="self-start bg-black px-7 py-5 text-[11px] font-black uppercase tracking-widest text-white transition-transform hover:scale-[1.02] active:scale-95"
      >
        Your items
      </Link>
    </div>
  );
}
