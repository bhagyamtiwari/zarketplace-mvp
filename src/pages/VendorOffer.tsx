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
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { ui } from '../lib/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { encodeVariants } from '../lib/images';
import { RequireAuth } from '../components/RequireAuth';
import { usePageMeta, META } from '../lib/pageMeta';
import { scrollToTop } from '../lib/scrollToTop';
import { cn, formatCurrency } from '../lib/utils';
import { trackEvent } from '../lib/analytics';
import {
  getVendorOffer, acceptOffer, rejectOffer, resubmitListing, canResubmit,
  AGREEMENT_CLAUSES, type VendorOffer,
} from '../lib/acquisition';

export function VendorOfferPage() {
  usePageMeta(META.offer);
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
  const [pickupAddress, setPickupAddress] = React.useState('');
  const [pickupCity, setPickupCity] = React.useState('');
  const [pickupPincode, setPickupPincode] = React.useState('');
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
  const addressReady = pickupAddress.trim().length > 4
    && pickupCity.trim().length > 1
    && /^[1-9][0-9]{5}$/.test(pickupPincode.trim());

  const onAccept = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await acceptOffer(listingId, { address: pickupAddress.trim(), city: pickupCity.trim(), pincode: pickupPincode.trim() });
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
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
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
            pickupAddress={pickupAddress} setPickupAddress={setPickupAddress}
            pickupCity={pickupCity} setPickupCity={setPickupCity}
            pickupPincode={pickupPincode} setPickupPincode={setPickupPincode}
            addressReady={addressReady}
            submitting={submitting}
            onBack={() => { setPhase('offer'); scrollToTop(); }}
            onAccept={onAccept}
          />}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20 [&>*]:max-w-2xl">
      <Link to="/vendor-portal" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Your items
      </Link>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {children}
      </motion.div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className={ui.help}>{children}</p>;
}

/**
 * The offer, and the three facts that make it safe to say yes. The number
 * leads but does not shout: it is a figure someone reads and considers, not a
 * headline, and at poster size it read as a sales pitch.
 */
export function OfferScreen({
  title, amount, expiresAt, onContinue, onDecline, submitting,
}: {
  title: string; amount: number; expiresAt: string | null;
  onContinue: () => void; onDecline: () => void; submitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4 border-b border-black pb-8">
        <h1 className="text-sm font-bold">Our offer</h1>
        <span className="text-5xl sm:text-6xl font-black tracking-tighter leading-none tabular-nums">
          {formatCurrency(amount)}
        </span>
        <span className="text-[15px] leading-snug">For {title}, paid when it reaches our hub.</span>
      </div>

      <Bullets items={[
        'The amount is fixed and does not change once you accept.',
        'The item stays with you until someone buys it.',
        'Shipping to us is free: we send you a prepaid label.',
      ]} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onContinue} disabled={submitting} className={cn(ui.btnPrimary, 'py-5 sm:min-w-[240px]')}>
            Accept this offer
          </button>
          <button type="button" onClick={onDecline} disabled={submitting} className={cn(ui.btnSecondary, 'py-5')}>
            No thanks
          </button>
        </div>
        {expiresAt && (
          <p className={ui.help}>
            Open until {new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.
          </p>
        )}
      </div>
    </div>
  );
}

/** Short statements, one sentence each, as a list rather than a paragraph. */
function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 bg-black" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Three acknowledgements, each ticked deliberately. Nothing is pre-ticked and
 * there is no "accept all": the record has to reflect three separate decisions
 * because that is what it will be read as later.
 */
export function AgreementScreen({
  amount, checked, onToggle, allChecked,
  pickupAddress, setPickupAddress, pickupCity, setPickupCity, pickupPincode, setPickupPincode, addressReady,
  submitting, onBack, onAccept,
}: {
  amount: number;
  checked: Record<string, boolean>; onToggle: (k: string) => void;
  allChecked: boolean;
  pickupAddress: string; setPickupAddress: (v: string) => void;
  pickupCity: string; setPickupCity: (v: string) => void;
  pickupPincode: string; setPickupPincode: (v: string) => void;
  addressReady: boolean;
  submitting: boolean; onBack: () => void; onAccept: () => void;
}) {
  const field = ui.input;
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>
          Accept {formatCurrency(amount)}
        </h1>
        <p className={ui.help}>Tick all three. We keep a record of what you agreed to.</p>
      </div>

      <ul className="flex flex-col border-t border-black/10">
        {AGREEMENT_CLAUSES.map((clause) => {
          const on = !!checked[clause.key];
          return (
            <li key={clause.key} className="border-b border-black/10">
              <button
                type="button"
                onClick={() => onToggle(clause.key)}
                aria-pressed={on}
                className="group flex w-full items-start gap-4 py-5 text-left"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors',
                    on ? 'border-black bg-black text-white' : 'border-black/25 group-hover:border-black',
                  )}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="text-sm leading-relaxed">{clause.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Asked here rather than in the listing form: four fields before we
          have told anyone a number is four fields spent on an item we might
          not take. accept_acquisition_offer refuses an acceptance without
          them, so nothing can be agreed with nowhere to collect from. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className={ui.label}>Collection address</span>
          <p className={ui.help}>Only used once someone buys it.</p>
        </div>
        <input type="text" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)}
          placeholder="Flat / house no., street, area" className={field} />
        <div className="grid grid-cols-2 gap-4">
          <input type="text" value={pickupCity} onChange={(e) => setPickupCity(e.target.value)}
            placeholder="City" className={field} />
          <input type="text" inputMode="numeric" maxLength={6} value={pickupPincode}
            onChange={(e) => setPickupPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Pincode" className={field} />
        </div>
      </div>

      {/* What accepting commits you to, at the moment you commit to it. The
          same rules and numbers as "What happens next?" on the listing form,
          one sentence each. */}
      <div className="flex flex-col gap-4 border-t border-black/10 pt-8">
        <span className={ui.label}>What you are agreeing to</span>
        <Bullets items={[
          'Keep it packed and unworn, and do not sell it anywhere else.',
          'When it sells, we email you a prepaid label and a courier collects it from your door, free.',
          <>It must be handed over within <strong>5 days</strong>, and you pay nothing for shipping.</>,
          <>If it does not match your photos, we can refuse it and return it <strong>at your expense</strong>.</>,
          'You are paid when it reaches our hub and matches your photos.',
          'If we have not sold it in 30 days, the offer ends and nothing is owed either way.',
          'You can withdraw it from Your items any time before someone buys it.',
        ]} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button" onClick={onAccept} disabled={!allChecked || !addressReady || submitting}
            className={cn(ui.btnPrimary, 'py-5 sm:min-w-[240px]')}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Recording' : 'Accept this offer'}
          </button>
          <button type="button" onClick={onBack} disabled={submitting} className={cn(ui.btnSecondary, 'py-5')}>
            Back
          </button>
        </div>
        {(!allChecked || !addressReady) && (
          <p className={ui.help}>
            {!allChecked ? 'Tick all three to continue.' : 'Add the collection address to continue.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function Accepted({ amount }: { amount: number | null }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex h-14 w-14 items-center justify-center bg-black text-white">
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>
          Agreed. It goes on sale shortly.
        </h1>
        <p className={ui.help}>
          {amount != null && <>Your {formatCurrency(amount)} is locked in and does not change. </>}
          Nothing to do now: keep the item safe and leave it with you. The moment somebody
          buys it we will message you with a prepaid label and a pickup date.
        </p>
      </div>
      <Link to="/vendor-portal" className={cn(ui.btnPrimary, 'self-start')}>
        Your items
      </Link>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className={cn(ui.error, 'mt-8')}>{children}</p>
  );
}

/** With us, waiting on a decision. States the 24-hour promise plainly. */
function Waiting({ title, round }: { title: string; round: number }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>
          Back in 24 hours.
        </h1>
      </div>
      <p className={ui.help}>
        Someone is looking at {title} now. You will hear either an offer, or what would
        need to change before we can make one. Nothing goes on sale until you have seen a
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
export function Verdict({ status, reasons, note, listingId, canSendBack, submitting, onResubmit }: {
  status: string; reasons: string[] | null; note: string | null; listingId: string;
  canSendBack: boolean; submitting: boolean; onResubmit: () => void;
}) {
  const copy = {
    declined: {
      heading: 'We cannot make an offer on this yet',
      body: 'This is not final. Sort out what is set out here, send the item back to us, and we will look again within 24 hours.',
    },
    offer_rejected: {
      heading: 'No problem',
      body: 'That number did not work for you. If you want us to look again, improve the photos or the description and send it back.',
    },
    expired: {
      heading: 'This offer has lapsed',
      body: 'Offers stay open for a limited time. Send this item back to us and we will price it again.',
    },
  }[status] ?? {
    heading: 'There is no open offer on this item',
    body: 'Nothing is waiting on you right now.',
  };

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>
          {copy.heading}
        </h1>
      </div>

      {(reasons?.length || note) && (
        <div className="border-l-2 border-black pl-6 py-1 flex flex-col gap-4">
          <span className={ui.label}>
            What needs fixing
          </span>
          {reasons && reasons.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {reasons.map((r) => (
                <li key={r} className="flex gap-3 text-sm leading-relaxed">
                  <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 bg-black" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {note && <p className={ui.help}>{note}</p>}
        </div>
      )}

      <p className={ui.help}>{copy.body}</p>

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
        <button type="button" onClick={() => setOpen(true)} className={cn(ui.btnPrimary, 'py-5 sm:min-w-[240px]')}>
          Improve this item
        </button>
        <button type="button" onClick={onResubmit} disabled={submitting} className={cn(ui.btnSecondary, 'py-5')}>
          {submitting ? 'Sending' : 'Send back as is'}
        </button>
      </div>
    );
  }

  const busy = saving || submitting;

  return (
    <div className="flex flex-col gap-10 border-t border-black/10 pt-12">
      <div className="flex flex-col gap-3">
        <label className={ui.label}>
          Add photos
        </label>
        <input
          type="file" accept="image/*" multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm file:mr-4 file:border file:border-black file:bg-white file:px-5 file:py-3 file:text-[11px] file:font-black file:uppercase file:tracking-[0.2em] hover:file:bg-black hover:file:text-white file:transition-colors"
        />
        <p className={ui.help}>
          {files.length > 0
            ? `${files.length} ${files.length === 1 ? 'photo' : 'photos'} will be added`
            : 'These are added to your existing photos, not swapped for them.'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className={ui.label}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Fit, material, how it runs, anything a photo cannot show."
          className="w-full border border-black/20 bg-white p-4 text-sm leading-relaxed placeholder:text-black/35 focus:border-black focus:outline-none"
        />
      </div>

      {saveError && (
        <p className={ui.error}>{saveError}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <button type="button" onClick={saveAndResend} disabled={busy} className={cn(ui.btnPrimary, 'py-5 sm:min-w-[240px]')}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Sending' : 'Send back to us'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={cn(ui.btnSecondary, 'py-5')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
