// Sell page. Guided multi-step listing flow (Photos -> Details ->
// Condition -> Price -> Review) optimized for mobile and for sellers listing
// several similar items in one sitting.
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
import { Loader2, CheckCircle2, Check, X, Plus, ChevronLeft, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { getShippingCategories, type ShippingCategory } from '../lib/pricing';
import { trackEvent } from '../lib/analytics';
import { CONDITIONS } from '../lib/condition';
import { log } from '../lib/log';
import { scrollToTop } from '../lib/scrollToTop';
import { encodeVariants, encodeSocialCard, SOCIAL_CARD_SUFFIX } from '../lib/images';
import { removeBackground } from '../lib/backgroundRemoval';
import { usePageMeta, META } from '../lib/pageMeta';
import { resolvePincode } from '../lib/pincode';
import { cn, formatCurrency } from '../lib/utils';

const slog = log('sell');

const CATEGORY_SIZES: Record<string, string[]> = {
  'Tops': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Bottoms': ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  'Outerwear': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Accessories': ['One Size'],
  'Shoes': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
};

// Two lines instead of six ticks and an authenticity radio. Every element of
// the old set survives: one-item is its own rule, and accuracy now carries
// photos, flaws and authenticity in a sentence someone reads rather than five
// they scroll past. The binding version is the three-clause agreement at offer
// acceptance.
const PUBLISH_CONFIRMATIONS: Array<{ key: string; label: string }> = [
  { key: 'oneItem', label: 'This is one item, and it is mine to sell.' },
  { key: 'accurate', label: 'It is genuine, the photos are of this item, and I have described its condition and any flaws accurately.' },
];

const WEAR_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'never', label: 'Never' },
  { key: '1_2_times', label: '1-2 Times' },
  { key: 'occasionally', label: 'Occasionally' },
  { key: 'frequently', label: 'Frequently' },
];

// Recommended photo order - purely a labeling/placeholder aid over the same
// image array (index 0 is still the cover). Not a hard per-slot requirement.
// These are the instruction: they say what to shoot, so no paragraph above the
// grid has to.
const PHOTO_SLOT_LABELS = ['Front of item', 'Back of item', 'Brand label', 'Size tag', 'Close-up detail', 'Any flaws'];

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

const MAX_IMAGES = 8;

// Three steps, not five. Condition belonged with price (they are the two
// judgements a vendor makes about the same object) and Review was five
// checkboxes restating what the form already said. The binding consent is the
// agreement at offer acceptance, where money is actually promised.
const STEP_LABELS = ['Photos', 'Details', 'Condition & price'];

type Declarations = Record<string, boolean>;

/** Every confirmation unticked. The only place this shape is built. */
const noDeclarations = (): Declarations =>
  Object.fromEntries(PUBLISH_CONFIRMATIONS.map((c) => [c.key, false]));

export function Sell() {
  usePageMeta(META.sell);

  return (
    <RequireAuth message="Sign in to list an item.">
      <SellInner />
    </RequireAuth>
  );
}

function SellInner() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [stepError, setStepError] = React.useState<string | null>(null);
  // Compressing eight photos takes a few seconds on a mid-range phone. A
  // spinner with no count reads as a hang, so say which photo we are on.
  const [uploadProgress, setUploadProgress] = React.useState<{ done: number; total: number } | null>(null);

  const [imageFiles, setImageFiles] = React.useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = React.useState<string[]>([]);
  // What the vendor actually uploaded, kept per index so "use original" can
  // put it back. Only populated where background removal produced something.
  const [originals, setOriginals] = React.useState<Record<number, { file: File; preview: string }>>({});
  const [cleaning, setCleaning] = React.useState<Record<number, boolean>>({});

  const [title, setTitle] = React.useState('');
  const [brand, setBrand] = React.useState('');
  const [gender, setGender] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('');
  const [sizeType, setSizeType] = React.useState('');
  const [sizeDetail, setSizeDetail] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [originalTags, setOriginalTags] = React.useState<boolean | null>(null);
  const [originalPackaging, setOriginalPackaging] = React.useState<boolean | null>(null);
  const [itemAltered, setItemAltered] = React.useState<boolean | null>(null);
  const [wearFrequency, setWearFrequency] = React.useState<string | null>(null);

  const [condition, setCondition] = React.useState('');
  const [hasFlaws, setHasFlaws] = React.useState<boolean | null>(null);
  const [flawsDescription, setFlawsDescription] = React.useState('');

  const [priceVal, setPriceVal] = React.useState('');
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
  // PriceStep is a separate component, so the override flag is set here and
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


  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const input = e.target;
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_IMAGES - imageFiles.length;
    if (remaining <= 0) { input.value = ''; return; }
    // Match the bucket limits (8 MiB, png/jpeg/webp) so users get a friendly
    // error here instead of a failed upload against storage.
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const accepted: File[] = [];
    for (let i = 0; i < fileList.length && accepted.length < remaining; i++) {
      const f = fileList[i];
      if (!f) continue;
      if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
        alert(`"${f.name}" is not a supported image. Use PNG, JPG, or WebP.`);
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        alert(`"${f.name}" is too large. Each image must be 8 MB or smaller.`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) { input.value = ''; return; }
    Promise.all(
      accepted.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      })),
    ).then((urls) => {
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
            const reader = new FileReader();
            reader.onloadend = () => {
              const preview = reader.result as string;
              setImageFiles((prev) => prev.map((f, i) => (i === index ? processed : f)));
              setImagePreviews((prev) => prev.map((u, i) => (i === index ? preview : u)));
            };
            reader.readAsDataURL(processed);
          }
        }).finally(() => {
          setCleaning((prev) => { const next = { ...prev }; delete next[index]; return next; });
        });
      });
    }).catch((err) => {
      slog.error('FileReader failed', err);
      alert('Failed to read one of the images.');
    }).finally(() => { input.value = ''; });
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
      if (imageFiles.length === 0) return 'Add at least one photo.';
    }
    if (s === 1) {
      if (!title.trim()) return 'Tell us what the item is.';
      if (!brand.trim()) return 'Add the brand.';
      if (!gender) return 'Choose who the item is for.';
      if (!selectedCategory) return 'Choose a category.';
      if (!sizeType) return 'Choose a size.';
      const banned = findBannedPhrase(`${title} ${brand} ${description}`);
      if (banned) return `Remove "${banned}" - each listing is one item, not a batch or store catalogue.`;
    }
    if (s === 2) {
      if (!condition) return 'Choose a condition.';
      if (hasFlaws === null) return 'Say whether this item has any flaws.';
      if (hasFlaws && !flawsDescription.trim()) return 'Describe the flaw, or answer No.';
      if (hasFlaws && imageFiles.length < 2) return 'Add a close-up of the flaw to your photos.';
      if (!priceVal || Number(priceVal) <= 0) return 'Enter what you want for it.';
    }
    return null;
  };

  const goToStep = (s: number) => {
    setStepError(null);
    setStep(Math.max(0, Math.min(s, STEP_LABELS.length - 1)));
    scrollToTop();
  };
  const goNext = () => goToStep(step + 1);
  const goBack = () => goToStep(step - 1);

  const undeclared = PUBLISH_CONFIRMATIONS.filter((c) => !declarations[c.key]).length;
  const allDeclared = undeclared === 0;
  const canPublish = allDeclared && !loading;
  // A disabled button that does not say why reads as a broken one.
  const blockedReason = loading ? null
    : undeclared === PUBLISH_CONFIRMATIONS.length ? 'Tick both lines above to send it to us.'
    : undeclared > 0 ? 'One line above is still unticked.'
    : null;

  // Review is the only step without its own validator: it is complete when the
  // two things it asks for are answered.
  const stepComplete = (s: number) =>
    s === STEP_LABELS.length - 1 ? allDeclared && validateStep(s) === null : validateStep(s) === null;

  const handlePublish = async () => {
    setStepError(null);
    if (!user) { setStepError('Sign in first.'); return; }

    for (let s = 0; s <= 2; s++) {
      const err = validateStep(s);
      if (err) { setStep(s); setStepError(err); scrollToTop(); return; }
    }
    if (!allDeclared) { setStepError('Tick both lines above before sending it to us.'); scrollToTop(); return; }

    setLoading(true);
    const tFull = slog.time('full submit');
    try {
      // Resize and re-encode in the browser before anything is uploaded. A
      // phone photo is 1.5-8 MB and no browser ever needs more than a fraction
      // of that; sending the original would cost storage and egress on every
      // view forever. Three variants go up per photo and the stored URL is the
      // 1600px one - variantUrl() derives the smaller two from its name.
      const uploadedUrls: string[] = [];
      const stamp = Date.now();
      for (let i = 0; i < imageFiles.length; i++) {
        const variants = await encodeVariants(imageFiles[i]);
        setUploadProgress({ done: i, total: imageFiles.length });
        let fullUrl = '';
        for (const variant of ['thumb', 'grid', 'full'] as const) {
          const { blob, width, ext } = variants[variant];
          const filePath = `listings/${user.id}-${stamp}-${i}-${width}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('listing-images')
            .upload(filePath, blob, { contentType: blob.type, cacheControl: '31536000' });
          if (uploadError) throw uploadError;
          if (variant === 'full') {
            fullUrl = supabase.storage.from('listing-images').getPublicUrl(filePath).data.publicUrl;
          }
        }
        // Cover photo only: the 1200x630 JPEG that WhatsApp and Facebook
        // actually render in a link preview. See encodeSocialCard.
        if (i === 0) {
          const card = await encodeSocialCard(imageFiles[i]);
          const cardPath = `listings/${user.id}-${stamp}-${i}${SOCIAL_CARD_SUFFIX}`;
          const { error: cardErr } = await supabase.storage
            .from('listing-images')
            .upload(cardPath, card, { contentType: 'image/jpeg', cacheControl: '31536000' });
          if (cardErr) throw cardErr;
        }
        uploadedUrls.push(fullUrl);
      }
      setUploadProgress(null);

      // The database contract is unchanged - price is the struck-through
      // number and sale_price is what is charged - so the form's friendlier
      // wording is mapped back onto it here rather than migrating data.
      // A placeholder only. listings.price is replaced with our own figure
      // the moment an operator prices the item, and a trigger stops a vendor
      // changing it afterwards. Nothing goes live before that happens.
      const price = Number(priceVal);
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
        original_tags_attached: originalTags,
        original_packaging: originalPackaging,
        item_altered: itemAltered,
        wear_frequency: wearFrequency,
        // Carried by the accuracy line the vendor ticks, which says the item
        // is genuine. Restated in full at the agreement screen.
        authenticity_confirmed: !!declarations.accurate,
        seller_declared_at: new Date().toISOString(),
        status: 'pending',
      }).select('id').single();
      if (error) throw error;

      // The acquisition record. Carries the vendor's asking price and nothing
      // else: the offer, the expected resale and every part of the spread are
      // server-set, and the insert policy refuses a row that names any of them.
      //
      // Not fire-and-forget. Without this row the item can never be priced and
      // can never go live, so a failure here has to surface as one.
      const listingId = (created as { id: string }).id;
      const { error: acqError } = await supabase.from('listing_acquisitions').insert({
        listing_id: listingId,
        vendor_id: user.id,
        asking_price: Number(priceVal),
      });
      if (acqError) throw acqError;

      tFull.end({ outcome: 'success' });
      // Seller-side conversion. Compared against sell_started, this is the
      // completion rate of the listing form.
      trackEvent('listing_submitted', {
        category: selectedCategory,
        shipping_category: shippingCategory,
        free_shipping: freeShipping,
        price: Number(priceVal) || 0,
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
    setSelectedCategory(''); setSizeType(''); setSizeDetail('');
    setOriginalTags(null); setOriginalPackaging(null); setItemAltered(null); setWearFrequency(null);
    setCondition(''); setHasFlaws(null); setFlawsDescription('');
    setPriceVal('');
    setDeclarations(noDeclarations());
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 text-center flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-black text-white mb-8">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase mb-4 leading-[0.95]">
          We will come back within 24 hours
        </h1>
        {/* The vendor has not listed anything yet and should not think they
            have. Nothing goes live until they have seen a number and agreed to
            it, and saying so here is the difference between someone waiting and
            someone who thinks the form silently failed. */}
        <p className="text-black font-medium uppercase tracking-widest text-xs mb-3 max-w-md">
          Someone is looking at your item now.
        </p>
        <p className="text-black/70 font-medium uppercase tracking-widest text-[11px] leading-[1.9] mb-10 max-w-md">
          You will hear either an offer, or what would need to change before we
          can make one. Nothing is listed until you have seen a number and
          agreed to it.
        </p>
        {/* The vendor has just finished a form and is at their most willing to
            read one more thing. Said here, in three lines, so the PAN request
            that arrives later is expected rather than alarming. */}
        <p className="text-black/50 font-medium uppercase tracking-widest text-[10px] leading-[1.9] mb-10 max-w-md">
          You don't need a GSTIN. We buy your item and resell it under ours.{' '}
          <Link to="/vendor-policy" className="underline text-black/70 hover:text-black">How this works</Link>
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button onClick={() => navigate('/vendor-portal')}
            className="bg-black px-10 py-5 text-xs font-black uppercase tracking-widest text-white hover:bg-zinc-800">
            Your items
          </button>
          <button onClick={resetForm}
            className="border border-black px-10 py-5 text-xs font-black uppercase tracking-widest text-black hover:bg-black hover:text-white">
            Sell another
          </button>
        </div>
        <button onClick={() => navigate('/')}
          className="mt-6 text-[11px] font-black uppercase tracking-[0.25em] text-black/40 hover:text-black">
          Back to zarketplace
        </button>

        <a
          href="https://wa.me/918505927538"
          target="_blank"
          rel="noreferrer"
          className="mt-8 text-[10px] font-bold uppercase tracking-widest text-black/40 hover:text-black underline"
        >
          Something off, or an idea to make this better? WhatsApp us
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-20 sm:pb-24">
        {/* The page opens as an offer, not as a form. The proposition is the
            first thing read and the fields start well below it, so the work
            reads as the consequence of the offer rather than the price of
            finding out what it is. */}
        {step === 0 ? (
          <div className="mb-10 sm:mb-12 flex flex-col gap-5 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-[0.95]">
              Tell us what you want for it.
              <span className="block text-black/55">We'll tell you what we'll pay.</span>
            </h1>
            <p className="body-longform max-w-[52ch]">
              You name your price. We come back with what we'll pay, and you decide before
              anything goes live. Accept, and that number is locked — we collect the item,
              check it, and pay you.
            </p>
          </div>
        ) : (
          <h1 className="mb-8 text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-none">
            {STEP_LABELS[step]}
          </h1>
        )}

        {/* Progress. Every step is reachable directly and only Publish is gated,
            so the names carry a tick once their step validates: seeing what is
            already done is what makes the flow feel shorter. */}
        {/* One grid, so each label sits under its own segment instead of the
            two rows drifting apart. The percentage is gone: "Step 4 of 5"
            alongside "75%" was two counts of the same thing that disagreed,
            because the bar measured gaps between steps while the text counted
            steps. The step name carries the answer on a phone, where five
            labels cannot fit across 375px, and the labels appear from sm up. */}
        <div className="mb-10 flex flex-col gap-3">
          <div className="flex items-baseline justify-between text-[11px] font-black uppercase tracking-[0.2em]">
            <span className="text-black/40">Step {step + 1} of {STEP_LABELS.length}</span>
            <span className="text-black sm:hidden">{STEP_LABELS[step]}</span>
          </div>

          {/* Columns follow the steps. This was hardcoded to five and kept
              that way when the flow became three, so the bars filled
              three-fifths of the width and stopped. */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEP_LABELS.length}, minmax(0, 1fr))` }}>
            {STEP_LABELS.map((label, i) => {
              const complete = stepComplete(i);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => goToStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  aria-label={`Step ${i + 1}, ${label}${complete ? ', done' : ''}`}
                  className="group flex flex-col gap-2 text-left"
                >
                  <span className={cn('h-1.5 w-full rounded-full transition-colors',
                    i === step ? 'bg-black' : complete ? 'bg-black/40' : 'bg-black/10')} />
                  <span className={cn(
                    'hidden sm:flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                    i === step ? 'text-black' : complete ? 'text-black/50 group-hover:text-black' : 'text-black/25 group-hover:text-black/50',
                  )}>
                    <span className="truncate">{label}</span>
                    {complete && <Check className="h-3 w-3 shrink-0" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
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
                onRemove={removeImage}
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
                originalTags={originalTags} setOriginalTags={setOriginalTags}
                originalPackaging={originalPackaging} setOriginalPackaging={setOriginalPackaging}
                itemAltered={itemAltered} setItemAltered={setItemAltered}
                wearFrequency={wearFrequency} setWearFrequency={setWearFrequency}
              />
            )}

            {step === 2 && (
              <PriceStep
                condition={condition} setCondition={setCondition}
                hasFlaws={hasFlaws} setHasFlaws={setHasFlaws}
                flawsDescription={flawsDescription} setFlawsDescription={setFlawsDescription}
                priceVal={priceVal} setPriceVal={setPriceVal}
                declarations={declarations} setDeclarations={setDeclarations}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {stepError && (
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-red-600">{stepError}</p>
        )}

        {uploadProgress && (
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-black/50">
            Optimising photo {uploadProgress.done + 1} of {uploadProgress.total}...
          </p>
        )}

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center justify-between mt-12 pt-8 border-t border-black/5">
          <button type="button" onClick={goBack} disabled={step === 0}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black disabled:opacity-20 hover:text-black/60">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {step < STEP_LABELS.length - 1 ? (
            <button type="button" onClick={goNext}
              className="inline-flex items-center gap-2 bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <button type="button" onClick={handlePublish} disabled={!canPublish}
                className="inline-flex items-center gap-3 bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 disabled:opacity-40">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Sending' : 'Send it to us'}
              </button>
              {blockedReason && (
                <p className="text-[11px] font-normal text-black/50">{blockedReason}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          {step === STEP_LABELS.length - 1 && (
            <p className="text-xs font-normal leading-relaxed text-black/50 max-w-[46ch]">
              Nothing is listed yet. We'll look at it and come back within 24 hours
              with either an offer or what needs changing first.
            </p>
          )}
          <p className="hidden sm:block text-[10px] font-bold uppercase tracking-widest text-black/25">
            Something not working?{' '}
            <Link to="/contact" className="underline hover:text-black">Tell us</Link>
            {' · '}
            <a href="https://wa.me/918505927538" target="_blank" rel="noreferrer" className="underline hover:text-black">WhatsApp</a>
          </p>
        </div>
      </div>

      {/* Mobile step nav. Sits at the end of the step rather than riding the
          scroll: a bar pinned over the form eats screen on a phone and covers
          the field you are typing into. */}
      <div className="sm:hidden mx-auto w-full max-w-3xl border-t border-black/10 px-4 py-6 flex items-center gap-3">
        {step > 0 && (
          <button type="button" onClick={goBack}
            className="shrink-0 h-14 w-14 flex items-center justify-center border border-black/20 text-black">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {step < STEP_LABELS.length - 1 ? (
          <button type="button" onClick={goNext}
            className="flex-1 bg-black py-4 text-xs font-black uppercase tracking-[0.3em] text-white flex items-center justify-center gap-2">
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex-1 flex flex-col gap-2">
            <button type="button" onClick={handlePublish} disabled={!canPublish}
              className="w-full bg-black py-4 text-xs font-black uppercase tracking-[0.3em] text-white disabled:opacity-40 flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Sending' : 'Send it to us'}
            </button>
            {blockedReason && (
              <p className="text-center text-[11px] font-normal text-black/50">{blockedReason}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-black">
      {children}
      {optional && (
        <span className="text-[11px] font-medium tracking-normal text-black/35">Optional</span>
      )}
    </label>
  );
}

// One step above a field label and clearly not one of them. Every section used
// to be set in the same register as the fields under it, so nothing told you
// where one group ended and the next began.
function SectionHeading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tighter leading-none">{children}</h3>
      {note && <p className="text-sm font-normal leading-relaxed text-black/50 max-w-[52ch]">{note}</p>}
    </div>
  );
}

function YesNoToggle({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange(true)}
        className={cn('border py-3 text-xs font-black uppercase tracking-widest transition-all',
          value === true ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
        Yes
      </button>
      <button type="button" onClick={() => onChange(false)}
        className={cn('border py-3 text-xs font-black uppercase tracking-widest transition-all',
          value === false ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
        No
      </button>
    </div>
  );
}

// Short one-line trust cue - uppercase micro-label, matches the site's
// system-voice register.
function TrustNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-normal leading-relaxed text-black/45">{children}</p>;
}

function PhotosStep({ imagePreviews, onAdd, onRemove, originals, cleaning, onUseOriginal }: {
  imagePreviews: string[];
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (i: number) => void;
  originals: Record<number, { file: File; preview: string }>;
  cleaning: Record<number, boolean>;
  onUseOriginal: (i: number) => void;
}) {
  const slotCount = Math.max(PHOTO_SLOT_LABELS.length, imagePreviews.length + 1);
  const slots = Array.from({ length: Math.min(slotCount, MAX_IMAGES) }, (_, i) => i);

  return (
    <div className="flex flex-col gap-12">
      {/* One heading and one line. This was a kicker, a headline, three
          numbered tips, a footnote and a plug for a third-party background
          remover - six pieces of chrome to say "lay it flat in daylight". The
          rule that matters, that we never turn an item down over its photos,
          stays; the scaffolding does not, and we strip backgrounds ourselves. */}
      <SectionHeading note="Daylight, flat, no mirror. The first photo is the cover.">
        Photos
      </SectionHeading>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {slots.map((i) => {
          const label = PHOTO_SLOT_LABELS[i] ?? `Photo ${i + 1}`;
          const required = i < 2;
          const preview = imagePreviews[i];
          return preview ? (
            <div key={i} className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-50 border border-black/5 group">
              <img src={preview} alt={label} className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute top-2 left-2 bg-black px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">Cover</span>
              )}
              <button type="button" onClick={() => onRemove(i)}
                className="absolute top-2 right-2 bg-black/70 p-2 text-white hover:bg-black transition-all">
                <X className="h-3 w-3" />
              </button>
              {cleaning[i] && (
                <span className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                  Tidying…
                </span>
              )}
              {originals[i] && (
                <button
                  type="button" onClick={() => onUseOriginal(i)}
                  className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-black hover:bg-white"
                >
                  Use original
                </button>
              )}
            </div>
          ) : (
            <label key={i} className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-2 bg-zinc-50 border border-dashed border-black/15 hover:border-black/40 transition-all group p-3 text-center">
              <div className="h-10 w-10 rounded-full border border-black/10 flex items-center justify-center group-hover:border-black/30 transition-all shrink-0">
                <Plus className="h-4 w-4 text-black/30 group-hover:text-black" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-black">{label}</span>
              {!required && <span className="text-[9px] font-bold uppercase tracking-widest text-black/30">Optional</span>}
              <input type="file" accept="image/*" className="hidden" onChange={onAdd} multiple />
            </label>
          );
        })}
      </div>

      {/* Background-remover recommendations live in the Seller Policy now: they
          are useful, but not worth sending someone out of a half-finished form. */}
      <p className="text-xs text-black font-black uppercase tracking-widest">
        {imagePreviews.length}/{MAX_IMAGES} photos uploaded.
      </p>
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
  originalTags: boolean | null; setOriginalTags: (v: boolean) => void;
  originalPackaging: boolean | null; setOriginalPackaging: (v: boolean) => void;
  itemAltered: boolean | null; setItemAltered: (v: boolean) => void;
  wearFrequency: string | null; setWearFrequency: (v: string) => void;
}) {
  const {
    title, setTitle, brand, setBrand, gender, setGender,
    selectedCategory, setSelectedCategory, sizeType, setSizeType, sizeDetail, setSizeDetail,
    description, setDescription,
    originalTags, setOriginalTags, originalPackaging, setOriginalPackaging,
    itemAltered, setItemAltered, wearFrequency, setWearFrequency,
  } = props;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-start gap-3 border-l-2 border-black pl-4">
        <AlertTriangle className="h-4 w-4 text-black mt-0.5 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 leading-relaxed">
          One listing, one item. Five of the same thing means five listings.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <SectionHeading>The item</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3">
            <FieldLabel>What is it?</FieldLabel>
            <input value={title} onChange={(e) => setTitle(e.target.value)} type="text" placeholder="e.g. Vintage 90s Biker Jacket"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Brand</FieldLabel>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} type="text" placeholder="e.g. Levi's"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Who is it for?</FieldLabel>
            <select value={gender} onChange={(e) => setGender(e.target.value)}
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none">
              <option value="">Select Gender</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Category</FieldLabel>
            <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setSizeType(''); }}
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none">
              <option value="">Select Category</option>
              <option value="Tops">Tops</option>
              <option value="Bottoms">Bottoms</option>
              <option value="Outerwear">Outerwear</option>
              <option value="Accessories">Accessories</option>
              <option value="Shoes">Shoes</option>
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Size</FieldLabel>
            <select value={sizeType} onChange={(e) => setSizeType(e.target.value)} disabled={!selectedCategory}
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none disabled:opacity-50">
              <option value="">{selectedCategory ? 'Select Size' : 'Select Category First'}</option>
              {selectedCategory && CATEGORY_SIZES[selectedCategory]?.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel optional>Size detail</FieldLabel>
            <input value={sizeDetail} onChange={(e) => setSizeDetail(e.target.value)} type="text" placeholder="e.g. 34x30 or Oversized fit"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FieldLabel optional>Anything a photo cannot show</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="Fit, material, how it runs, anything a photo can't show."
            className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20" />
          <TrustNote>Optional, but items with one sell faster. You own what it says.</TrustNote>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <SectionHeading>Worth mentioning</SectionHeading>
        {/* Yes/No rather than switches: an unset switch would publish "no
            packaging" as a claim the seller never made. Three states matter
            here (yes, no, unanswered) and a switch only has two. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          <div className="flex flex-col gap-3">
            <FieldLabel optional>Tags still attached</FieldLabel>
            <YesNoToggle value={originalTags} onChange={setOriginalTags} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel optional>Original packaging</FieldLabel>
            <YesNoToggle value={originalPackaging} onChange={setOriginalPackaging} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel optional>Altered or tailored</FieldLabel>
            <YesNoToggle value={itemAltered} onChange={setItemAltered} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel optional>Times worn</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {WEAR_OPTIONS.map((w) => (
                <button key={w.key} type="button" onClick={() => setWearFrequency(w.key)}
                  className={cn('border py-3 text-[11px] font-black uppercase tracking-widest transition-all',
                    wearFrequency === w.key ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConditionStep({ condition, setCondition, hasFlaws, setHasFlaws, flawsDescription, setFlawsDescription }: {
  condition: string; setCondition: (v: string) => void;
  hasFlaws: boolean | null; setHasFlaws: (v: boolean) => void;
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
          {CONDITIONS.map((c) => (
            <button key={c.name} type="button" onClick={() => setCondition(c.name)}
              className={cn('border p-5 text-left transition-all flex flex-col gap-1.5',
                condition === c.name ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
              <span className="flex items-baseline gap-2 text-xs font-black uppercase tracking-widest">
                {c.name}
                <span className={cn('text-[10px] tracking-[0.2em]', condition === c.name ? 'text-white/60' : 'text-black/40')}>{c.grade}</span>
              </span>
              <span className={cn('text-[13px] font-normal normal-case tracking-normal leading-relaxed', condition === c.name ? 'text-white/85' : 'text-black/70')}>{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <SectionHeading>Any flaws?</SectionHeading>
        {/* Yes before No: the question is "any flaws?", and a Yes/No question
            reads Yes-then-No everywhere else. Leading with No also nudged
            sellers toward the answer that hides flaws, which is the one
            answer that costs us a dispute. */}
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          <button type="button" onClick={() => setHasFlaws(true)}
            className={cn('border py-4 text-xs font-black uppercase tracking-widest transition-all',
              hasFlaws === true ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            Yes
          </button>
          <button type="button" onClick={() => setHasFlaws(false)}
            className={cn('border py-4 text-xs font-black uppercase tracking-widest transition-all',
              hasFlaws === false ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            No
          </button>
        </div>

        <AnimatePresence>
          {hasFlaws && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-3">
                <FieldLabel>Describe the flaw</FieldLabel>
                <textarea value={flawsDescription} onChange={(e) => setFlawsDescription(e.target.value)} rows={3}
                  placeholder="e.g. small stain on the left cuff, loose stitching on the hem"
                  className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20" />
                <TrustNote>Add a close-up in Photos. Undisclosed flaws are what disputes are made of.</TrustNote>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


// Condition and price, together. They are the two judgements a vendor makes
// about the same object, and splitting them across two screens made the flow
// feel longer than it is.
//
// The publish confirmations live here rather than on a Review screen of their
// own. Review restated what the form already showed and asked for six ticks;
// the consent that binds anyone is the agreement at offer acceptance, which is
// where money is promised. Two lines here, three clauses there.
function PriceStep({
  condition, setCondition, hasFlaws, setHasFlaws, flawsDescription, setFlawsDescription,
  priceVal, setPriceVal, declarations, setDeclarations,
}: {
  condition: string; setCondition: (v: string) => void;
  hasFlaws: boolean | null; setHasFlaws: (v: boolean) => void;
  flawsDescription: string; setFlawsDescription: (v: string) => void;
  priceVal: string; setPriceVal: (v: string) => void;
  declarations: Record<string, boolean>;
  setDeclarations: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div className="flex flex-col gap-12">
      <ConditionStep
        condition={condition} setCondition={setCondition}
        hasFlaws={hasFlaws} setHasFlaws={setHasFlaws}
        flawsDescription={flawsDescription} setFlawsDescription={setFlawsDescription}
      />

      <div className="flex flex-col gap-4">
        <SectionHeading note="Your ask, not the price we list it at. We come back with what we will pay.">What do you want for it?</SectionHeading>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-black tracking-tighter">Rs.</span>
          <input
            type="number" inputMode="numeric" value={priceVal}
            onChange={(e) => setPriceVal(e.target.value)}
            placeholder="3500"
            className="w-full border-b border-black/10 py-3 text-3xl font-black tracking-tighter focus:border-black focus:outline-none placeholder:text-black/15"
          />
        </div>
        <TrustNote>This is your ask. We come back with what we will pay.</TrustNote>
      </div>

      {/* Two lines, both load-bearing. The first is the one rule that makes a
          listing a listing; the second carries accuracy, flaws and
          authenticity in one sentence a person will actually read. */}
      <div className="flex flex-col gap-1">
        <SectionHeading>Two things to confirm</SectionHeading>
        {PUBLISH_CONFIRMATIONS.map((item) => {
          const on = !!declarations[item.key];
          return (
            <button
              key={item.key} type="button"
              onClick={() => setDeclarations((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
              aria-pressed={on}
              className="group flex items-start gap-4 py-4 text-left border-b border-black/5 last:border-b-0"
            >
              <span className={cn(
                'mt-px flex h-5 w-5 shrink-0 items-center justify-center border transition-colors',
                on ? 'border-black bg-black text-white' : 'border-black/25 group-hover:border-black',
              )}>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="text-sm font-medium leading-relaxed text-black">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

