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
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { normalizeState } from '../lib/states';
import { StateSelect } from '../components/StateSelect';
import { cn, formatCurrency } from '../lib/utils';

const slog = log('sell');

const CATEGORY_SIZES: Record<string, string[]> = {
  'Tops': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Bottoms': ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  'Outerwear': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Accessories': ['One Size'],
  'Shoes': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
};

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

// The three ways an item can reach a buyer. Two of them are our courier and
// differ only in who absorbs the fee, so they stay one shipping_mode with
// free_shipping deciding the payer; the third is the seller's own courier.
type ShippingMode = 'platform' | 'self_ship';

const SHIPPING_CHOICES: Array<{
  key: string;
  mode: ShippingMode;
  free?: boolean;
  label: string;
  recommended?: boolean;
  body: (rate: number) => string;
}> = [
  {
    key: 'platform_free',
    mode: 'platform',
    free: true,
    label: 'We ship it, you cover delivery',
    recommended: true,
    body: (rate) => `Items sell better when checkout says free. The ${formatCurrency(rate)} comes out of your payout instead.`,
  },
  {
    key: 'platform_buyer',
    mode: 'platform',
    free: false,
    label: 'We ship it, buyer pays delivery',
    body: (rate) => `We book the courier and collect from your door. The buyer pays ${formatCurrency(rate)} at checkout and you keep your full price.`,
  },
  {
    key: 'self_ship',
    mode: 'self_ship',
    label: 'You ship it yourself',
    body: () => 'Use your own courier, exactly as you do now. You pay for it, you add the tracking link, and your payout takes longer.',
  },
];

const MAX_IMAGES = 8;

const STEP_LABELS = ['Photos', 'Details', 'Condition', 'Price', 'Review'];

interface Declarations {
  oneItem: boolean;
  photosActual: boolean;
  disclosedFlaws: boolean;
  accurate: boolean;
  authenticIfMarked: boolean;
}

export function Sell() {
  useDocumentTitle('Sell');

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

  const [showSalePrice, setShowSalePrice] = React.useState(false);
  const [priceVal, setPriceVal] = React.useState('');
  const [salePriceVal, setSalePriceVal] = React.useState('');
  const [shippingCategories, setShippingCategories] = React.useState<ShippingCategory[]>([]);
  const [shippingCategory, setShippingCategory] = React.useState('');
  // Seller-funded free shipping: buyer pays no shipping line, and the real
  // courier cost is deducted from the seller's payout instead of the buyer's
  // total (see migration shipping_reprice_and_seller_free_shipping). Off by
  // default - it's a choice, not the default cost to the seller.
  const [freeShipping, setFreeShipping] = React.useState(false);
  // 'platform' = our courier (free_shipping above decides who pays for it),
  // 'self_ship' = the seller's own courier.
  const [shippingMode, setShippingMode] = React.useState<ShippingMode>('platform');

  // The state this item ships from. Asked here rather than inherited from the
  // pickup address, because that address is only collected at the seller's
  // first sale - a brand new seller has none, and a listing with no state
  // cannot be shown to the right buyers at all. Sticky across listings: it is
  // an account fact, not an item fact, so resetForm deliberately leaves it.
  const [pickupState, setPickupState] = React.useState('');

  const [authenticity, setAuthenticity] = React.useState<'confirmed' | 'unsure' | null>(null);
  const [declarations, setDeclarations] = React.useState<Declarations>({
    oneItem: false, photosActual: false, disclosedFlaws: false, accurate: false, authenticIfMarked: false,
  });

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
      .select('gender, category, shipping_category, pickup_state')
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
        // Normalized on the way in: rows written before the dropdown existed
        // hold whatever the seller typed, and an unrecognisable value has to
        // fall through to an empty select rather than a wrong pre-selection.
        const lastState = normalizeState(data.pickup_state);
        if (lastState) setPickupState((prev) => prev || lastState);
      });
  }, [user]);

  // The saved pickup address wins over the last listing when both exist: it is
  // the address a courier will actually collect from.
  React.useEffect(() => {
    const saved = normalizeState((profile?.pickup_address as { state?: string } | null)?.state);
    if (saved) setPickupState((prev) => prev || saved);
  }, [profile]);

  // Default the shipping category to the first option once loaded, unless
  // the previous-listing prefill above already set one.
  React.useEffect(() => {
    if (shippingCategories.length > 0) {
      setShippingCategory((prev) => prev || shippingCategories[0].key);
    }
  }, [shippingCategories]);

  // priceVal is now what the buyer actually pays, and salePriceVal is the
  // optional higher "was" price shown struck through. The old arrangement had
  // the required field mean "original price" and the optional one mean "what
  // you get paid", so a seller typing their real price into the first box was
  // quietly setting a strike-through instead.
  const salePriceInvalid =
    showSalePrice && !!salePriceVal && !!priceVal && Number(salePriceVal) <= Number(priceVal);

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
      setImageFiles((prev) => [...prev, ...accepted]);
      setImagePreviews((prev) => [...prev, ...urls]);
    }).catch((err) => {
      slog.error('FileReader failed', err);
      alert('Failed to read one of the images.');
    }).finally(() => { input.value = ''; });
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // What must be true for each step. Navigation between steps is free - this
  // only gates the final Publish, so sellers can jump ahead, fill things out
  // of order, and come back. If anything's missing at Publish time, we jump
  // to the first incomplete step and show what's needed there.
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (imageFiles.length === 0) return 'Upload at least one photo.';
    }
    if (s === 1) {
      if (!title.trim()) return 'Enter an item name.';
      if (!brand.trim()) return 'Enter a brand.';
      if (!gender) return 'Select a gender.';
      if (!selectedCategory) return 'Select a category.';
      if (!sizeType) return 'Select a size.';
      const banned = findBannedPhrase(`${title} ${brand} ${description}`);
      if (banned) return `Remove "${banned}" - each listing is one item, not a batch or store catalogue.`;
    }
    if (s === 2) {
      if (!condition) return 'Select a condition.';
      if (hasFlaws === null) return 'Let buyers know whether this item has any flaws.';
      if (hasFlaws && !flawsDescription.trim()) return 'Describe the flaw(s), or select "No" if there are none.';
      if (hasFlaws && imageFiles.length < 2) return 'Add a close-up photo of the flaw in your photos.';
    }
    if (s === 3) {
      if (!priceVal || Number(priceVal) <= 0) return 'Enter a price.';
      if (salePriceInvalid) return 'The "was" price has to be higher than your price, or buyers see a discount that is not one.';
      if (shippingMode === 'platform' && !shippingCategory) return 'Choose a shipping category.';
      if (!pickupState) return 'Select the state you ship from.';
      // Only bites when the seller is absorbing the courier cost. With
      // buyer-paid shipping a low price is fine, the seller keeps all of it.
      // Mirrors the server rule listings_require_positive_payout, which is what
      // actually rejects the insert.
      const floor = shippingCategories.find((c) => c.key === shippingCategory)?.rate ?? 0;
      const lowest = Number(priceVal);
      if (freeShipping && floor > 0 && lowest <= floor) {
        return `With free delivery the ${formatCurrency(floor)} courier cost comes out of your payout, so ${formatCurrency(lowest)} would pay you nothing. Price it above ${formatCurrency(floor)}, or turn free delivery off.`;
      }
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

  const allDeclared = Object.values(declarations).every(Boolean);
  const canPublish = authenticity !== null && allDeclared && !loading;

  // Review is the only step without its own validator: it is complete when the
  // two things it asks for are answered.
  const stepComplete = (s: number) =>
    s === STEP_LABELS.length - 1 ? authenticity !== null && allDeclared : validateStep(s) === null;

  const handlePublish = async () => {
    setStepError(null);
    if (!user) { setStepError('Sign in first.'); return; }

    for (let s = 0; s <= 3; s++) {
      const err = validateStep(s);
      if (err) { setStep(s); setStepError(err); scrollToTop(); return; }
    }
    if (authenticity === null) { setStepError('Confirm whether this item is authentic.'); scrollToTop(); return; }
    if (!allDeclared) { setStepError('Check every declaration below before publishing.'); scrollToTop(); return; }

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
      const hasWas = showSalePrice && !!salePriceVal;
      const price = hasWas ? Number(salePriceVal) : Number(priceVal);
      const sale_price = hasWas ? Number(priceVal) : null;

      const { error } = await supabase.from('listings').insert({
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
        pickup_address: profile?.pickup_address ?? null,
        // Stored on the listing, not read through the profile at query time:
        // a seller who later moves must not silently relocate every item they
        // have already listed, and the buyer-facing view can only filter on a
        // column it actually has.
        pickup_state: pickupState,
        shipping_category: shippingCategory,
        free_shipping: freeShipping,
        has_flaws: !!hasFlaws,
        flaws_description: hasFlaws ? flawsDescription.trim() : null,
        original_tags_attached: originalTags,
        original_packaging: originalPackaging,
        item_altered: itemAltered,
        wear_frequency: wearFrequency,
        authenticity_confirmed: authenticity === 'confirmed',
        seller_declared_at: new Date().toISOString(),
        status: 'pending',
      });
      if (error) throw error;
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
    setPriceVal(''); setSalePriceVal(''); setShowSalePrice(false);
    setAuthenticity(null);
    setDeclarations({ oneItem: false, photosActual: false, disclosedFlaws: false, accurate: false, authenticIfMarked: false });
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-24 sm:pt-32 pb-20 sm:pb-32 text-center flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-black text-white mb-8">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter uppercase mb-4">Listing Submitted</h1>
        {/* Every listing inserts as 'pending' and waits on admin approval, and
            new seller listings are being held rather than published right now.
            Saying so here is the difference between a seller who is waiting and
            a seller who thinks the form silently failed. */}
        <p className="text-black font-medium uppercase tracking-widest text-xs mb-3 max-w-md">
          Your listing is saved. We review every listing before it goes live.
        </p>
        <p className="text-black/70 font-medium uppercase tracking-widest text-[11px] leading-[1.9] mb-3 max-w-md">
          New seller listings are archived until further notice, so it will not
          appear in the feed yet. It stays on your account and we will be in
          touch when listings reopen.
        </p>
        <p className="text-black/50 font-medium uppercase tracking-widest text-xs mb-10 max-w-md">
          Meanwhile, generate a branded Instagram image and share it.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button onClick={() => navigate('/seller-portal?tab=tools')}
            className="bg-black px-10 py-5 text-xs font-black uppercase tracking-widest text-white hover:bg-zinc-800">
            Generate Instagram image
          </button>
          <button onClick={resetForm}
            className="border border-black px-10 py-5 text-xs font-black uppercase tracking-widest text-black hover:bg-black hover:text-white">
            List Another
          </button>
        </div>
        <button onClick={() => navigate('/')}
          className="mt-6 text-[11px] font-black uppercase tracking-[0.25em] text-black/40 hover:text-black">
          Back to zarketplace
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32">
        <div className="mb-10 flex flex-col gap-4">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tighter uppercase leading-none">Create Listing</h1>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-black/40">List in under two minutes.</p>
        </div>

        {/* Progress. Every step is reachable directly and only Publish is gated,
            so the names carry a tick once their step validates: seeing what is
            already done is what makes the flow feel shorter. */}
        <div className="mb-10 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.2em] text-black/40">
            <span>Step {step + 1} of {STEP_LABELS.length}</span>
            <span>{Math.round((step / (STEP_LABELS.length - 1)) * 100)}%</span>
          </div>
          <div className="flex gap-1.5">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className={cn('h-1.5 flex-1 rounded-full transition-colors',
                i === step ? 'bg-black' : stepComplete(i) ? 'bg-black/40' : 'bg-black/10')} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STEP_LABELS.map((label, i) => {
              const complete = stepComplete(i);
              return (
                <button key={label} type="button" onClick={() => goToStep(i)}
                  className={cn('flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors',
                    i === step ? 'text-black' : complete ? 'text-black/50 hover:text-black' : 'text-black/25 hover:text-black/50')}
                >
                  {label}
                  {complete && <Check className="h-3 w-3" strokeWidth={3} />}
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
              <ConditionStep
                condition={condition} setCondition={setCondition}
                hasFlaws={hasFlaws} setHasFlaws={setHasFlaws}
                flawsDescription={flawsDescription} setFlawsDescription={setFlawsDescription}
              />
            )}

            {step === 3 && (
              <PriceStep
                priceVal={priceVal} setPriceVal={setPriceVal}
                showSalePrice={showSalePrice} setShowSalePrice={setShowSalePrice}
                salePriceVal={salePriceVal} setSalePriceVal={setSalePriceVal}
                salePriceInvalid={salePriceInvalid}
                shippingCategories={shippingCategories}
                shippingCategory={shippingCategory} setShippingCategory={setShippingCategory}
                freeShipping={freeShipping} setFreeShipping={setFreeShipping}
                pickupState={pickupState} setPickupState={setPickupState}
                shippingMode={shippingMode} setShippingMode={setShippingMode}
              />
            )}

            {step === 4 && (
              <ReviewStep
                imagePreviews={imagePreviews}
                title={title} brand={brand}
                price={showSalePrice && salePriceVal ? salePriceVal : priceVal}
                salePrice={showSalePrice && salePriceVal ? priceVal : ''}
                condition={condition} hasFlaws={hasFlaws} flawsDescription={flawsDescription}
                shippingCategory={shippingCategory} shippingCategories={shippingCategories}
                shippingMode={shippingMode} freeShipping={freeShipping}
                authenticity={authenticity} setAuthenticity={setAuthenticity}
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
            <button type="button" onClick={handlePublish} disabled={!canPublish}
              className="inline-flex items-center gap-3 bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 disabled:opacity-40">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish Listing
            </button>
          )}
        </div>

        <p className="hidden sm:block mt-6 text-center text-[10px] font-bold uppercase tracking-widest text-black/30">
          Something here not working?{' '}
          <Link to="/contact" className="underline text-black/50 hover:text-black">Send feedback</Link>
        </p>
        <div className="hidden sm:block mt-10 pt-10 border-t border-black/5" />
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
          <button type="button" onClick={handlePublish} disabled={!canPublish}
            className="flex-1 bg-black py-4 text-xs font-black uppercase tracking-[0.3em] text-white disabled:opacity-40 flex items-center justify-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish Listing
          </button>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-black uppercase tracking-widest">{children}</label>;
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
  return <p className="text-xs font-bold uppercase tracking-widest text-black/50 leading-relaxed">{children}</p>;
}

function PhotosStep({ imagePreviews, onAdd, onRemove }: {
  imagePreviews: string[];
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (i: number) => void;
}) {
  const slotCount = Math.max(PHOTO_SLOT_LABELS.length, imagePreviews.length + 1);
  const slots = Array.from({ length: Math.min(slotCount, MAX_IMAGES) }, (_, i) => i);

  return (
    <div className="flex flex-col gap-8">
      {/* The one-item rule stays on screen and stays first: it is the only rule
          that blocks publishing (banned-phrase check on step 2), so it cannot
          hide in a tip the seller reads after being stopped. */}
      <div className="flex items-start gap-3 border-l-2 border-black pl-4">
        <AlertTriangle className="h-4 w-4 text-black mt-0.5 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 leading-relaxed">
          One listing, one item. Five of the same thing means five listings.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Item Photos</h3>
        <TrustNote>
          Natural light, plain background, whole item in frame. No screenshots or stock photos.
          <br />
          Messy background? Strip it free with{' '}
          <a href="https://www.photoroom.com/tools/background-remover" target="_blank" rel="noreferrer"
            className="underline text-black hover:text-black/60">PhotoRoom</a>
          {' '}or{' '}
          <a href="https://www.remove.bg/" target="_blank" rel="noreferrer"
            className="underline text-black hover:text-black/60">remove.bg</a>.
        </TrustNote>
      </div>

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
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Item Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3">
            <FieldLabel>Item Name *</FieldLabel>
            <input value={title} onChange={(e) => setTitle(e.target.value)} type="text" placeholder="e.g. Vintage 90s Biker Jacket"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Brand *</FieldLabel>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} type="text" placeholder="e.g. Levi's"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Gender *</FieldLabel>
            <select value={gender} onChange={(e) => setGender(e.target.value)}
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none">
              <option value="">Select Gender</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Category *</FieldLabel>
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
            <FieldLabel>Size *</FieldLabel>
            <select value={sizeType} onChange={(e) => setSizeType(e.target.value)} disabled={!selectedCategory}
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none disabled:opacity-50">
              <option value="">{selectedCategory ? 'Select Size' : 'Select Category First'}</option>
              {selectedCategory && CATEGORY_SIZES[selectedCategory]?.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Size Detail (Optional)</FieldLabel>
            <input value={sizeDetail} onChange={(e) => setSizeDetail(e.target.value)} type="text" placeholder="e.g. 34x30 or Oversized fit"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FieldLabel>Description</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="Fit, material, how it runs, anything a photo can't show."
            className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20" />
          <TrustNote>Optional, but items with one sell faster. You own what it says.</TrustNote>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">More details (optional)</h3>
        {/* Yes/No rather than switches: an unset switch would publish "no
            packaging" as a claim the seller never made. Three states matter
            here (yes, no, unanswered) and a switch only has two. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          <div className="flex flex-col gap-3">
            <FieldLabel>Tags attached</FieldLabel>
            <YesNoToggle value={originalTags} onChange={setOriginalTags} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Original packaging</FieldLabel>
            <YesNoToggle value={originalPackaging} onChange={setOriginalPackaging} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Altered or tailored</FieldLabel>
            <YesNoToggle value={itemAltered} onChange={setItemAltered} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Times worn</FieldLabel>
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
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Condition *</h3>
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
              <span className={cn('text-[11px] font-bold uppercase tracking-widest leading-[1.8]', condition === c.name ? 'text-white' : 'text-black')}>{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Any flaws? *</h3>
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
                <FieldLabel>Describe the flaw *</FieldLabel>
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

function PriceStep({ priceVal, setPriceVal, showSalePrice, setShowSalePrice, salePriceVal, setSalePriceVal, salePriceInvalid, shippingCategories, shippingCategory, setShippingCategory, freeShipping, setFreeShipping, pickupState, setPickupState, shippingMode, setShippingMode }: {
  priceVal: string; setPriceVal: (v: string) => void;
  showSalePrice: boolean; setShowSalePrice: (v: boolean) => void;
  salePriceVal: string; setSalePriceVal: (v: string) => void;
  salePriceInvalid: boolean;
  shippingCategories: ShippingCategory[];
  shippingCategory: string; setShippingCategory: (v: string) => void;
  freeShipping: boolean; setFreeShipping: (v: boolean) => void;
  pickupState: string; setPickupState: (v: string) => void;
  shippingMode: ShippingMode; setShippingMode: (v: ShippingMode) => void;
}) {
  const selectedRate = shippingCategories.find((c) => c.key === shippingCategory)?.rate ?? 0;
  // The number a buyer would actually pay: the sale price when one is set.
  const effectivePrice = Number(priceVal);
  const belowFloor = freeShipping && selectedRate > 0 && effectivePrice > 0 && effectivePrice <= selectedRate;
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Pricing</h3>
        {/* One decision at a time, stacked rather than side by side. Two money
            fields sitting as equals is what made this confusing: both looked
            like "the price", and the seller had to work out which one they
            were being paid. Now the required field states the payout in its
            own label, and the optional one is plainly a marketing device. */}
        <div className="flex flex-col gap-8 max-w-md">
          <div className="flex flex-col gap-3">
            <FieldLabel>Your price (INR) *</FieldLabel>
            <TrustNote>What the buyer pays, and what you get paid.</TrustNote>
            <input type="number" min={freeShipping && selectedRate ? selectedRate + 1 : 1} value={priceVal} onChange={(e) => setPriceVal(e.target.value)}
              placeholder={selectedRate ? String(selectedRate) : '3500'}
              className={cn('border-b py-4 text-sm font-bold focus:outline-none transition-all placeholder:text-black/20',
                belowFloor ? 'border-red-500 focus:border-red-600' : 'border-black/10 focus:border-black')} />
            {/* Caught here rather than at Continue, so the seller sees it while
                the number is still under their cursor. */}
            {belowFloor && (
              <p className="text-[11px] font-bold uppercase tracking-widest text-red-600 leading-relaxed">
                With free delivery, {formatCurrency(selectedRate)} comes out of your payout.<br />
                At this price you'd receive nothing. Price above {formatCurrency(selectedRate)}, or turn free delivery off.
              </p>
            )}
            <TrustNote>
              {freeShipping
                ? "You keep this minus shipping, since you're covering it. No selling fees."
                : 'You keep this in full. No selling fees.'}
            </TrustNote>
          </div>
          <div className="flex flex-col gap-3 border-t border-black/5 pt-8">
            <div className="flex items-center justify-between">
              <FieldLabel>Show it as a discount (optional)</FieldLabel>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={showSalePrice} onChange={() => setShowSalePrice(!showSalePrice)} />
                <div className="w-8 h-4 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>
            {showSalePrice && (
              <>
                <FieldLabel>Was (INR)</FieldLabel>
                <motion.input initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  type="number" min="1" value={salePriceVal} onChange={(e) => setSalePriceVal(e.target.value)}
                  placeholder={priceVal ? String(Math.round(Number(priceVal) * 1.3)) : '4900'}
                  className={cn('border-b py-4 text-sm font-bold focus:outline-none transition-all placeholder:text-black/20',
                    salePriceInvalid ? 'border-red-500 focus:border-red-600' : 'border-black/10 focus:border-black')} />
                {salePriceInvalid && (
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-600 leading-relaxed">
                    This has to be higher than your price. Buyers see it struck through next to what they pay.
                  </p>
                )}
                <TrustNote>
                  Shown struck through beside your price. It does not change what you are paid.
                </TrustNote>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Shipping</h3>
          <TrustNote>Closest category to your item. Bigger and heavier costs more. We buy the label.</TrustNote>
        </div>

        {/* A dropdown rather than a text box, and the same list everywhere a
            state is captured. This value decides who is allowed to buy the
            item, so "Delhi" and "New Delhi" cannot be two different answers. */}
        <div className="flex flex-col gap-3">
          <FieldLabel>Ships from (state) *</FieldLabel>
          <StateSelect
            value={pickupState}
            onChange={(v) => setPickupState(v ?? '')}
            placeholder="Select your state"
            className="border-b border-black/10 bg-transparent py-4 text-sm font-bold focus:border-black focus:outline-none transition-all"
          />
          <TrustNote>
            Where the courier collects this item. While we complete GST compliance
            setup, only buyers in this state can check out on your listing. We remember
            it for your next listing.
          </TrustNote>
        </div>
        {shippingCategories.length === 0 ? (
          <p className="text-xs font-bold uppercase tracking-widest text-black/30">Loading categories…</p>
        ) : (
          <>
            {/* Money can leave the seller's payout because of this choice, so it
                is stated on the page rather than tucked behind an icon. */}
            <TrustNote>
              Couriers weigh every parcel. If it's much heavier than the category, we may recover
              the difference from your payout, and we'll tell you first.
            </TrustNote>
            {/* Three ways an item can reach a buyer, as three cards rather
                than a toggle plus a hidden third path. Sellers who already
                have a courier were previously unable to list at all. */}
            <div className="flex flex-col gap-3">
              {SHIPPING_CHOICES.map((choice) => {
                const active = choice.mode === shippingMode
                  && (choice.mode === 'self_ship' || choice.free === freeShipping);
                return (
                  <button
                    key={choice.key}
                    type="button"
                    onClick={() => {
                      setShippingMode(choice.mode);
                      if (choice.mode === 'platform') setFreeShipping(!!choice.free);
                      else setFreeShipping(false);
                    }}
                    className={cn('border p-5 text-left transition-all flex items-start justify-between gap-4',
                      active ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}
                  >
                    <div>
                      <span className="block text-xs font-black uppercase tracking-widest">
                        {choice.label}
                        {choice.recommended && (
                          <span className={cn(active ? 'text-white/60' : 'text-black/40')}> (Recommended)</span>
                        )}
                      </span>
                      <span className={cn('block text-[11px] font-bold uppercase tracking-widest leading-[1.8] mt-2 max-w-md',
                        active ? 'text-white/80' : 'text-black/60')}>
                        {choice.body(selectedRate)}
                      </span>
                    </div>
                    <span className={cn('mt-1 h-4 w-4 shrink-0 rounded-full border-2',
                      active ? 'border-white bg-white' : 'border-black/20')} />
                  </button>
                );
              })}
            </div>

            {shippingMode === 'self_ship' && (
              <div className="flex gap-3 border border-amber-500/40 bg-amber-50 px-5 py-4">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                <p className="text-[11px] font-bold uppercase tracking-widest leading-[1.8] text-amber-900">
                  Shipping it yourself means you book the courier and pay for it, and you
                  have to add the tracking link in your seller portal once it is sent. Your
                  payout also takes longer than it would on our courier, because we only
                  release it after delivery is confirmed and we are relying on your
                  tracking to tell us.
                </p>
              </div>
            )}

            {shippingMode === 'platform' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shippingCategories.map((c) => (
                <button key={c.key} type="button" onClick={() => setShippingCategory(c.key)}
                  className={cn('border p-5 text-left transition-all',
                    shippingCategory === c.key ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
                  <span className="block text-xs font-black uppercase tracking-widest">{c.label}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-widest mt-1.5 opacity-70">
                    {freeShipping ? 'Free for buyer' : `Buyer pays ${formatCurrency(c.rate)}`}
                  </span>
                </button>
              ))}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  imagePreviews, title, brand, price, salePrice, condition, hasFlaws, flawsDescription,
  shippingCategory, shippingCategories, shippingMode, freeShipping, authenticity, setAuthenticity, declarations, setDeclarations,
}: {
  imagePreviews: string[]; title: string; brand: string; price: string; salePrice: string;
  condition: string; hasFlaws: boolean | null; flawsDescription: string;
  shippingCategory: string; shippingCategories: ShippingCategory[];
  shippingMode: ShippingMode; freeShipping: boolean;
  authenticity: 'confirmed' | 'unsure' | null; setAuthenticity: (v: 'confirmed' | 'unsure') => void;
  declarations: Declarations;
  setDeclarations: React.Dispatch<React.SetStateAction<Declarations>>;
}) {
  const shipRate = shippingCategories.find((c) => c.key === shippingCategory);

  // Word for word: these are the attestations we stand on when a buyer disputes
  // a listing, so the wording never gets shortened. Ticking them together is
  // fine - only seller_declared_at is stored, so the record is "affirmed at time
  // T" rather than which boxes were tapped, and each one stays visible and
  // individually clearable.
  const DECLARATION_ITEMS: Array<{ key: keyof typeof declarations; label: string }> = [
    { key: 'oneItem', label: 'This listing represents one physical item only.' },
    { key: 'photosActual', label: 'The photos show the actual item being sold.' },
    { key: 'disclosedFlaws', label: 'I have disclosed all known flaws.' },
    { key: 'accurate', label: 'The description and details above are accurate.' },
    { key: 'authenticIfMarked', label: 'If marked authentic, this item is genuine.' },
  ];
  const declaredCount = DECLARATION_ITEMS.filter((d) => declarations[d.key]).length;

  return (
    <div className="flex flex-col gap-10">
      {/* Interstate sale under GST needs a GSTIN, which most individual sellers
          do not have. Until that is sorted, a sale is only valid when the
          buyer and the seller are in the same state. The seller has to know
          that before publishing, not after an order fails to arrive, so it
          sits on Review rather than in a policy page. The pickup address that
          sets the state is collected at first sale in PayoutDetailsForm, which
          carries the matching notice. */}
      <div className="flex gap-3 border border-amber-500/40 bg-amber-50 px-5 py-4">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
        <p className="text-[11px] font-bold uppercase tracking-widest leading-[1.8] text-amber-900">
          While we complete GST compliance setup, only buyers in the same state
          as your pickup address can check out on this listing. Selling to
          another state needs a GSTIN, which we are working on with specific
          sellers. Your price and payout are unaffected.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">Review</h3>
          <TrustNote>What buyers see. Tap any step above to edit.</TrustNote>
        </div>

        <div className="flex gap-5 p-6 bg-zinc-50 border border-black/5">
          {imagePreviews[0] && (
            <div className="h-28 w-20 shrink-0 overflow-hidden border border-black/5">
              <img src={imagePreviews[0]} alt={title} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-xs font-black uppercase tracking-tight truncate">{title || 'Untitled item'}</span>
            <span className="text-xs font-bold uppercase tracking-widest text-black/40">{brand}</span>
            <span className="text-sm font-black">
              {salePrice ? (
                <><span className="text-red-600">{formatCurrency(Number(salePrice))}</span>{' '}<span className="text-black/30 line-through font-bold text-xs">{formatCurrency(Number(price))}</span></>
              ) : formatCurrency(Number(price) || 0)}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-black/40">{condition}</span>
            {hasFlaws ? (
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Flaws disclosed: {flawsDescription.slice(0, 60)}{flawsDescription.length > 60 ? '…' : ''}</span>
            ) : (
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">No flaws disclosed</span>
            )}
            {/* This line said "buyer pays" whatever the seller had chosen,
                which was already wrong for seller-paid delivery. */}
            <span className="text-[11px] font-bold uppercase tracking-widest text-black/40">
              {shippingMode === 'self_ship'
                ? 'Shipping: you send it with your own courier'
                : shipRate
                  ? `Shipping: ${shipRate.label} (${formatCurrency(shipRate.rate)}, ${freeShipping ? 'you cover it' : 'buyer pays'})`
                  : 'Shipping: not set'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50 border-b border-black/5 pb-3">To the best of your knowledge, is this item authentic? *</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button type="button" onClick={() => setAuthenticity('confirmed')}
            className={cn('border p-4 text-left flex items-center gap-2 transition-all',
              authenticity === 'confirmed' ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="text-xs font-black uppercase tracking-widest">Yes, confirmed</span>
          </button>
          <button type="button" onClick={() => setAuthenticity('unsure')}
            className={cn('border p-4 text-left flex items-center gap-2 transition-all',
              authenticity === 'unsure' ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-xs font-black uppercase tracking-widest">I'm not sure</span>
          </button>
        </div>
        {authenticity === 'unsure' && (
          <div className="max-w-md">
            <TrustNote>Buyers will see this as unconfirmed. Proof of purchase in your description helps.</TrustNote>
          </div>
        )}
        <div className="max-w-md">
          <TrustNote>No counterfeits. We remove listings, ask for proof, and suspend repeat offenders.</TrustNote>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4 border-b border-black/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black/50">Before you publish</h3>
            <button
              type="button"
              onClick={() => {
                const next = declaredCount < DECLARATION_ITEMS.length;
                setDeclarations({
                  oneItem: next, photosActual: next, disclosedFlaws: next,
                  accurate: next, authenticIfMarked: next,
                });
              }}
              className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-black border-b border-black pb-0.5 hover:text-black/60 hover:border-black/60 transition-colors"
            >
              {declaredCount === DECLARATION_ITEMS.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <TrustNote>{declaredCount} of {DECLARATION_ITEMS.length} confirmed.</TrustNote>
        </div>
        <div className="flex flex-col gap-3">
          {DECLARATION_ITEMS.map((d) => (
            <label key={d.key} className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={declarations[d.key]}
                onChange={(e) => setDeclarations((prev) => ({ ...prev, [d.key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-black shrink-0" />
              {/* Attestations the seller is agreeing to, so they carry the same
                  weight and face as every other instruction in the form. */}
              <span className="text-[11px] font-bold uppercase tracking-widest text-black leading-[1.8]">{d.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
