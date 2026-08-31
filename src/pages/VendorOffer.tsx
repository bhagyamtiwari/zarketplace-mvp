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
import { useAuth } from '../lib/auth';
import { encodeVariants } from '../lib/images';
import { RequireAuth } from '../components/RequireAuth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { scrollToTop } from '../lib/scrollToTop';
import { cn, formatCurrency } from '../lib/utils';
import { trackEvent } from '../lib/analytics';
import {
  getVendorOffer, acceptOffer, rejectOffer, resubmitListing, canResubmit,
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

  const onReject = async () => {
    if (!window.confirm('Turn this offer down? You can improve the item and send it back to us afterwards.')) return;
    setError(null);
    setSubmitting(true);
    try {
      await rejectOffer(listingId);
      navigate('/vendor-portal');
    } catch (err: any) {
      setError(err?.message ?? 'Could not record that. Try again.');
      setSubmitting(false);
    }
  };

  const onResubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await resubmitListing(listingId);
      trackEvent('acquisition_resubmitted', { listing_id: listingId });
      navigate('/vendor-portal');
    } catch (err: any) {
      setError(err?.message ?? 'Could not send it back. Try again.');
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
        <Waiting title={title} round={offer.offer_round} />
      </Shell>
    );
  }

  if (offer.offer_status !== 'offered') {
    return (
      <Shell>
        <Verdict
          status={offer.offer_status}
          reasons={offer.review_reasons}
          note={offer.review_note}
          listingId={listingId}
          canSendBack={canResubmit(offer)}
          submitting={submitting}
          onResubmit={onResubmit}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
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
            onDecline={onReject}
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
      {error && <ErrorNote>{error}</ErrorNote>}
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

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 flex gap-3 border border-amber-500/40 bg-amber-50 px-5 py-4">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
      <p className="text-[11px] font-bold uppercase tracking-widest leading-[1.8] text-amber-900">{children}</p>
    </div>
  );
}

/** With us, waiting on a decision. States the 24-hour promise plainly. */
function Waiting({ title, round }: { title: string; round: number }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
          {round > 1 ? `With us again - look ${round}` : 'With us'}
        </span>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
          We will come back within 24 hours
        </h1>
      </div>
      <p className="body-copy text-black/70 max-w-prose">
        Someone is looking at {title} now. You will hear either an offer, or what would
        need to change before we can make one. Nothing is listed until you have seen a
        number and agreed to it.
      </p>
    </div>
  );
}

/**
 * Everything that is not an open offer: we asked for a change, we passed, the
 * vendor turned a number down, or an offer went stale. All four say what
 * happened and, where there is one, offer the way forward.
 */
function Verdict({ status, reasons, note, listingId, canSendBack, submitting, onResubmit }: {
  status: string; reasons: string[] | null; note: string | null; listingId: string;
  canSendBack: boolean; submitting: boolean; onResubmit: () => void;
}) {
  const copy = {
    declined: {
      kicker: 'Not this time',
      heading: 'We cannot make an offer on this yet',
      body: 'This is not final. Sort out what is listed here, send the item back to us, and we will look again within 24 hours.',
    },
    offer_rejected: {
      kicker: 'Offer turned down',
      heading: 'No problem',
      body: 'That number did not work for you. If you want us to look again, improve the photos or the description and send it back.',
    },
    expired: {
      kicker: 'Expired',
      heading: 'This offer has lapsed',
      body: 'Offers stay open for a limited time. Send this item back to us and we will price it again.',
    },
  }[status] ?? {
    kicker: 'Update',
    heading: 'There is no open offer on this item',
    body: 'Nothing is waiting on you right now.',
  };

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-3">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">{copy.kicker}</span>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
          {copy.heading}
        </h1>
      </div>

      {(reasons?.length || note) && (
        <div className="border-l-2 border-black pl-6 py-1 flex flex-col gap-4">
          <span className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
            What needs fixing
          </span>
          {reasons && reasons.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {reasons.map((r) => (
                <li key={r} className="body-copy text-black flex gap-3">
                  <span aria-hidden className="text-black/25">&mdash;</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {note && <p className="body-copy text-black">{note}</p>}
        </div>
      )}

      <p className="body-copy text-black/70 max-w-prose">{copy.body}</p>

      {canSendBack && (
        <ImprovePanel listingId={listingId} submitting={submitting} onResubmit={onResubmit} />
      )}
    </div>
  );
}

/**
 * Add photos and reword the description, then send the item back for another
 * look. Deliberately just those two things: they are what an operator asks for
 * when they ask for anything, and a full edit form here would be a second copy
 * of the listing flow to keep in step with the first.
 *
 * Photos are added, never replaced. What we already have was what we reviewed,
 * and removing it mid-conversation would leave a note referring to a picture
 * nobody can see any more.
 */
function ImprovePanel({ listingId, submitting, onResubmit }: {
  listingId: string; submitting: boolean; onResubmit: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || loaded) return;
    void (async () => {
      const { data } = await supabase
        .from('listings').select('description').eq('id', listingId).maybeSingle();
      setDescription((data as { description?: string | null } | null)?.description ?? '');
      setLoaded(true);
    })();
  }, [open, loaded, listingId]);

  const saveAndResend = async () => {
    setSaving(true); setSaveError(null);
    try {
      const patch: Record<string, unknown> = { description: description.trim() || null };

      if (files.length > 0 && user) {
        const { data: current } = await supabase
          .from('listings').select('image_urls').eq('id', listingId).maybeSingle();
        const existing = (current as { image_urls?: string[] } | null)?.image_urls ?? [];
        const added: string[] = [];
        const stamp = Date.now();
        for (let i = 0; i < files.length; i++) {
          const variants = await encodeVariants(files[i]);
          let fullUrl = '';
          for (const variant of ['thumb', 'grid', 'full'] as const) {
            const { blob, width, ext } = variants[variant];
            const path = `listings/${user.id}-${stamp}-r${i}-${width}.${ext}`;
            const { error } = await supabase.storage
              .from('listing-images').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
            if (error) throw error;
            if (variant === 'full') {
              fullUrl = supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
            }
          }
          added.push(fullUrl);
        }
        patch.image_urls = [...existing, ...added];
      }

      const { error } = await supabase.from('listings').update(patch).eq('id', listingId);
      if (error) throw error;
      onResubmit();
    } catch (err: any) {
      setSaveError(err?.message ?? 'Could not save your changes.');
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="button" onClick={() => setOpen(true)}
          className="flex items-center justify-between gap-3 bg-black px-7 py-5 text-[11px] font-black uppercase tracking-widest text-white transition-transform hover:scale-[1.02] active:scale-95 sm:min-w-[260px]"
        >
          Improve this item <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button" onClick={onResubmit} disabled={submitting}
          className="px-7 py-5 text-[11px] font-black uppercase tracking-widest text-black/40 transition-colors hover:text-black disabled:opacity-50"
        >
          {submitting ? 'Sending...' : 'Send back as is'}
        </button>
      </div>
    );
  }

  const busy = saving || submitting;

  return (
    <div className="flex flex-col gap-10 border-t border-black/10 pt-12">
      <div className="flex flex-col gap-3">
        <label className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
          Add photos
        </label>
        <input
          type="file" accept="image/*" multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-xs font-bold file:mr-4 file:border file:border-black file:bg-white file:px-5 file:py-3 file:text-[10px] file:font-black file:uppercase file:tracking-widest hover:file:bg-black hover:file:text-white file:transition-colors"
        />
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 leading-[1.9]">
          {files.length > 0
            ? `${files.length} ${files.length === 1 ? 'photo' : 'photos'} will be added`
            : 'These are added to your existing photos, not swapped for them.'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-[9px] font-black uppercase tracking-[0.4em] text-black/40">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Fit, material, how it runs, anything a photo cannot show."
          className="border border-black/15 bg-white px-4 py-3 text-sm font-medium leading-relaxed focus:border-black focus:outline-none"
        />
      </div>

      {saveError && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-red-700">{saveError}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          type="button" onClick={saveAndResend} disabled={busy}
          className="flex items-center justify-between gap-3 bg-black px-7 py-5 text-[11px] font-black uppercase tracking-widest text-white transition-transform enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:opacity-40 sm:min-w-[260px]"
        >
          {busy ? 'Sending...' : 'Send back to us'}
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
        <button
          type="button" onClick={() => setOpen(false)} disabled={busy}
          className="px-7 py-5 text-[11px] font-black uppercase tracking-widest text-black/40 transition-colors hover:text-black disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
