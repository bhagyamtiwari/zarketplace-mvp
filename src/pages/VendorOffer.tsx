// The offer, the agreement and the confirmation: the three screens between
// our number and a vendor's item going on sale.
//
// The offer screen shows the item it is for, our one number, and what saying
// yes means. There is no breakdown to expand, no working shown, and no resale
// price anywhere on the page: not hidden behind a toggle, not in the markup,
// not in the data this page fetches. A vendor agrees to what we will pay them.
// What we later sell it for is not part of that agreement and is not theirs
// to see.
//
// The agreement is a separate screen rather than a checkbox under the number,
// because it is a legal record and it should feel like one. It is also where
// we ask, once, for everything we need to pay the vendor and to raise the
// purchase invoice if we buy the item: name, mobile number, UPI ID (typed
// twice, then fixed) and their pickup address. Accepting is one
// action that writes the acceptance, the signed clauses and those details
// together (accept_acquisition_offer).

import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { ui } from '../lib/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { encodeVariants, variantUrl } from '../lib/images';
import { RequireAuth } from '../components/RequireAuth';
import { VPA_REGEX } from '../components/UpiVpaInput';
import { usePageMeta, META } from '../lib/pageMeta';
import { resolvePincode } from '../lib/pincode';
import { scrollToTop } from '../lib/scrollToTop';
import { cn, formatCurrency } from '../lib/utils';
import { trackEvent } from '../lib/analytics';
import {
  getVendorOffer, acceptOffer, rejectOffer, resubmitListing, canResubmit,
  AGREEMENT_CLAUSES, type VendorOffer, type AcceptanceDetails,
} from '../lib/acquisition';

const CONTACT_EMAIL = 'contact@zarketplace.com';
const WHATSAPP_URL = 'https://wa.me/918505927538';

export function VendorOfferPage() {
  usePageMeta(META.offer);
  return (
    <RequireAuth message="Sign in to see your offer.">
      <VendorOfferInner />
    </RequireAuth>
  );
}

/**
 * What this page reads about the item: enough to recognise it. Never its
 * price or sale price, which is what we sell it for and not the vendor's.
 */
interface OfferItem {
  title: string | null;
  brand: string | null;
  sku: string | null;
  image_urls: string[] | null;
  image_url: string | null;
  size_type: string | null;
  size: string | null;
  condition: string | null;
}
const ITEM_COLUMNS = 'title, brand, sku, image_urls, image_url, size_type, size, condition';

type Phase = 'offer' | 'agreement' | 'done';

const EMPTY_DETAILS: AcceptanceDetails = {
  fullName: '', phone: '', upiVpa: '', address: '', landmark: '', city: '', pincode: '',
};

/** A mobile number as ten digits, whether typed plain, with +91 or with a leading 0. */
function tenDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}

/** The first thing still needed before accepting, in the order the page asks for it. */
function whatIsMissing(
  d: AcceptanceDetails, upiConfirm: string, lockedUpi: string | null, checked: Record<string, boolean>,
): string | null {
  if (d.fullName.trim().length < 2) return 'Add your full name.';
  if (!/^[6-9]\d{9}$/.test(tenDigits(d.phone))) return 'Add your 10-digit mobile number.';
  if (!lockedUpi) {
    if (!VPA_REGEX.test(d.upiVpa.trim())) return 'Add your UPI ID, like name@okaxis.';
    if (d.upiVpa.trim().toLowerCase() !== upiConfirm.trim().toLowerCase()) return 'Type your UPI ID a second time. The two do not match yet.';
  }
  if (d.address.trim().length < 5) return 'Add your pickup address.';
  if (!/^[1-9]\d{5}$/.test(d.pincode.trim())) return 'Add your 6-digit pincode.';
  if (!resolvePincode(d.pincode).stateName) return 'We do not recognise that pincode. Check it.';
  if (d.city.trim().length < 2) return 'Add your city.';
  if (!AGREEMENT_CLAUSES.every((c) => checked[c.key])) return 'Tick all three terms.';
  return null;
}

function VendorOfferInner() {
  const { listingId = '' } = useParams();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  const [offer, setOffer] = React.useState<VendorOffer | null>(null);
  const [item, setItem] = React.useState<OfferItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>('offer');
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [details, setDetails] = React.useState<AcceptanceDetails>(EMPTY_DETAILS);
  const [upiConfirm, setUpiConfirm] = React.useState('');
  // Set once "Accept" has been pressed, so what is missing is only pointed
  // out to someone who has tried.
  const [tried, setTried] = React.useState(false);
  const [paidTo, setPaidTo] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [o, l] = await Promise.all([
        getVendorOffer(listingId),
        supabase.from('listings').select(ITEM_COLUMNS).eq('id', listingId).maybeSingle(),
      ]);
      if (!alive) return;
      setOffer(o);
      setItem((l.data as OfferItem | null) ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [listingId]);

  // Filled in from the account once, so someone who has accepted before
  // only has to check what is already there.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    const a = profile.pickup_address ?? {};
    setDetails({
      fullName: profile.full_name ?? '',
      phone: tenDigits(profile.phone ?? ''),
      upiVpa: profile.payout_locked_at ? '' : (profile.default_upi_vpa ?? ''),
      address: a.address ?? '',
      landmark: a.landmark ?? '',
      city: a.city ?? '',
      pincode: a.pincode ?? '',
    });
  }, [profile]);

  // Confirmed at a first acceptance and fixed from then on.
  const lockedUpi = profile?.payout_locked_at && profile.default_upi_vpa ? profile.default_upi_vpa : null;
  const missing = whatIsMissing(details, upiConfirm, lockedUpi, checked);

  const onAccept = async () => {
    setTried(true);
    setError(null);
    if (missing) return;
    setSubmitting(true);
    try {
      const res = await acceptOffer(listingId, {
        ...details,
        phone: tenDigits(details.phone),
        upiVpa: lockedUpi ? '' : details.upiVpa.trim(),
      });
      setPaidTo(res.upi_vpa ?? null);
      trackEvent('acquisition_offer_accepted', { listing_id: listingId });
      void refreshProfile();
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
    return (
      <Shell>
        <Accepted
          item={item}
          amount={offer.offer_amount}
          paidTo={paidTo ?? lockedUpi}
          justNow={phase === 'done'}
        />
      </Shell>
    );
  }

  if (offer.offer_status === 'pending_pricing') {
    return (
      <Shell>
        <Waiting title={item?.title ?? 'your item'} round={offer.offer_round} />
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
            item={item}
            amount={offer.offer_amount ?? 0}
            expiresAt={offer.offer_expires_at}
            onContinue={() => { setPhase('agreement'); scrollToTop(); }}
            onDecline={onReject}
            submitting={submitting}
          />
        : <AgreementScreen
            item={item}
            amount={offer.offer_amount ?? 0}
            email={user?.email ?? profile?.email ?? null}
            details={details}
            setDetails={setDetails}
            upiConfirm={upiConfirm}
            setUpiConfirm={setUpiConfirm}
            lockedUpi={lockedUpi}
            checked={checked}
            onToggle={(k) => setChecked((c) => ({ ...c, [k]: !c[k] }))}
            problem={error ?? (tried ? missing : null)}
            submitting={submitting}
            onBack={() => { setPhase('offer'); scrollToTop(); }}
            onAccept={onAccept}
          />}
      {phase === 'offer' && error && <ErrorNote>{error}</ErrorNote>}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

/** A centred column, like the sell form and its confirmation: this is the same short flow, continued. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell-form pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/vendor-portal" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-10">
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

function photosOf(item: OfferItem | null): string[] {
  if (!item) return [];
  const list = (item.image_urls ?? []).filter(Boolean);
  return list.length ? list : item.image_url ? [item.image_url] : [];
}

/** "Birkenstock Arizona, size 42, Great condition": the item as the vendor described it. */
function itemFacts(item: OfferItem | null): string {
  if (!item) return '';
  const size = item.size_type?.trim() || item.size?.trim();
  return [size ? `Size ${size}` : null, item.condition ? `${item.condition} condition` : null]
    .filter(Boolean).join(', ');
}

/** Every photo the vendor sent, in a row that scrolls sideways on a phone. */
function ItemPhotos({ item }: { item: OfferItem | null }) {
  const photos = photosOf(item);
  if (!photos.length) return null;
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      {photos.map((u, i) => (
        <div key={`${u}-${i}`} className="aspect-[3/4] w-[42%] shrink-0 snap-start overflow-hidden bg-zinc-100 sm:w-[31%]">
          <img src={variantUrl(u, 'grid')} alt={i === 0 ? (item?.title ?? '') : ''}
            className="h-full w-full object-cover" referrerPolicy="no-referrer" loading={i < 3 ? 'eager' : 'lazy'} />
        </div>
      ))}
    </div>
  );
}

/** The item in one line with its cover photo, so every step says which item this is. */
function ItemLine({ item }: { item: OfferItem | null }) {
  const cover = photosOf(item)[0];
  const facts = itemFacts(item);
  return (
    <div className="flex items-center gap-4">
      {cover && (
        <div className="aspect-[3/4] w-14 shrink-0 overflow-hidden bg-zinc-100">
          <img src={variantUrl(cover, 'thumb')} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-bold leading-snug">{item?.title ?? 'Your item'}</span>
        <span className="text-sm">{[item?.sku, facts].filter(Boolean).join(', ')}</span>
      </div>
    </div>
  );
}

/** Where to ask, with the item's code so we can find it straight away. */
function Questions({ code, className }: { code: string | null | undefined; className?: string }) {
  const subject = encodeURIComponent(code ? `My offer for ${code}` : 'My offer');
  return (
    <p className={cn('text-sm leading-relaxed', className)}>
      Questions? Email{' '}
      <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}`} className={cn(ui.link, 'font-bold')}>{CONTACT_EMAIL}</a>
      {code && <> with <span className="font-bold">{code}</span></>}, or{' '}
      <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className={cn(ui.link, 'font-bold')}>WhatsApp us</a>.
    </p>
  );
}

/**
 * The offer, the item it is for, and the six facts that make it safe to say
 * yes. The number leads but does not shout: the amount sits on the left with
 * the item it buys beside it, so the two are read as one statement rather
 * than a headline and a caption.
 *
 * The last two facts are the ones a vendor otherwise finds out later: that we
 * set the sale price and may move it, and that their number does not move
 * with it. Saying so here is both fairer and the principal model stated
 * plainly, so it belongs above the button, not in the small print.
 */
export function OfferScreen({
  item, amount, expiresAt, onContinue, onDecline, submitting,
}: {
  item: OfferItem | null; amount: number; expiresAt: string | null;
  onContinue: () => void; onDecline: () => void; submitting: boolean;
}) {
  const facts = itemFacts(item);
  return (
    <div className="flex flex-col gap-10">
      <ItemPhotos item={item} />

      <div className="flex flex-col gap-5">
        <h1 className="text-sm font-bold">Your payout{item?.sku ? ` for ${item.sku}` : ''}</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <span className="text-4xl sm:text-5xl font-black tracking-tighter leading-none tabular-nums">
            {formatCurrency(amount)}
          </span>
          <span className="text-sm leading-snug sm:max-w-[58%] sm:text-right">
            <span className="font-bold">{item?.title ?? 'Your item'}</span>
            {facts && <>, {facts}</>}
          </span>
        </div>
        {expiresAt && (
          <p className={ui.help}>
            Yours to accept until{' '}
            <span className="font-bold">
              {new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
            </span>.
          </p>
        )}
      </div>

      <Bullets items={[
        <><strong>This is your payout.</strong> It is fixed and does not change.</>,
        'The item stays with you until someone buys it.',
        'Then we email you a free prepaid label, and a courier collects it from your door.',
        'We pay you by UPI once it reaches our hub and matches your photos.',
        'Once you accept, it goes on sale at a price we set. We may reduce that price to sell it, and what we pay you stays the same.',
        'If we have not sold it within 30 days, the offer ends and nothing is owed either way.',
      ]} />

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button type="button" onClick={onContinue} disabled={submitting} className={cn(ui.btnPrimary, 'w-full py-5 sm:w-auto sm:min-w-[240px]')}>
          Accept this offer
        </button>
        <button type="button" onClick={onDecline} disabled={submitting} className={cn(ui.btnSecondary, 'w-full py-5 sm:w-auto')}>
          No thanks
        </button>
      </div>

      <Questions code={item?.sku} className="text-center" />
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

/** One numbered part of the agreement screen. */
function Step({ n, title, note, children }: { n: number; title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex gap-4">
        <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black leading-none text-white">
          {n}
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-bold leading-snug">{title}</h2>
          {note && <p className="text-sm leading-relaxed">{note}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-5 sm:pl-10">{children}</div>
    </section>
  );
}

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={ui.label}>
        {label}{optional && <span className="font-normal"> (optional)</span>}
      </span>
      {hint && <span className="text-xs">{hint}</span>}
      {children}
    </label>
  );
}

/**
 * Accepting, in four numbered parts: who you are, where we pay you, where we
 * collect from, and the terms. Each is asked once; next time, all but the
 * ticks are filled in from the account.
 *
 * The three ticks are separate decisions, never pre-ticked and never an
 * "accept all": the record has to reflect three decisions, because that is
 * what it will be read as later.
 */
export function AgreementScreen({
  item, amount, email, details, setDetails, upiConfirm, setUpiConfirm, lockedUpi,
  checked, onToggle, problem, submitting, onBack, onAccept,
}: {
  item: OfferItem | null;
  amount: number;
  email: string | null;
  details: AcceptanceDetails;
  setDetails: React.Dispatch<React.SetStateAction<AcceptanceDetails>>;
  upiConfirm: string;
  setUpiConfirm: (v: string) => void;
  lockedUpi: string | null;
  checked: Record<string, boolean>;
  onToggle: (k: string) => void;
  problem: string | null;
  submitting: boolean;
  onBack: () => void;
  onAccept: () => void;
}) {
  const set = (key: keyof AcceptanceDetails) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDetails((d) => ({ ...d, [key]: value }));
  };
  const place = details.pincode.length === 6 ? resolvePincode(details.pincode) : null;
  const upiTyped = details.upiVpa.trim();
  const upiMatches = !!upiConfirm && upiTyped.toLowerCase() === upiConfirm.trim().toLowerCase();
  // The second UPI box has to be typed, not pasted: a pasted copy repeats a
  // typo instead of catching it.
  const noPaste = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();
  const plain = { autoComplete: 'off', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <h1 className={ui.pageTitle}>Accept {formatCurrency(amount)}</h1>
        <ItemLine item={item} />
      </div>

      <Step
        n={1}
        title="Your details"
        note="For your invoice, and so the courier can reach you. Anything already filled in came from your account, so check it and change what is wrong."
      >
        <Field label="Full name" hint="As on your UPI or bank account.">
          <input
            value={details.fullName} onChange={set('fullName')} autoComplete="name"
            placeholder="Your full name" className={ui.inputBox}
          />
        </Field>
        <Field label="Mobile number" hint="So the courier can reach you on collection day.">
          <div className="flex items-center gap-2 border border-black/25 bg-zinc-50 px-3.5 transition-colors focus-within:border-black focus-within:bg-white">
            <span className="text-sm">+91</span>
            <input
              type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210"
              value={details.phone}
              // Up to 12 digits are taken, so a number typed or pasted with
              // its 91 (or a 0) in front settles to the right ten rather than
              // being cut short.
              onChange={(e) => { const v = tenDigits(e.target.value.replace(/\D/g, '').slice(0, 12)); setDetails((d) => ({ ...d, phone: v })); }}
              className="w-full bg-transparent py-3 text-sm text-black placeholder:text-black/35 focus:outline-none"
            />
          </div>
        </Field>
        {email && <p className="text-sm">We email your label and updates to <span className="font-bold">{email}</span>.</p>}
      </Step>

      <Step
        n={2}
        title="Where we pay you"
        note={lockedUpi ? undefined : <>Check it carefully. Once you accept, it can only be changed by contacting us.</>}
      >
        {lockedUpi ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm">We pay you by UPI to <span className="font-bold">{lockedUpi}</span>.</p>
            <p className="text-sm">To change it, email <a href={`mailto:${CONTACT_EMAIL}`} className={ui.link}>{CONTACT_EMAIL}</a>.</p>
          </div>
        ) : (
          <>
            <Field label="UPI ID" hint="The one you use on GPay, PhonePe or Paytm.">
              <input value={details.upiVpa} onChange={set('upiVpa')} placeholder="name@okaxis" {...plain} className={ui.inputBox} />
            </Field>
            <p className="text-sm leading-relaxed">
              Do not know your UPI ID? Open your UPI app, GPay, PhonePe or Paytm, and look under your
              profile or payment settings. It looks like <span className="font-bold">name@okaxis</span>.
            </p>
            <Field label="Type your UPI ID again" hint="Typed, not pasted, so a typo gets caught here.">
              <input
                value={upiConfirm} onChange={(e) => setUpiConfirm(e.target.value)} onPaste={noPaste} onDrop={noPaste}
                placeholder="name@okaxis" {...plain} className={ui.inputBox}
              />
              {upiConfirm && (
                <span className={cn('text-sm font-bold', upiMatches ? 'text-emerald-700' : 'text-red-600')}>
                  {upiMatches ? 'Matches.' : 'Does not match yet.'}
                </span>
              )}
            </Field>
          </>
        )}
      </Step>

      <Step n={3} title="Your pickup address" note="Where the courier collects from, only once someone buys it.">
        <Field label="Flat, house number and street">
          <input
            value={details.address} onChange={set('address')} autoComplete="street-address"
            placeholder="Flat 4B, 12 Linking Road" className={ui.inputBox}
          />
        </Field>
        <Field label="Area or landmark" optional>
          <input value={details.landmark} onChange={set('landmark')} placeholder="Near the post office" className={ui.inputBox} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pincode">
            <input
              inputMode="numeric" autoComplete="postal-code" maxLength={6} value={details.pincode}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setDetails((d) => ({ ...d, pincode: v })); }}
              placeholder="400050" className={ui.inputBox}
            />
            {place && (
              <span className={cn('text-sm', !place.stateName && 'font-bold text-red-600')}>
                {place.stateName ?? 'We do not recognise this pincode.'}
              </span>
            )}
          </Field>
          <Field label="City">
            <input
              value={details.city} onChange={set('city')} autoComplete="address-level2"
              placeholder="Mumbai" className={ui.inputBox}
            />
          </Field>
        </div>
      </Step>

      <Step n={4} title="The terms" note="Tick each one. We keep a copy of what you agreed to.">
        <ul className="flex flex-col border-t border-black/10">
          {AGREEMENT_CLAUSES.map((clause) => {
            const on = !!checked[clause.key];
            return (
              <li key={clause.key} className="border-b border-black/10">
                <button
                  type="button"
                  onClick={() => onToggle(clause.key)}
                  aria-pressed={on}
                  className="group flex w-full items-start gap-4 py-4 text-left"
                >
                  <span className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors',
                    on ? 'border-black bg-black text-white' : 'border-black/25 group-hover:border-black',
                  )}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="text-sm leading-relaxed">{clause.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-3">
          <span className={ui.label}>Also part of this agreement</span>
          <Bullets items={[
            <>We pay you <strong>{formatCurrency(amount)}</strong> by UPI once it reaches our hub and matches your photos. The amount does not change.</>,
            'We set the price we sell it at, and we may reduce it. What we pay you stays the same.',
            'Until someone buys it, keep it packed and unworn, and do not sell it anywhere else.',
            'When it is bought, we email you a free prepaid label, and a courier collects it from your door, usually within 48 hours.',
            <>Hand it over within <strong>5 days</strong> of the sale.</>,
            'Counterfeits and replicas are refused and not paid for.',
            'If we have not sold it within 30 days, the offer ends and nothing is owed either way.',
            'You can withdraw it from Your items any time before someone buys it.',
          ]} />
          <p className="text-sm">
            The full terms are on <Link to="/how-it-works" className={cn(ui.link, 'font-bold')}>How selling works</Link>.
          </p>
        </div>
      </Step>

      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <button type="button" onClick={onAccept} disabled={submitting} className={cn(ui.btnPrimary, 'w-full py-5 sm:w-auto sm:min-w-[240px]')}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Recording' : `Accept ${formatCurrency(amount)}`}
          </button>
          <button type="button" onClick={onBack} disabled={submitting} className={cn(ui.btnSecondary, 'w-full py-5 sm:w-auto')}>
            Back
          </button>
        </div>
        {problem && <p role="alert" className={cn(ui.error, 'text-center')}>{problem}</p>}
      </div>

      <Questions code={item?.sku} className="text-center" />
    </div>
  );
}

/**
 * After accepting, and whenever an accepted offer is opened again: what was
 * agreed, where the money goes, and the one thing to do now, which is
 * nothing until someone buys it.
 */
export function Accepted({ item, amount, paidTo, justNow }: {
  item: OfferItem | null; amount: number | null; paidTo: string | null; justNow: boolean;
}) {
  const payout = amount != null ? formatCurrency(amount) : 'the agreed amount';
  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center bg-black text-white">
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className={ui.pageTitle}>{justNow ? 'Offer accepted' : 'You accepted this offer'}</h1>
          <p className="text-[15px] leading-relaxed">
            {justNow ? 'It goes on sale shortly. ' : ''}Nothing to do until someone buys it.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 border border-black/15 p-5">
        <ItemLine item={item} />
        <dl className="flex flex-col gap-2 border-t border-black/10 pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Your payout</dt>
            <dd className="font-bold">{payout}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Paid by UPI to</dt>
            <dd className="font-bold text-right break-all">{paidTo ?? 'Not on file yet'}</dd>
          </div>
        </dl>
        {!paidTo && (
          <p className="text-sm">
            Email your UPI ID to <a href={`mailto:${CONTACT_EMAIL}`} className={cn(ui.link, 'font-bold')}>{CONTACT_EMAIL}</a>
            {item?.sku && <> with <span className="font-bold">{item.sku}</span></>}, so we can pay you.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-6" aria-labelledby="now-heading">
        <h2 id="now-heading" className={ui.sectionTitle}>What happens now</h2>
        <ol className="flex flex-col gap-5">
          {[
            'Keep it packed and unworn, and do not sell it anywhere else.',
            'When someone buys it, we email you a free prepaid label, and a courier collects it from your door.',
            'Hand it over within 5 days of the sale.',
            `We pay you ${payout} by UPI once it reaches our hub and matches your photos.`,
          ].map((line, i) => (
            <li key={line} className="flex gap-4">
              <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black leading-none text-white">
                {i + 1}
              </span>
              <span className="text-[15px] leading-relaxed">{line}</span>
            </li>
          ))}
        </ol>
        <p className="border-t border-black/10 pt-6 text-sm leading-relaxed">
          <span className="font-bold">Changed your mind?</span> Withdraw it from Your items any time before someone buys it.
        </p>
      </section>

      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link to="/sell" className={ui.btnPrimary}>Sell another item</Link>
          <Link to="/vendor-portal" className={ui.btnSecondary}>Your items</Link>
        </div>
        <Questions code={item?.sku} />
      </div>
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
