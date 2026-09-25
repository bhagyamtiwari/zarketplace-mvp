// Sell page. Three steps: Photos -> Description -> Condition.
//
// The form asks for what we need in order to price the item, and nothing else.
// That line moved when we started taking physical possession: anything we can
// see for ourselves when the parcel is opened is not worth a field here. Tags,
// packaging, alterations and how often something was worn were all questions a
// vendor answered about an object we were about to hold in our hands, so they
// are gone. What survives is what a photograph cannot settle and an operator
// needs before quoting: what it is, whose it is for, what size, what condition,
// and what is wrong with it.
//
// No payout data is collected here. UPI, Instagram and the pickup address are
// asked for once, at the seller's first sale, in PayoutDetailsForm - see the
// gate in SellerPortal. A brand new seller can publish with nothing but their
// photos and the item itself.
//
// Per-listing requirements:
//   * Every listing is exactly one physical item - no multi-size/bulk/
//     wholesale listings. Enforced with a banned-phrase check, not just a
//     notice, since that's the highest-priority rule for a P2P marketplace.

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Check, X, Plus, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ui } from '../lib/ui';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { getShippingCategories, type ShippingCategory } from '../lib/pricing';
import { trackEvent } from '../lib/analytics';
import { CONDITIONS } from '../lib/condition';
import { log } from '../lib/log';
import { scrollToTop } from '../lib/scrollToTop';
import { normalizePhoto } from '../lib/images';
import { uploadListingPhoto } from '../lib/listingPhotos';
import { usePhotoDrop } from '../lib/photoDrop';
import { removeBackground } from '../lib/backgroundRemoval';
import { usePageMeta, META } from '../lib/pageMeta';
import { resolvePincode } from '../lib/pincode';
import { cn, formatCurrency } from '../lib/utils';
import { CATEGORY_SIZES } from '../lib/sizes';
import { LaunchOfferNote } from '../components/LaunchOfferNote';

const slog = log('sell');


// Three lines instead of six ticks. One-item is its own rule, and accuracy
// carries the photos and the answers given about condition, flaws and
// authenticity (asked as its own Yes or No beside flaws, so this line cannot
// claim the item is genuine for a vendor who answered No). The binding version
// is the agreement at offer acceptance.
const PUBLISH_CONFIRMATIONS: Array<{ key: string; label: string }> = [
  { key: 'oneItem', label: 'This is one item, and it is mine to sell.' },
  { key: 'accurate', label: 'The photos are of this item, and I have answered honestly about its condition, flaws and authenticity.' },
  // The one the patient lane actually runs on. A listing is a promise that the
  // item is sitting somewhere, in the state described, ready to go: the two
  // ways that breaks are selling it elsewhere and wearing it in the meantime,
  // and both look identical to us until a courier arrives at an empty door.
  {
    key: 'heldReady',
    label: 'If I accept an offer, I will keep this item packed and unworn, in the condition I described, and will not sell it anywhere else until it is bought or I withdraw it.',
  },
];

// What happens next, in the order it happens. Numbered because it is a
// sequence: the most common patient-lane mistake is doing step four at step
// two, posting the item the day the offer is accepted.
//
// Written to keep the model straight (MODEL.md section 2, COPY_RULES.md). We
// make the offer and it is a fixed amount; the vendor's number is a payout,
// never a share of anything. We are the ones who sell the item, so it is "if
// we have not sold it", never "if your listing does not sell". And the vendor
// withdraws their item, not "their listing": they do not run a listing on
// zarketplace, they have agreed to sell us one item.
//
// Every number here matches the database and the policy pages: 7 days to
// accept (acquisition_config.offer_valid_days), 30 days on the site
// (listing_window_days), 5 days to hand it over (fulfillment_config
// .ship_by_days). The 48 hours is the courier's usual collection time, which
// sits inside those 5 days rather than replacing them.
const WHAT_HAPPENS_NEXT: Array<{ title: string; points: string[] }> = [
  // Making the offer and deciding on it used to be two steps. They are one
  // here because they are one wait: nothing is asked of the vendor between
  // them, and a four-step list is read where a five-step list is skimmed.
  {
    title: 'We make you an offer',
    points: [
      'A fixed amount in rupees. This is your payout, and it does not change.',
      'You have 7 days to accept it. Saying no costs you nothing.',
    ],
  },
  {
    title: 'The item stays with you until someone buys it',
    points: [
      'Keep it packed, unworn and as you described it.',
      'Do not sell it anywhere else.',
    ],
  },
  {
    title: 'When it is bought, we email you a free prepaid label',
    points: [
      'A courier collects it from your door, usually within 48 hours.',
      'Hand it over within 5 days, and send the exact item in your photos.',
      'If email does not reach you, we may message you on WhatsApp.',
    ],
  },
  {
    title: 'You are paid when it reaches our hub',
    points: [
      'We check it against your photos, then pay you the agreed amount.',
    ],
  },
];

const WHAT_HAPPENS_NOTES: Array<{ title: string; body: string }> = [
  {
    title: 'Changed your mind?',
    body: 'Withdraw your item from Your items any time until someone buys it.',
  },
  {
    title: 'If we have not sold it',
    body: 'After 30 days unsold, the offer expires and the item stays yours. Nothing is owed either way.',
  },
  {
    title: 'No GSTIN needed',
    body: 'You do not need a GSTIN to sell to us. We may ask to keep your PAN card on file.',
  },
];

// Recommended photo order - purely a labeling/placeholder aid over the same
// image array (index 0 is still the cover). Not a hard per-slot requirement.
// These are the instruction: they say what to shoot, so no paragraph above the
// grid has to.
// MODEL.md §9: completeness, not beauty. The first three settle what the item
// actually is, and we reject for a missing angle but never for bad lighting.
// A phone photo in a bedroom is what a buyer wants to see on used clothing;
// consistency comes from processing at upload, not from the vendor's camera.
const PHOTO_SLOTS: Array<{ label: string; required: boolean; hint?: string }> = [
  { label: 'Front of item', required: true },
  { label: 'Back of item', required: true },
  // The one label that says both what size it is and, usually, who made it.
  { label: 'Size tag', required: true, hint: 'At the neck, or inside the waistband or leg' },
  { label: 'Brand label', required: false, hint: 'If it is separate from the size tag' },
  { label: 'Close-up detail', required: false },
  { label: 'Any flaws', required: false },
];
const REQUIRED_PHOTOS = PHOTO_SLOTS.filter((p) => p.required).length;

// MODEL.md §8: "it didn't fit" is the biggest single cause of returns in used
// clothing, and a tag size does not prevent it. A vintage L and a modern L are
// different garments, so the listing carries the item measured flat instead.
//
// Required where fit is least predictable and optional elsewhere, because
// making someone measure a belt to sell it is how you lose the listing.
type Measure = { key: MeasureKey; label: string; how: string; step?: number };

// The same ceilings the database enforces, in centimetres. Duplicated here on
// purpose: without them an inch typo converts to something over the limit and
// the vendor meets a Postgres constraint error at submit instead of a sentence
// telling them what is wrong.
const MAX_CM: Record<MeasureKey, number> = {
  pit_to_pit_cm: 200, length_cm: 250, sleeve_cm: 150, waist_cm: 200, inseam_cm: 150, outseam_cm: 200,
};

// What the vendor types in. Centimetres is what we store: the column names,
// the sanity bounds and any future size filter are all in cm, so inches are a
// front-of-house convenience converted once on the way out.
type MeasureUnit = 'cm' | 'in';
const CM_PER_INCH = 2.54;
const toCm = (value: string, unit: MeasureUnit): number | null => {
  const n = Number(value);
  if (!(n > 0)) return null;
  // Rounded to a millimetre. A tape is not more precise than that, and a
  // listing reading 51.943 cm is false precision.
  return Math.round((unit === 'in' ? n * CM_PER_INCH : n) * 10) / 10;
};
// The drawing for each garment shape, keyed by category. The numbers printed on
// each one match the step on the fields above, which is what lets the two be
// read together.
const MEASURE_GUIDES: Record<string, { src: string; alt: string }> = {
  Tops: {
    src: 'measure-tops',
    alt: 'How to measure a top or outerwear: 1, pit to pit, straight across the chest from armpit to armpit. 2, length, from the top of the shoulder down to the hem. 3, sleeve, from the shoulder seam to the end of the cuff.',
  },
  Outerwear: {
    src: 'measure-tops',
    alt: 'How to measure a top or outerwear: 1, pit to pit, straight across the chest from armpit to armpit. 2, length, from the top of the shoulder down to the hem. 3, sleeve, from the shoulder seam to the end of the cuff.',
  },
  Bottoms: {
    src: 'measure-bottoms',
    alt: 'How to measure trousers: 1, waist, straight across the waistband. 2, inseam, from the crotch seam down to the hem. 3, outseam, from the top of the waistband down the outside of the leg to the hem.',
  },
};

type MeasureKey = 'pit_to_pit_cm' | 'length_cm' | 'sleeve_cm' | 'waist_cm' | 'inseam_cm' | 'outseam_cm';

const MEASUREMENTS_BY_CATEGORY: Record<string, { required: Measure[]; optional: Measure[] }> = {
  Tops: {
    required: [
      { key: 'pit_to_pit_cm', label: 'Pit to pit (chest)', how: 'Lay it flat and measure straight across from one armpit seam to the other.', step: 1 },
      { key: 'length_cm', label: 'Length', how: 'From the highest point of the shoulder straight down to the hem.', step: 2 },
    ],
    optional: [
      { key: 'sleeve_cm', label: 'Sleeve', how: 'From the shoulder seam to the end of the cuff.', step: 3 },
    ],
  },
  Outerwear: {
    required: [
      { key: 'pit_to_pit_cm', label: 'Pit to pit (chest)', how: 'Lay it flat and measure straight across from one armpit seam to the other.', step: 1 },
      { key: 'length_cm', label: 'Length', how: 'From the highest point of the shoulder straight down to the hem.', step: 2 },
    ],
    optional: [
      { key: 'sleeve_cm', label: 'Sleeve', how: 'From the shoulder seam to the end of the cuff.', step: 3 },
    ],
  },
  // Waist and inseam are what fit a pair of trousers, so both are required;
  // outseam adds little once those two are known.
  Bottoms: {
    required: [
      { key: 'waist_cm', label: 'Waist', how: 'Button them, lay flat, and measure straight across the top of the waistband.', step: 1 },
      { key: 'inseam_cm', label: 'Inseam', how: 'From the crotch seam down to the bottom of the leg.', step: 2 },
    ],
    optional: [
      { key: 'outseam_cm', label: 'Outseam', how: 'From the top of the waistband down the outside of the leg to the hem.', step: 3 },
    ],
  },
  Shoes: { required: [], optional: [] },
  Accessories: { required: [], optional: [] },
};

const measurementsFor = (category: string) =>
  MEASUREMENTS_BY_CATEGORY[category] ?? { required: [], optional: [] };
const PHOTO_SLOT_LABELS = PHOTO_SLOTS.map((p) => p.label);

// Highest-priority rule: one listing = one physical item. Checked
// case-insensitively across title/brand/description.
const BANNED_PHRASES = [
  'available in all sizes', 'all sizes available', 'multiple colours available',
  'multiple colors available', 'dm for other colors', 'dm for other colours',
  'dm for more', 'bulk available', 'wholesale', 'many pieces available',
  'several available', 'available in multiple',
];

function findBannedPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.find((p) => lower.includes(p)) ?? null;
}

// How an item reaches our hub. Both choices are our courier on our prepaid
// label - they differ only in who absorbs the delivery cost, so they stay one
// shipping_mode with free_shipping deciding the payer.
//
// A vendor shipping with their own courier is no longer possible: every item
// has to come in to us, be checked, and be repacked before it goes out. The
// self_ship mode is kept in the type only because existing rows still carry it;
// it is not offered.
type ShippingMode = 'platform' | 'self_ship';

// No shipping choice is offered any more. Delivery on both legs is ours and is
// already inside the amount we offer, so asking a vendor who should absorb it
// was asking about a number they never see and cannot change.

// The shipping category is derivable from the item category the vendor has
// already chosen, so asking again is asking the same question twice in
// different words. Applied as a default the vendor can still override, since
// a heavy knit top genuinely does post like outerwear.
const CATEGORY_TO_SHIPPING: Record<string, string> = {
  Tops: 'tops',
  Bottoms: 'bottoms',
  Outerwear: 'outerwear',
  Accessories: 'accessories',
  Shoes: 'footwear',
};

// One per named angle. The cap used to be 8 while only 6 boxes were ever
// drawn, so the counter read "0/8" against six slots.
const MAX_IMAGES = PHOTO_SLOTS.length;

// Three steps. The last one used to be "Condition & price" and no longer holds
// a price: a vendor names no number at all now, so the step carries condition,
// how the item reaches us, and the two confirmations.
const STEP_LABELS = ['Photos', 'Description', 'Condition'];

type Declarations = Record<string, boolean>;

/** Every confirmation unticked. The only place this shape is built. */
const noDeclarations = (): Declarations =>
  Object.fromEntries(PUBLISH_CONFIRMATIONS.map((c) => [c.key, false]));

export function Sell() {
  usePageMeta(META.sell);

  return (
    <RequireAuth message="Sign in to get an offer." signedOut={(openSignIn) => <SellIntro onStart={openSignIn} />}>
      <SellInner />
    </RequireAuth>
  );
}

export function SellInner({ initialStep = 0 }: { initialStep?: number } = {}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [step, setStep] = React.useState(initialStep);
  const [stepError, setStepError] = React.useState<string | null>(null);
  // Set when "Get my offer" is pressed with a confirmation unticked: the
  // unticked ones are then marked as required, the way a required field is.
  const [showRequired, setShowRequired] = React.useState(false);
  // Compressing eight photos takes a few seconds on a mid-range phone. A
  // spinner with no count reads as a hang, so say which photo we are on.
  const [uploadProgress, setUploadProgress] = React.useState<{ done: number; total: number } | null>(null);

  const [imageFiles, setImageFiles] = React.useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = React.useState<string[]>([]);
  // What the vendor actually uploaded, kept per index so "use original" can
  // put it back. Only populated where background removal produced something.
  const [originals, setOriginals] = React.useState<Record<number, { file: File; preview: string }>>({});
  const [cleaning, setCleaning] = React.useState<Record<number, boolean>>({});
  // True while picked photos are being read and resized, which on a phone can
  // take a moment per photo; the add boxes say so instead of looking dead.
  const [adding, setAdding] = React.useState(false);
  // One quiet line under the photos when something was left out, instead of
  // an alert per file.
  const [photoNote, setPhotoNote] = React.useState<string | null>(null);

  // Photos are resized, encoded and uploaded in the background from the
  // moment they are added, while the vendor fills in the rest of the form, so
  // Submit only has to wait for whatever is still in flight - usually
  // nothing. Keyed by the exact File, so a photo swapped for its cleaned
  // version (or back) uploads again and nothing else does. A failed upload
  // drops out of the cache and is retried at Submit.
  const uploadsRef = React.useRef(new Map<File, Promise<string>>());
  const uploadPhoto = React.useCallback((file: File): Promise<string> => {
    const existing = uploadsRef.current.get(file);
    if (existing) return existing;
    const job = (async () => {
      if (!user) throw new Error('Sign in first.');
      return uploadListingPhoto(file, user.id);
    })();
    uploadsRef.current.set(file, job);
    job.catch((err) => {
      uploadsRef.current.delete(file);
      slog.warn('background upload failed, will retry at submit', err);
    });
    return job;
  }, [user]);

  // Start each photo once it has settled: a photo still having its
  // background removed is about to be replaced, so it waits for that.
  React.useEffect(() => {
    imageFiles.forEach((file, i) => {
      if (!cleaning[i]) void uploadPhoto(file).catch(() => {});
    });
  }, [imageFiles, cleaning, uploadPhoto]);

  const [title, setTitle] = React.useState('');
  const [brand, setBrand] = React.useState('');
  const [gender, setGender] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('');
  const [sizeType, setSizeType] = React.useState('');
  const [sizeDetail, setSizeDetail] = React.useState('');
  const [measurements, setMeasurements] = React.useState<Partial<Record<MeasureKey, string>>>({});
  // Inches by default: it is what most people's tape and most tag charts read
  // in here. Stored in centimetres either way (see toCm).
  const [unit, setUnit] = React.useState<MeasureUnit>('in');
  const [description, setDescription] = React.useState('');

  const [condition, setCondition] = React.useState('');
  const [hasFlaws, setHasFlaws] = React.useState<boolean | null>(null);
  // The vendor's answer only. Whether the listing page says "Confirmed" is
  // decided by an operator in the admin portal.
  const [confirmsAuthentic, setConfirmsAuthentic] = React.useState<boolean | null>(null);
  const [flawsDescription, setFlawsDescription] = React.useState('');

  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  const [shippingCategory, setShippingCategory] = React.useState('');
  // Seller-funded free shipping: buyer pays no shipping line, and the real
  // courier cost is deducted from the seller's payout instead of the buyer's
  // total (see migration shipping_reprice_and_seller_free_shipping). Off by
  // default - it's a choice, not the default cost to the vendor.
  // Always 'platform': our courier on our prepaid label, with free_shipping
  // deciding who absorbs the cost. 'self_ship' is no longer offered.
  // Always our courier on our label. Kept as a constant so the column keeps
  // its shape without offering a choice that is not the vendor's to make.
  const shippingMode: ShippingMode = 'platform';
  const freeShipping = true;
  // Set once the vendor picks a shipping category themselves, so a later
  // category change stops overwriting their deliberate choice.
  const shippingCategoryTouched = React.useRef(false);
  // LastStep is a separate component, so the override flag is set here and
  // handed down as the setter rather than reaching into a ref from outside.
  const pickShippingCategory = React.useCallback((key: string) => {
    shippingCategoryTouched.current = true;
    setShippingCategory(key);
  }, []);

  // The state this item ships from. Asked here rather than inherited from the
  // pickup address, because that address is only collected at the seller's
  // first sale - a brand new seller has none, and a listing with no state
  // cannot be shown to the right buyers at all. Sticky across listings: it is
  // an account fact, not an item fact, so resetForm deliberately leaves it.
  // The pincode is the supply origin that actually counts. The state below is
  // kept for display and for the seller to sanity-check what they typed - if
  // the two disagree, the pincode is what any rule reads.

  const [declarations, setDeclarations] = React.useState<Declarations>(noDeclarations);

  React.useEffect(() => { getShippingCategories().then(setShippingCategories); }, []);

  // Prefill what repeats across a seller's own listings, from their most
  // recent one: gender, category and shipping choice. Condition, flaws, title,
  // price and size are never prefilled - those genuinely differ per item, and a stale value there would
  // be a false claim about the garment rather than a saved keystroke. Free
  // shipping is left out for the same reason: it costs the seller money, so it
  // gets decided per listing rather than inherited.
  const prefilledFromLast = React.useRef(false);
  React.useEffect(() => {
    if (!user || prefilledFromLast.current) return;
    supabase
      .from('listings')
      .select('gender, category, shipping_category, pickup_state, pickup_pincode')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        prefilledFromLast.current = true;
        if (data.gender) setGender((prev) => prev || data.gender);
        if (data.category) setSelectedCategory((prev) => prev || data.category);
        if (data.shipping_category) setShippingCategory((prev) => prev || data.shipping_category);
      });
  }, [user]);

  // Follow the item category. Falls back to the first option only when the
  // item category maps to nothing, which no current category does.
  React.useEffect(() => {
    if (shippingCategories.length === 0) return;
    if (shippingCategoryTouched.current) return;
    const derived = CATEGORY_TO_SHIPPING[selectedCategory];
    setShippingCategory((prev) => derived ?? prev ?? shippingCategories[0].key);
  }, [shippingCategories, selectedCategory]);


  // Photos picked on a phone or dragged in from a computer, however many at
  // once. The first ones up to the limit are kept and the rest left out with
  // a note, never a refusal. Each is decoded and resized here
  // (normalizePhoto), one at a time, so an iPhone HEIC, a 20 MB original or a
  // pick with no file type all just work, and background removal and upload
  // handle a small JPEG, not the original.
  const addPhotos = async (picked: File[]) => {
    if (picked.length === 0 || adding) return;
    setPhotoNote(null);

    const remaining = MAX_IMAGES - imageFiles.length;
    if (remaining <= 0) {
      setPhotoNote(`That is ${MAX_IMAGES} photos already. Remove one to add another.`);
      return;
    }
    const candidates = picked.filter((f) => !f.type || f.type.startsWith('image/'));
    const notPhotos = picked.length - candidates.length;
    const overLimit = Math.max(0, candidates.length - remaining);

    setAdding(true);
    const accepted: File[] = [];
    let unreadable = 0;
    try {
      for (const f of candidates.slice(0, remaining)) {
        try {
          accepted.push(await normalizePhoto(f));
        } catch (err) {
          slog.warn('could not read a photo', err);
          unreadable++;
        }
      }
    } finally {
      setAdding(false);
    }

    const notes: string[] = [];
    if (notPhotos > 0) notes.push(notPhotos === 1 ? 'One file is not a photo, so it was left out.' : `${notPhotos} files are not photos, so they were left out.`);
    if (overLimit > 0) notes.push(`${MAX_IMAGES} photos is the most, so the first ${remaining === 1 ? 'one was' : `${remaining} were`} added.`);
    if (unreadable > 0) notes.push(`${unreadable === 1 ? 'One photo' : `${unreadable} photos`} could not be opened. Try a screenshot of ${unreadable === 1 ? 'it' : 'them'} instead.`);
    if (notes.length) setPhotoNote(notes.join(' '));
    if (accepted.length === 0) return;

    const urls = accepted.map((f) => URL.createObjectURL(f));
    const startIndex = imageFiles.length;
    setImageFiles((prev) => [...prev, ...accepted]);
    setImagePreviews((prev) => [...prev, ...urls]);

    // Strip the background in the background, so to speak. The photo is
    // already usable and already on screen; this swaps it if and when it
    // succeeds. It can never block, never rejects a photo, and every
    // failure quietly leaves the vendor's original in place.
    accepted.forEach((file, offset) => {
      const index = startIndex + offset;
      setCleaning((prev) => ({ ...prev, [index]: true }));
      void removeBackground(file).then(({ processed }) => {
        if (processed) {
          setOriginals((prev) => ({ ...prev, [index]: { file, preview: urls[offset] } }));
          const preview = URL.createObjectURL(processed);
          setImageFiles((prev) => prev.map((f, i) => (i === index ? processed : f)));
          setImagePreviews((prev) => prev.map((u, i) => (i === index ? preview : u)));
        }
      }).finally(() => {
        setCleaning((prev) => { const next = { ...prev }; delete next[index]; return next; });
      });
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked: File[] = input.files ? Array.from(input.files) : [];
    // Cleared straight away, so the same photo can be picked again.
    input.value = '';
    void addPhotos(picked);
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setOriginals((prev) => { const next = { ...prev }; delete next[index]; return next; });
  };

  // Put back exactly what the vendor uploaded. Their photo is always one tap
  // away: we suggest a cleaner version, we never impose one.
  const useOriginal = (index: number) => {
    const original = originals[index];
    if (!original) return;
    setImageFiles((prev) => prev.map((f, i) => (i === index ? original.file : f)));
    setImagePreviews((prev) => prev.map((u, i) => (i === index ? original.preview : u)));
    setOriginals((prev) => { const next = { ...prev }; delete next[index]; return next; });
  };

  // What must be true for each step. Navigation between steps is free - this
  // only gates the final Publish, so sellers can jump ahead, fill things out
  // of order, and come back. If anything's missing at Publish time, we jump
  // to the first incomplete step and show what's needed there.
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      // Counted rather than checked slot by slot: the grid labels are a guide
      // to what to shoot, and someone who uploads four good photos in a
      // different order has done the thing we actually need.
      if (imageFiles.length < REQUIRED_PHOTOS) {
        return `Add ${REQUIRED_PHOTOS} photos: the front, the back and the size tag. We cannot price an item we cannot identify.`;
      }
    }
    if (s === 1) {
      if (!title.trim()) return 'Tell us what the item is.';
      if (!brand.trim()) return 'Add the brand.';
      if (!gender) return 'Choose who the item is for.';
      if (!selectedCategory) return 'Choose a category.';
      if (!sizeType) return 'Choose a size.';
      const { required, optional } = measurementsFor(selectedCategory);
      const missing = required.find((m) => !(Number(measurements[m.key]) > 0));
      if (missing) {
        return `Add the ${missing.label.toLowerCase()} measurement in ${unit}. ${missing.how}`;
      }
      const tooBig = [...required, ...optional].find((m) => {
        const cm = toCm(measurements[m.key] ?? '', unit);
        return cm != null && cm > MAX_CM[m.key];
      });
      if (tooBig) {
        const limit = unit === 'cm'
          ? `${MAX_CM[tooBig.key]} cm`
          : `${Math.floor(MAX_CM[tooBig.key] / CM_PER_INCH)} in`;
        return `That ${tooBig.label.toLowerCase()} measurement is over ${limit}. Check the number and the unit.`;
      }
      if (description.trim().length < 20) return 'Add a description: a sentence or two on the brand, material, condition and when to wear it.';
      const banned = findBannedPhrase(`${title} ${brand} ${description}`);
      if (banned) return `Remove "${banned}" - each listing is one item, not a batch or store catalogue.`;
    }
    if (s === 2) {
      if (!condition) return 'Choose a condition.';
      if (hasFlaws === null) return 'Say whether this item has any flaws.';
      if (confirmsAuthentic === null) return 'Say whether this item is confirmed authentic.';
      if (hasFlaws && !flawsDescription.trim()) return 'Describe the flaw, or answer No.';
      if (hasFlaws && imageFiles.length <= REQUIRED_PHOTOS) return 'Add a close-up of the flaw as an extra photo.';
    }
    return null;
  };

  const goToStep = (s: number) => {
    setStepError(null);
    setStep(Math.max(0, Math.min(s, STEP_LABELS.length - 1)));
    scrollToTop();
  };
  const goNext = () => goToStep(step + 1);
  const isLastStep = step === STEP_LABELS.length - 1;
  const goBack = () => goToStep(step - 1);

  const undeclared = PUBLISH_CONFIRMATIONS.filter((c) => !declarations[c.key]).length;
  const allDeclared = undeclared === 0;

  // The last step needs both its validator and the two confirmations: unlike
  // the others it carries something the vendor agrees to, not just fills in.
  const stepComplete = (s: number) =>
    s === STEP_LABELS.length - 1 ? allDeclared && validateStep(s) === null : validateStep(s) === null;

  const handlePublish = async () => {
    setStepError(null);
    if (!user) { setStepError('Sign in first.'); return; }

    for (let s = 0; s <= 2; s++) {
      const err = validateStep(s);
      if (err) { setStep(s); setStepError(err); scrollToTop(); return; }
    }
    if (!allDeclared) { setShowRequired(true); return; }

    setLoading(true);
    const tFull = slog.time('full submit');
    try {
      // Already resized and uploading since each photo was added (see
      // uploadPhoto); this only waits for anything still in flight.
      const uploadedUrls: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        setUploadProgress({ done: i, total: imageFiles.length });
        uploadedUrls.push(await uploadPhoto(imageFiles[i]));
      }
      setUploadProgress(null);

      // Zero, and deliberately so. A vendor no longer names a number at all:
      // the one that matters is the amount we offer them, and the one a buyer
      // sees is set by an operator when the item is priced. Nothing goes live
      // before that happens, so the placeholder is never shown to anyone.
      const price = 0;
      const sale_price = null;

      const { data: created, error } = await supabase.from('listings').insert({
        title: title.trim(),
        brand: brand.trim(),
        price,
        sale_price,
        category: selectedCategory,
        gender,
        size_type: sizeType,
        size: sizeDetail.trim() || null,
        // Numbers, not a sentence in the description, so they can drive a size
        // filter later instead of being re-parsed out of prose.
        pit_to_pit_cm: toCm(measurements.pit_to_pit_cm ?? '', unit),
        length_cm: toCm(measurements.length_cm ?? '', unit),
        sleeve_cm: toCm(measurements.sleeve_cm ?? '', unit),
        waist_cm: toCm(measurements.waist_cm ?? '', unit),
        inseam_cm: toCm(measurements.inseam_cm ?? '', unit),
        outseam_cm: toCm(measurements.outseam_cm ?? '', unit),
        condition,
        description: description.trim() || null,
        image_url: uploadedUrls[0],
        image_urls: uploadedUrls,
        seller_id: user.id,
        seller_email: user.email,
        // Payout identity and pickup address are collected at first sale and
        // backfilled onto this row by submit_seller_payout_details(). For a
        // seller who already has them on file, they are copied in here so the
        // order snapshot chain has them from the moment the item sells.
        seller_display_name: profile?.full_name || null,
        seller_instagram: profile?.instagram ?? null,
        seller_upi_vpa: profile?.default_upi_vpa ?? null,
        // Collected here now, not at first sale. Approval requires a complete
        // pickup address, so a new seller's listing used to be unapprovable
        // until they had already sold something - which they could not do.
        // Collected when the vendor accepts our offer, not here. Asking for a
        // collection address before we have told them a number is four fields
        // spent on an item we may not take. accept_acquisition_offer refuses
        // to record an acceptance without one, so nothing can be agreed with
        // nowhere to collect from.
        pickup_address: profile?.pickup_address ?? null,
        // Filled in at acceptance alongside the address, from the pincode the
        // vendor gives there. Stored on the listing rather than read through
        // the profile, so a vendor who later moves does not silently relocate
        // every item they have already listed.
        pickup_state: null,
        pickup_pincode: null,
        pickup_state_code: null,
        shipping_category: shippingCategory,
        free_shipping: freeShipping,
        has_flaws: !!hasFlaws,
        flaws_description: hasFlaws ? flawsDescription.trim() : null,
        // Left unanswered on purpose. We open the parcel before any of this
        // reaches a buyer, so these are ours to record at check-in rather than
        // four more questions asked of someone who is still deciding whether to
        // bother. The columns stay for the rows that already carry answers.
        original_tags_attached: null,
        original_packaging: null,
        item_altered: null,
        wear_frequency: null,
        // The vendor's answer. authenticity_confirmed, which puts
        // "Authenticity: Confirmed" on the listing page, is ours to set in
        // the admin portal, and the database keeps it off for anyone else.
        vendor_confirms_authentic: confirmsAuthentic,
        seller_declared_at: new Date().toISOString(),
        status: 'pending',
      }).select('id').single();
      if (error) throw error;

      // The acquisition record, carrying nothing but the link to the vendor.
      // The offer, the expected resale and every part of the spread are
      // server-set, and the insert policy refuses a row that names any of them.
      // The lane and the shipping method are defaulted by the database, since
      // neither is the vendor's to choose.
      //
      // Not fire-and-forget. Without this row the item can never be priced and
      // can never go live, so a failure here has to surface as one.
      const listingId = (created as { id: string }).id;
      const { error: acqError } = await supabase.from('listing_acquisitions').insert({
        listing_id: listingId,
        vendor_id: user.id,
      });
      if (acqError) {
        // The two inserts are separate requests, so a failure here would leave
        // a pending listing that can never be priced. Take it back out, so a
        // retry starts clean instead of stranding a duplicate each time.
        await supabase.from('listings').delete().eq('id', listingId);
        throw acqError;
      }

      tFull.end({ outcome: 'success' });
      // Seller-side conversion. Compared against sell_started, this is the
      // completion rate of the listing form.
      trackEvent('listing_submitted', {
        category: selectedCategory,
        shipping_category: shippingCategory,
        free_shipping: freeShipping,
        photo_count: imageFiles.length,
      });
      setSubmitted(true);
      scrollToTop();
    } catch (err: any) {
      slog.error('handlePublish THREW', err);
      tFull.end({ outcome: 'error' });
      setStepError(err?.message || 'Failed to submit listing');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setStep(0);
    scrollToTop();
    setImageFiles([]); setImagePreviews([]);
    setTitle(''); setBrand(''); setDescription('');
    setSelectedCategory(''); setSizeType(''); setSizeDetail(''); setMeasurements({}); setUnit('cm');
    setCondition(''); setHasFlaws(null); setConfirmsAuthentic(null); setFlawsDescription('');
    setDeclarations(noDeclarations());
    setShowRequired(false);
    setPhotoNote(null);
  };

  if (submitted) {
    return <SellSubmitted onItems={() => navigate('/vendor-portal')} onAnother={resetForm} />;
  }

  // One centred column, the same as the intro before it: three steps, one at
  // a time. What happens after the form is shown after the form, once the
  // item is in, rather than in a sidebar competing with every step of it.
  return (
    <div className="shell-form pt-24 sm:pt-32 pb-16 sm:pb-20">
      <div className="min-w-0">
        {/* Someone on this page has already decided to list something. The
            hero only has to confirm they are in the right place, so it is a
            headline and one sentence. Everything else that used to sit here
            either attaches to a specific field further down or is gone.

            On later steps there is no heading at all: the stepper below names
            the step, and naming it twice is what made this feel long. */}
        {step === 0 && (
          <div className="mb-12 flex flex-col gap-4">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-[0.95]">
              What are you selling?
            </h1>
            <p className="body-longform measure">
              Add your item. We'll make you an offer.
            </p>
          </div>
        )}

        {/* One track, not three bars.
        
            Three separate rounded segments with a label under each read as
            three unrelated things rather than as one journey, and they carried
            the step name a second time next to the heading that already said
            it. This is a single rule that fills, with the count and the current
            step named once, on one line. The steps stay individually reachable
            for anyone going back to fix something. */}
        <div className="mb-12 flex flex-col gap-3">
          <div className="flex items-baseline gap-2 text-sm">
            <span>Step {step + 1} of {STEP_LABELS.length}</span>
            <span aria-hidden>·</span>
            <span className="font-bold">{STEP_LABELS[step]}</span>
          </div>

          <div
            className="relative h-1 w-full bg-black/10"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={STEP_LABELS.length}
            aria-label={`Step ${step + 1} of ${STEP_LABELS.length}, ${STEP_LABELS[step]}`}
          >
            <span
              className="absolute inset-y-0 left-0 bg-black transition-[width] duration-300"
              style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
            />
            {/* Invisible hit areas over the track, so a completed step is still
                one tap away without drawing three competing shapes. */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${STEP_LABELS.length}, minmax(0, 1fr))` }}>
              {STEP_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => goToStep(i)}
                  aria-label={`Go to step ${i + 1}, ${label}${stepComplete(i) ? ', done' : ''}`}
                  className="h-full w-full -my-3 py-3"
                />
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-10"
          >
            {step === 0 && (
              <PhotosStep
                originals={originals} cleaning={cleaning} onUseOriginal={useOriginal}
                imagePreviews={imagePreviews}
                onAdd={handleImageChange}
                onDropFiles={(files) => { void addPhotos(files); }}
                onRemove={(i) => { setPhotoNote(null); removeImage(i); }}
                adding={adding}
                note={photoNote}
              />
            )}

            {step === 1 && (
              <DetailsStep
                title={title} setTitle={setTitle}
                brand={brand} setBrand={setBrand}
                gender={gender} setGender={setGender}
                selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
                sizeType={sizeType} setSizeType={setSizeType}
                sizeDetail={sizeDetail} setSizeDetail={setSizeDetail}
                description={description} setDescription={setDescription}
                measurements={measurements} setMeasurements={setMeasurements}
                unit={unit} setUnit={setUnit}
              />
            )}

            {step === 2 && (
              <LastStep
                condition={condition} setCondition={setCondition}
                hasFlaws={hasFlaws} setHasFlaws={setHasFlaws}
                confirmsAuthentic={confirmsAuthentic} setConfirmsAuthentic={setConfirmsAuthentic}
                flawsDescription={flawsDescription} setFlawsDescription={setFlawsDescription}
                declarations={declarations} setDeclarations={setDeclarations}
                showRequired={showRequired}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {stepError && (
          <p className={cn(ui.error, 'mt-6')}>{stepError}</p>
        )}

        {uploadProgress && (
          <p className="mt-6 text-sm font-bold">
            Finishing photo {uploadProgress.done + 1} of {uploadProgress.total}
          </p>
        )}

        {/* Back and Continue are a pair, so they sit as a pair: outlined Back
            on the left, black Continue beside it, same height, one row.

            They were stacked, with Continue full width and Back as an
            underlined text link below it. That made Back look like a footnote
            about the button rather than the other half of the same choice, and
            it put the two controls you use most on every step in two different
            registers. Back keeps the quieter treatment, an outline against a
            fill, because it is the secondary action. It is not a different
            KIND of thing.

            Back holds its slot on step 0 rather than disappearing, so the
            primary action does not jump sideways between the first step and
            the second. */}
        <div className="mt-12 flex flex-col gap-4">
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 border border-black/20 px-6 sm:px-10 text-xs font-black uppercase tracking-[0.2em] text-black transition-colors hover:border-black disabled:opacity-25 disabled:hover:border-black/20"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={isLastStep ? handlePublish : goNext}
              disabled={isLastStep && loading}
              className="flex-1 bg-black py-5 text-xs font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-zinc-800 disabled:bg-black/25 disabled:hover:bg-black/25 flex items-center justify-center gap-3"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLastStep ? (loading ? 'Sending' : 'Get my offer') : 'Continue'}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>

        </div>

        {/* What happens after "Get my offer" is said after it, on the
            confirmation screen, not here as well. */}
        <div className="mt-12 pt-6 border-t border-black/10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-normal leading-relaxed">
            Something not working?{' '}
            <Link to="/contact" className="underline underline-offset-4 text-black">Tell us</Link>
            {' or '}
            <a href="https://wa.me/918505927538" target="_blank" rel="noreferrer" className="underline underline-offset-4 text-black">WhatsApp us</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

// After "Get my offer": what we are doing now, and then the whole sequence
// from offer to payout, told once the item is in rather than beside the form.
// Numbered because it is a sequence: the most common mistake is posting the
// item the day the offer is accepted.
export function SellSubmitted({ onItems, onAnother }: { onItems: () => void; onAnother: () => void }) {
  return (
    <div className="shell-form pt-24 sm:pt-32 pb-16 sm:pb-20 flex flex-col gap-12">
      {/* Where things stand, in one line. The steps below say the rest, so
          this does not repeat them: it used to add a second line about the
          label that the list restates two sections down. */}
      <div className="flex flex-col gap-6">
        <h1 className={ui.pageTitle}>Back in 24 hours.</h1>
        <p className="text-[15px] leading-relaxed">
          We will email you an offer, or what to fix. Check your spam folder too.
        </p>
      </div>

      <section className="flex flex-col gap-6" aria-labelledby="next-heading">
        <h2 id="next-heading" className={ui.sectionTitle}>What happens next</h2>
        <ol className="flex flex-col gap-6">
          {WHAT_HAPPENS_NEXT.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black leading-none text-white"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-[15px] font-bold leading-snug">{step.title}</h3>
                {/* One line reads as a sentence; several read as a list, one
                    sentence per bullet, so a step with three instructions
                    does not look like a paragraph. */}
                <ul className="flex flex-col gap-1.5">
                  {step.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm leading-relaxed">
                      {step.points.length > 1 && (
                        <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 bg-black" />
                      )}
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <dl className="flex flex-col gap-4 border-t border-black/10 pt-6">
          {WHAT_HAPPENS_NOTES.map((note) => (
            <div key={note.title} className="flex flex-col gap-1 text-sm">
              <dt className="font-bold">{note.title}</dt>
              <dd className="leading-relaxed">{note.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button type="button" onClick={onAnother} className={ui.btnPrimary}>
            Sell another item
          </button>
          <button type="button" onClick={onItems} className={ui.btnSecondary}>
            Your items
          </button>
        </div>
        <p className="text-sm">
          Questions?{' '}
          <a href="https://wa.me/918505927538" target="_blank" rel="noreferrer" className={cn(ui.link, 'font-bold')}>WhatsApp us</a>.
        </p>
      </div>
    </div>
  );
}

// A select that looks like the inputs beside it and still says it opens:
// the native control (so the phone's own picker), with the arrow drawn back.
function SelectBox({ value, onChange, disabled, children }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(ui.input, 'appearance-none bg-white pr-8 disabled:opacity-50')}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2" />
    </div>
  );
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className={cn('flex items-baseline gap-2', ui.label)}>
      {children}
      {optional && <span className="font-normal">(optional)</span>}
    </label>
  );
}

// One step above a field label and clearly not one of them. Every section used
// to be set in the same register as the fields under it, so nothing told you
// where one group ended and the next began.
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-black pl-5 text-sm font-normal leading-relaxed text-black">
      {children}
    </p>
  );
}

function SectionHeading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={ui.sectionTitle}>{children}</h3>
      {note && <p className="text-sm font-normal leading-relaxed text-black measure">{note}</p>}
    </div>
  );
}

// Guidance attached to a field. Body size, black, sitting directly under the
// thing it describes.
//
// This and Note used to be 13px grey, which is a fourth type size and a second
// ink doing the job of the one above it. Hierarchy here comes from weight and
// position, not from fading the words out: guidance someone needs in order to
// answer correctly is content, and content is full ink.
function TrustNote({ children, full }: { children: React.ReactNode; full?: boolean }) {
  // `full` drops the measure cap for a note that closes a section rather than
  // sitting beside a field: at the foot of a full-width block, text stopping
  // short of the edge reads as a mistake rather than as a line length.
  return (
    <p className={cn('text-sm font-normal leading-relaxed text-black', !full && 'measure')}>
      {children}
    </p>
  );
}

function PhotosStep({ imagePreviews, onAdd, onDropFiles, onRemove, originals, cleaning, onUseOriginal, adding, note }: {
  imagePreviews: string[];
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFiles: (files: File[]) => void;
  onRemove: (i: number) => void;
  originals: Record<number, { file: File; preview: string }>;
  cleaning: Record<number, boolean>;
  onUseOriginal: (i: number) => void;
  adding: boolean;
  note: string | null;
}) {
  const slotCount = Math.max(PHOTO_SLOT_LABELS.length, imagePreviews.length + 1);
  const slots = Array.from({ length: Math.min(slotCount, MAX_IMAGES) }, (_, i) => i);
  // Photos dropped anywhere on this step are added, in the order dropped.
  const drop = usePhotoDrop(onDropFiles, adding);

  return (
    <div className="flex flex-col gap-12" {...drop.bind}>
      {/* One heading and one line. This was a kicker, a headline, three
          numbered tips, a footnote and a plug for a third-party background
          remover - six pieces of chrome to say "lay it flat in daylight". The
          rule that matters, that we never turn an item down over its photos,
          stays; the scaffolding does not, and we strip backgrounds ourselves. */}
      {/* No heading. This step contains one thing, and the stepper directly
          above already calls it Photos. Steps 2 and 3 hold several sections
          each, so those keep their headings.

          Says the quiet part out loud, because vendors otherwise assume their
          phone photos are the problem and give up. They are not the problem. */}
      <Note>
        Daylight, plain background, item flat. Better photos get better offers, so it is
        worth the ten minutes.{' '}
        <a
          href="https://www.photoroom.com/tools/background-remover"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4"
        >
          Photoroom
        </a>{' '}
        will clean up the background for free.
      </Note>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {slots.map((i) => {
          const slot = PHOTO_SLOTS[i];
          const label = slot?.label ?? `Photo ${i + 1}`;
          const required = slot?.required ?? false;
          const preview = imagePreviews[i];
          return preview ? (
            <div key={i} className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-100 group">
              <img src={preview} alt={label} className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute top-2 left-2 bg-black px-2 py-1 text-xs font-bold text-white">Cover</span>
              )}
              <button type="button" onClick={() => onRemove(i)}
                className="absolute top-2 right-2 bg-black/70 p-2 text-white hover:bg-black transition-all">
                <X className="h-3 w-3" />
              </button>
              {cleaning[i] && (
                <span className="absolute bottom-2 left-2 bg-black px-2 py-1 text-xs font-bold text-white">
                  Tidying…
                </span>
              )}
              {originals[i] && (
                <button
                  type="button" onClick={() => onUseOriginal(i)}
                  className="absolute bottom-2 left-2 bg-white px-2 py-1 text-xs font-bold text-black"
                >
                  Use original
                </button>
              )}
            </div>
          ) : (
            <label key={i} className={cn(
              'relative flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 border border-dashed p-3 text-center transition-colors',
              'has-[:focus-visible]:border-solid has-[:focus-visible]:border-black',
              drop.over ? 'border-solid border-black bg-black/[0.04]' : 'border-black/25',
              !adding && 'hover:border-black',
            )}>
              {adding ? (
                <>
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                  <span className="text-sm font-bold leading-snug">Adding photos</span>
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 shrink-0" />
                  {/* Two lines, one size. This box had three stacked texts at three
                      sizes - name at 11px, hint at 10px, required/optional at 9px -
                      which is three type decisions inside a thumbnail. The second
                      line says whichever of the two is actually worth knowing. */}
                  <span className="text-sm font-bold leading-snug">{label}</span>
                  <span className="text-xs leading-snug">
                    {slot?.hint ?? (required ? 'Required' : 'Optional')}
                  </span>
                </>
              )}
              {/* Every empty box opens the same picker, which takes several
                  photos at once. The file input itself covers the whole box,
                  invisibly, so a tap lands on it directly. Hidden inside the
                  box and reached through the label, iOS Safari did not open
                  the picker at all. */}
              <input
                type="file" accept="image/*" multiple onChange={onAdd} disabled={adding}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 file:cursor-pointer disabled:cursor-wait"
              />
            </label>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-black">
          {imagePreviews.length}/{MAX_IMAGES} uploaded.
          {imagePreviews.length < REQUIRED_PHOTOS && ` ${REQUIRED_PHOTOS - imagePreviews.length} more needed.`}
        </p>
        {/* Only where there is a mouse to drag with. */}
        <p className="hidden text-sm pointer-fine:block">You can also drag photos from your computer onto the boxes.</p>
        {note && <p role="status" className="text-sm">{note}</p>}
      </div>
    </div>
  );
}

// The one-item rule lives here, on the step that enforces it. The
// banned-phrase check runs against these fields, so the rule and the thing
// that rejects it are finally on the same screen.
function DetailsStep(props: {
  title: string; setTitle: (v: string) => void;
  brand: string; setBrand: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  selectedCategory: string; setSelectedCategory: (v: string) => void;
  sizeType: string; setSizeType: (v: string) => void;
  sizeDetail: string; setSizeDetail: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  measurements: Partial<Record<MeasureKey, string>>;
  setMeasurements: React.Dispatch<React.SetStateAction<Partial<Record<MeasureKey, string>>>>;
  unit: MeasureUnit;
  setUnit: (u: MeasureUnit) => void;
}) {
  const {
    title, setTitle, brand, setBrand, gender, setGender,
    selectedCategory, setSelectedCategory, sizeType, setSizeType, sizeDetail, setSizeDetail,
    description, setDescription, measurements, setMeasurements, unit, setUnit,
  } = props;
  const measures = measurementsFor(selectedCategory);
  const guide = MEASURE_GUIDES[selectedCategory] ?? null;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-start gap-3 border-l-2 border-black pl-5">
        <AlertTriangle className="h-4 w-4 text-black mt-0.5 shrink-0" />
        <p className="text-sm font-normal leading-relaxed text-black">
          One item per form. If you have five of the same thing, send them as five
          separate submissions, because we price and buy each one on its own.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <SectionHeading>The item</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3">
            <FieldLabel>What is it?</FieldLabel>
            <input value={title} onChange={(e) => setTitle(e.target.value)} type="text" placeholder="e.g. Vintage 90s Biker Jacket"
              className={ui.input} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Brand</FieldLabel>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} type="text" placeholder="e.g. Levi's"
              className={ui.input} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Who is it for?</FieldLabel>
            <SelectBox value={gender} onChange={setGender}>
              <option value="">Choose one</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Unisex">Unisex</option>
            </SelectBox>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Category</FieldLabel>
            <SelectBox value={selectedCategory} onChange={(v) => { setSelectedCategory(v); setSizeType(''); }}>
              <option value="">Choose a category</option>
              <option value="Tops">Tops</option>
              <option value="Bottoms">Bottoms</option>
              <option value="Outerwear">Outerwear</option>
              <option value="Accessories">Accessories</option>
              <option value="Shoes">Shoes</option>
            </SelectBox>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Size</FieldLabel>
            <SelectBox value={sizeType} onChange={setSizeType} disabled={!selectedCategory}>
              <option value="">{selectedCategory ? 'Choose a size' : 'Choose a category first'}</option>
              {selectedCategory && CATEGORY_SIZES[selectedCategory]?.map((t) => (<option key={t} value={t}>{t}</option>))}
            </SelectBox>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel optional>Size detail</FieldLabel>
            <input value={sizeDetail} onChange={(e) => setSizeDetail(e.target.value)} type="text" placeholder="e.g. 34x30 or Oversized fit"
              className={ui.input} />
          </div>
        </div>

        {/* Measurements. Placed with the item details rather than hidden behind
            a toggle, because a listing without them is the one most likely to
            come back. The "how" line under each field is there because most
            people have genuinely never measured a garment before. */}
        {(measures.required.length > 0 || measures.optional.length > 0) && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeading note="Lay the item flat and use a tape. This is the single best thing you can do to stop it coming back.">
                Measurements
              </SectionHeading>
              {/* Whichever tape someone owns. Stored in centimetres either way,
                  so a listing measured in inches and one measured in cm are the
                  same number in the database and filter identically later. */}
              <span role="group" aria-label="Measurement unit" className="flex shrink-0 items-baseline gap-1.5 text-sm">
                {(['in', 'cm'] as MeasureUnit[]).map((u, i) => (
                  <React.Fragment key={u}>
                    {i > 0 && <span aria-hidden>/</span>}
                    <button
                      type="button"
                      onClick={() => setUnit(u)}
                      aria-pressed={unit === u}
                      className={cn('min-h-[44px]', unit === u ? 'font-bold' : ui.link)}
                    >
                      {u}
                    </button>
                  </React.Fragment>
                ))}
              </span>
            </div>
            {/* Fields on the left, the drawing on the right. On a phone the two
                stack, drawing first, so a seller sees what to measure before
                they reach the box for it.

                A real two-column grid rather than a floated image. A float lets
                the drawing run down past the fields and over whatever follows,
                which is what cut the "Tag sizes" note off mid-word. In a grid
                each column owns its own space, and the note below spans both.

                Legibility, measured on the assets: the legend under each
                drawing is 26px cap height at 1024px wide. In the 272px desktop
                column that is about 7px with 18px number circles, and at the
                280px phone cap about 7px with 19px circles. The words are
                printed large on the card itself, so this reads at these sizes
                where the previous single drawing did not. */}
            <div className={cn(
              'grid grid-cols-1 gap-8',
              guide && 'sm:grid-cols-2 sm:items-start',
            )}>
              {guide && (
                <figure className="mx-auto w-full max-w-[280px] sm:order-2 sm:mx-0 sm:max-w-none">
                  <picture>
                    <source srcSet={`/images/${guide.src}.webp`} type="image/webp" />
                    <img
                      src={`/images/${guide.src}.png`}
                      alt={guide.alt}
                      width={720}
                      height={1080}
                      loading="lazy"
                      decoding="async"
                      className="block h-auto w-full"
                    />
                  </picture>
                </figure>
              )}
              <div className="flex flex-col gap-8 sm:order-1">
                {[...measures.required, ...measures.optional].map((m) => {
                  const isRequired = measures.required.some((r) => r.key === m.key);
                  return (
                    <div key={m.key} className="flex flex-col gap-3">
                      <FieldLabel optional={!isRequired}>
                        {m.step != null && guide && (
                          // Same mark as the drawing: a filled black circle with
                          // the number reversed out. Hidden from screen readers,
                          // which get the whole mapping from the image's alt text.
                          <span
                            aria-hidden
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full bg-black text-[11px] font-black leading-none text-white"
                          >
                            {m.step}
                          </span>
                        )}
                        {m.label}
                      </FieldLabel>
                      <div className="flex items-baseline gap-2">
                        <input
                          type="number" inputMode="decimal" min="1" step="any"
                          value={measurements[m.key] ?? ''}
                          onChange={(e) => setMeasurements((prev) => ({ ...prev, [m.key]: e.target.value }))}
                          placeholder={unit === 'cm' ? '52' : '20.5'}
                          className={ui.input}
                        />
                        <span className="text-sm">{unit}</span>
                      </div>
                      <span className="text-sm font-normal leading-relaxed">{m.how}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <TrustNote full>
              Tag sizes aren't always accurate, especially on vintage. Measurements are what
              stop someone buying the wrong thing and sending it back.
            </TrustNote>
          </div>
        )}

        {/* Required: it becomes the listing's description, and buyers ask
            about material and season more than anything else a photo leaves
            out. */}
        <div className="flex flex-col gap-3">
          <FieldLabel>Description</FieldLabel>
          <p className={ui.help}>
            Mention the brand, the material (like cotton), its condition, when to wear it (season
            or occasion) and anything a buyer should know.
          </p>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
            placeholder="e.g. Heavyweight cotton hoodie, fits true to size. Made for winter layering. Light fading on the cuffs."
            className="w-full border border-black/20 p-4 text-sm focus:border-black focus:outline-none resize-none transition-colors placeholder:text-black/35" />
          <TrustNote>Feel free to use AI to help you write it. The more we know, the closer our offer lands.</TrustNote>
        </div>
      </div>
    </div>
  );
}

// Yes before No: the question is "any flaws?", and a Yes/No question reads
// Yes-then-No everywhere else. Leading with No also nudged vendors toward the
// answer that hides flaws, which is the one answer that costs us a dispute.
function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-xs">
      {([true, false] as const).map((answer) => (
        <button key={String(answer)} type="button" onClick={() => onChange(answer)} aria-pressed={value === answer}
          className={cn('border py-3.5 text-sm font-bold transition-colors',
            value === answer ? 'bg-black text-white border-black' : 'border-black/15 hover:border-black')}>
          {answer ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

function ConditionStep({
  condition, setCondition, hasFlaws, setHasFlaws, confirmsAuthentic, setConfirmsAuthentic,
  flawsDescription, setFlawsDescription,
}: {
  condition: string; setCondition: (v: string) => void;
  hasFlaws: boolean | null; setHasFlaws: (v: boolean) => void;
  confirmsAuthentic: boolean | null; setConfirmsAuthentic: (v: boolean) => void;
  flawsDescription: string; setFlawsDescription: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <SectionHeading note="Be honest here. We check the item against this when it reaches us.">Condition</SectionHeading>
        {/* Numerals rather than stars: the same labels render on product pages,
            where one star out of five reads as a bad listing instead of a worn
            one. The definitions are short enough to sit on the card, so nothing
            hides behind a tip here. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONDITIONS.map((c) => {
            const chosen = condition === c.name;
            return (
              <button key={c.name} type="button" onClick={() => setCondition(c.name)}
                className={cn('relative overflow-hidden border p-5 pl-6 text-left transition-colors flex flex-col gap-1.5',
                  chosen ? 'bg-black text-white border-black' : 'border-black/15 hover:border-black')}>
                {/* The same rank bar as the guide, in the same ink. On a chosen
                    card the ladder inverts to white so it stays visible. */}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-1"
                  style={{ backgroundColor: chosen ? '#FFFFFF' : c.rank }}
                />
                <span className="flex items-baseline gap-2 text-[15px] font-bold">
                  {c.name}
                  <span className="text-sm font-normal">{c.grade}</span>
                </span>
                <span className="text-sm leading-relaxed">{c.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Two yes-or-no questions, side by side where there is room. On a
          phone they stack, and a flaw's description stays right under the
          flaws question rather than under the next one. */}
      <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-10">
        <div className="flex flex-col gap-6">
          <SectionHeading>Any flaws?</SectionHeading>
          <YesNo value={hasFlaws} onChange={setHasFlaws} />
        </div>

        <AnimatePresence>
          {hasFlaws && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden sm:order-last sm:col-span-2">
              <div className="flex flex-col gap-3">
                <FieldLabel>Describe the flaw</FieldLabel>
                <textarea value={flawsDescription} onChange={(e) => setFlawsDescription(e.target.value)} rows={3}
                  placeholder="e.g. small stain on the left cuff, loose stitching on the hem"
                  className="w-full border border-black/20 p-4 text-sm focus:border-black focus:outline-none resize-none transition-colors placeholder:text-black/35" />
                <TrustNote>Add a close-up in Photos. Undisclosed flaws are what disputes are made of.</TrustNote>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The vendor's answer. Whether the listing page says "Confirmed"
            is decided by us, in the admin portal. */}
        <div className="mt-6 flex flex-col gap-6 sm:mt-0">
          <SectionHeading>Confirmed authentic?</SectionHeading>
          <YesNo value={confirmsAuthentic} onChange={setConfirmsAuthentic} />
        </div>
      </div>
    </div>
  );
}


// The last step: condition, how the item reaches us, and the two lines a
// vendor confirms. It was called PriceStep when it held an asking price, and
// holds none now - a vendor names no number anywhere in this form.
//
// The confirmations live here rather than on a Review screen of their own.
// Review restated what the form already showed and asked for six ticks; the
// consent that binds anyone is the agreement at offer acceptance, which is
// where money is promised. Two lines here, three clauses there.
function LastStep({
  condition, setCondition, hasFlaws, setHasFlaws, confirmsAuthentic, setConfirmsAuthentic,
  flawsDescription, setFlawsDescription, declarations, setDeclarations, showRequired,
}: {
  condition: string; setCondition: (v: string) => void;
  hasFlaws: boolean | null; setHasFlaws: (v: boolean) => void;
  confirmsAuthentic: boolean | null; setConfirmsAuthentic: (v: boolean) => void;
  flawsDescription: string; setFlawsDescription: (v: string) => void;
  declarations: Record<string, boolean>;
  setDeclarations: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showRequired: boolean;
}) {
  return (
    <div className="flex flex-col gap-12">
      <ConditionStep
        condition={condition} setCondition={setCondition}
        hasFlaws={hasFlaws} setHasFlaws={setHasFlaws}
        confirmsAuthentic={confirmsAuthentic} setConfirmsAuthentic={setConfirmsAuthentic}
        flawsDescription={flawsDescription} setFlawsDescription={setFlawsDescription}
      />

      {/* Three lines, all load-bearing. One item is the rule that makes a
          listing a listing; accuracy carries flaws and authenticity; and the
          third is the one the patient lane actually runs on. */}
      <div className="flex flex-col gap-1">
        <SectionHeading>Three things to confirm</SectionHeading>
        {PUBLISH_CONFIRMATIONS.map((item) => {
          const on = !!declarations[item.key];
          const missing = showRequired && !on;
          return (
            <button
              key={item.key} type="button"
              onClick={() => setDeclarations((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
              aria-pressed={on}
              aria-invalid={missing || undefined}
              className="group flex items-start gap-4 py-4 text-left border-b border-black/5 last:border-b-0"
            >
              <span className={cn(
                'mt-px flex h-5 w-5 shrink-0 items-center justify-center border transition-colors',
                on ? 'border-black bg-black text-white'
                  : missing ? 'border-2 border-red-600'
                  : 'border-black/25 group-hover:border-black',
              )}>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-relaxed text-black">{item.label}</span>
                {missing && <span className={ui.error}>Required</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The sell page for someone without an account yet. It used to be a sign-up
 * form over a blank page: a password and a phone number asked for before the
 * visitor had seen what we buy or what happens next. This says both first.
 */
function SellIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="shell-form pt-24 sm:pt-32 pb-24 flex flex-col gap-10">
      <LaunchOfferNote />

      <div className="flex flex-col gap-4">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-[0.95]">
          How it works
        </h1>
        <p className="body-longform measure">
          Add your item. We'll make you an offer within 24 hours.
        </p>
        {/* The three things a first-time vendor is actually wondering, so they
            sit under the question in full ink rather than grey under the
            button, where they were read last if at all. */}
        <p className="body-longform measure font-bold">
          It takes a minute. You pay nothing to sell to us, and we cover shipping.
        </p>
      </div>

      <ol className="flex flex-col gap-5 border-y border-black/10 py-8">
        {WHAT_HAPPENS_NEXT.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black leading-none text-white"
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-[15px] font-bold text-black">{step.title}</h2>
              <p className="text-sm leading-relaxed">{step.points[0]}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={onStart}
          className="w-full sm:w-auto bg-black px-10 py-5 text-xs font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800"
        >
          Start selling
        </button>
        <p className="text-sm leading-relaxed text-center">
          Want the detail first? Read{' '}
          <Link to="/how-it-works" className={cn(ui.link, 'font-bold')}>How selling works</Link>.
        </p>
      </div>
    </div>
  );
}
