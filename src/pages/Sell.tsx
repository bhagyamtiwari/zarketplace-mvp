// Sell page. Guided multi-step listing flow (Photos -> Details ->
// Condition -> Price -> Payout -> Review) optimized for mobile and for
// sellers listing several similar items in one sitting.
//
// Per-listing requirements:
//   * UPI VPA collected twice with paste blocked on the confirm field
//     (admin pays seller to this UPI after delivery + review window).
//   * Instagram handle entered with a fixed `https://www.instagram.com/`
//     prefix; we persist the full URL.
//   * Every listing is exactly one physical item - no multi-size/bulk/
//     wholesale listings. Enforced with a banned-phrase check, not just a
//     notice, since that's the highest-priority rule for a P2P marketplace.

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, CheckCircle2, X, Plus, ChevronLeft, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { PromiseBanner } from '../components/PromiseBanner';
import { UpiVpaInput, VPA_REGEX } from '../components/UpiVpaInput';
import { getShippingCategories, type ShippingCategory } from '../lib/pricing';
import { CONDITIONS } from '../lib/condition';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';
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

const IG_HANDLE_REGEX = /^[A-Za-z0-9._]{1,30}$/;
const MAX_IMAGES = 8;

const STEP_LABELS = ['Photos', 'Details', 'Condition', 'Price', 'Payout', 'Review'];

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

  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [igHandle, setIgHandle] = React.useState('');
  const [vpa, setVpa] = React.useState('');
  const [vpaValid, setVpaValid] = React.useState(false);
  const [vpaPrefilled, setVpaPrefilled] = React.useState(false);

  const [authenticity, setAuthenticity] = React.useState<'confirmed' | 'unsure' | null>(null);
  const [declarations, setDeclarations] = React.useState<Declarations>({
    oneItem: false, photosActual: false, disclosedFlaws: false, accurate: false, authenticIfMarked: false,
  });

  React.useEffect(() => { getShippingCategories().then(setShippingCategories); }, []);

  // Prefill payout + contact details from the saved profile so a seller
  // never retypes them.
  React.useEffect(() => {
    if (!vpaPrefilled && profile?.default_upi_vpa) {
      setVpa(profile.default_upi_vpa);
      setVpaValid(VPA_REGEX.test(profile.default_upi_vpa));
      setVpaPrefilled(true);
    }
  }, [profile, vpaPrefilled]);
  React.useEffect(() => {
    setFullName((prev) => prev || profile?.full_name || '');
    setPhone((prev) => prev || profile?.phone || '');
  }, [profile]);

  // Prefill the fields most likely to repeat across a seller's own listings
  // (gender, shipping category, Instagram handle) from their most recent
  // listing, so listing a second or third similar item is faster. Never
  // prefills condition/flaws - those genuinely vary per item.
  React.useEffect(() => {
    if (!user) return;
    supabase
      .from('listings')
      .select('gender, shipping_category, seller_instagram')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.gender) setGender((prev) => prev || data.gender);
        if (data.shipping_category) setShippingCategory((prev) => prev || data.shipping_category);
        if (data.seller_instagram) {
          const handle = data.seller_instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
          if (handle) setIgHandle((prev) => prev || handle);
        }
      });
  }, [user]);

  // Default the shipping category to the first option once loaded, unless
  // the previous-listing prefill above already set one.
  React.useEffect(() => {
    if (shippingCategories.length > 0) {
      setShippingCategory((prev) => prev || shippingCategories[0].key);
    }
  }, [shippingCategories]);

  const igValid = IG_HANDLE_REGEX.test(igHandle);
  const salePriceInvalid =
    showSalePrice && !!salePriceVal && !!priceVal && Number(salePriceVal) >= Number(priceVal);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const input = e.target;
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_IMAGES - imageFiles.length;
    if (remaining <= 0) { input.value = ''; return; }
    const accepted: File[] = [];
    for (let i = 0; i < fileList.length && accepted.length < remaining; i++) {
      const f = fileList[i]; if (f) accepted.push(f);
    }
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
      if (!description.trim()) return 'Add a description.';
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
      if (salePriceInvalid) return 'Sale price must be lower than the regular price.';
      if (!shippingCategory) return 'Choose a shipping category.';
    }
    if (s === 4) {
      if (!fullName.trim()) return 'Enter your full name.';
      if (!phone.trim()) return 'Enter your phone number.';
      if (!igValid) return 'Enter a valid Instagram handle (letters, numbers, _ or ., max 30).';
      if (!vpaValid) return 'Enter a valid UPI ID, typed twice.';
    }
    return null;
  };

  const goToStep = (s: number) => {
    setStepError(null);
    setStep(Math.max(0, Math.min(s, STEP_LABELS.length - 1)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goNext = () => goToStep(step + 1);
  const goBack = () => goToStep(step - 1);

  const allDeclared = Object.values(declarations).every(Boolean);
  const canPublish = authenticity !== null && allDeclared && !loading;

  const handlePublish = async () => {
    setStepError(null);
    if (!user) { setStepError('Sign in first.'); return; }

    for (let s = 0; s <= 4; s++) {
      const err = validateStep(s);
      if (err) { setStep(s); setStepError(err); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    }
    if (authenticity === null) { setStepError('Confirm whether this item is authentic.'); return; }
    if (!allDeclared) { setStepError('Check every declaration below before publishing.'); return; }

    setLoading(true);
    const tFull = slog.time('full submit');
    try {
      await supabase.from('profiles').update({
        full_name: fullName.trim(),
        phone: phone.trim(),
        default_upi_vpa: vpa,
      }).eq('id', user.id);

      const uploadedUrls: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `${user.id}-${Date.now()}-${i}.${fileExt}`;
        const filePath = `listings/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('listing-images').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('listing-images').getPublicUrl(filePath);
        uploadedUrls.push(publicUrl);
      }

      const seller_instagram = `https://www.instagram.com/${igHandle}`;
      const price = Number(priceVal);
      const sale_price = showSalePrice && salePriceVal ? Number(salePriceVal) : null;

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
        description: description.trim(),
        image_url: uploadedUrls[0],
        image_urls: uploadedUrls,
        seller_id: user.id,
        seller_email: user.email,
        seller_display_name: fullName.trim() || null,
        seller_instagram,
        seller_upi_vpa: vpa,
        shipping_category: shippingCategory,
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
      setSubmitted(true);
    } catch (err: any) {
      slog.error('handlePublish THREW', err);
      tFull.end({ outcome: 'error' });
      setStepError(err?.message || 'Failed to submit listing');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setStep(0);
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
        <p className="text-black font-medium uppercase tracking-widest text-xs mb-12 max-w-md">
          Your item has been sent for approval.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button onClick={() => navigate('/browse')}
            className="bg-black px-12 py-5 text-xs font-black uppercase tracking-widest text-white hover:bg-zinc-800">
            Browse All
          </button>
          <button onClick={resetForm}
            className="border border-black px-12 py-5 text-xs font-black uppercase tracking-widest text-black hover:bg-black hover:text-white">
            List Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-28 sm:pb-0">
      <div className="pt-20">
        <PromiseBanner variant="ticker" />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16">
        <div className="mb-10 flex flex-col gap-4">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tighter uppercase leading-none">Create Listing</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40">Six steps. No selling fees. You keep 100% of your price.</p>
        </div>

        {/* Progress - every step is reachable directly; only Publish is gated */}
        <div className="mb-10 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.2em] text-black/40">
            <span>Step {step + 1} of {STEP_LABELS.length}</span>
            <span>{STEP_LABELS[step]}</span>
          </div>
          <div className="flex gap-1.5">
            {STEP_LABELS.map((label, i) => {
              const complete = i === 5 ? authenticity !== null && allDeclared : validateStep(i) === null;
              return (
                <button key={label} type="button" onClick={() => goToStep(i)}
                  className={cn('h-1.5 flex-1 rounded-full transition-colors',
                    i === step ? 'bg-black' : complete ? 'bg-black/40' : 'bg-black/10')}
                  aria-label={`Go to ${label}`}
                />
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
              />
            )}

            {step === 4 && (
              <PayoutStep
                fullName={fullName} setFullName={setFullName}
                phone={phone} setPhone={setPhone}
                userEmail={user?.email}
                igHandle={igHandle} setIgHandle={setIgHandle} igValid={igValid}
                vpa={vpa} vpaPrefilled={vpaPrefilled}
                onVpaChange={(v, valid) => { setVpa(v); setVpaValid(valid); }}
              />
            )}

            {step === 5 && (
              <ReviewStep
                imagePreviews={imagePreviews}
                title={title} brand={brand} price={priceVal} salePrice={showSalePrice ? salePriceVal : ''}
                condition={condition} hasFlaws={hasFlaws} flawsDescription={flawsDescription}
                shippingCategory={shippingCategory} shippingCategories={shippingCategories}
                authenticity={authenticity} setAuthenticity={setAuthenticity}
                declarations={declarations} setDeclarations={setDeclarations}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {stepError && (
          <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-red-600">{stepError}</p>
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
          We want to hear from you. <Link to="/contact" className="underline text-black/50 hover:text-black">Share your thoughts</Link>
        </p>
      </div>

      {/* Sticky mobile nav */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-black/10 px-4 py-4 flex items-center gap-3">
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
  return <label className="text-[10px] font-black uppercase tracking-widest">{children}</label>;
}

function YesNoToggle({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange(true)}
        className={cn('border py-3 text-[10px] font-black uppercase tracking-widest transition-all',
          value === true ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
        Yes
      </button>
      <button type="button" onClick={() => onChange(false)}
        className={cn('border py-3 text-[10px] font-black uppercase tracking-widest transition-all',
          value === false ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
        No
      </button>
    </div>
  );
}

// Short one-line trust cue - uppercase micro-label, matches the site's
// system-voice register.
function TrustNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-black/50 leading-relaxed">{children}</p>;
}

// Longer explanatory copy (photo tips, payout terms, disclosures). Sentence
// case at readable weight - uppercase tracking-widest becomes a legibility
// tax past one short line.
function InfoText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-black/70 leading-relaxed">{children}</p>;
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
      <div className="flex items-start gap-3 border-l-2 border-black pl-4">
        <AlertTriangle className="h-4 w-4 text-black mt-0.5 shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/60 leading-relaxed">
          One listing, one item. No "available in all sizes," no "DM for other colours." Got five of the same thing? List it five times.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Item Photos</h3>
        <InfoText>Use natural light and a plain background. Show the whole item. No screenshots or stock photos.</InfoText>
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
                <span className="absolute top-2 left-2 bg-black px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white">Cover</span>
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
              <span className="text-[9px] font-black uppercase tracking-widest text-black">{label}</span>
              {!required && <span className="text-[8px] font-bold uppercase tracking-widest text-black/30">Optional</span>}
              <input type="file" accept="image/*" className="hidden" onChange={onAdd} multiple />
            </label>
          );
        })}
      </div>

      <p className="text-[10px] text-black font-black uppercase tracking-widest">
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
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Item Details</h3>
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
          <FieldLabel>Description *</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="Tell buyers about the fit, original retail, and material."
            className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20" />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">More Details</h3>
          <TrustNote>Optional. Detailed listings mean fewer cancellations.</TrustNote>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          <div className="flex flex-col gap-3">
            <FieldLabel>Original tags attached?</FieldLabel>
            <YesNoToggle value={originalTags} onChange={setOriginalTags} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Original packaging included?</FieldLabel>
            <YesNoToggle value={originalPackaging} onChange={setOriginalPackaging} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Has the item been altered?</FieldLabel>
            <YesNoToggle value={itemAltered} onChange={setItemAltered} />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Approximate number of wears</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {WEAR_OPTIONS.map((w) => (
                <button key={w.key} type="button" onClick={() => setWearFrequency(w.key)}
                  className={cn('border py-3 text-[9px] font-black uppercase tracking-widest transition-all',
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
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Condition *</h3>
          <TrustNote>Accurate listings sell faster.</TrustNote>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONDITIONS.map((c) => (
            <button key={c.name} type="button" onClick={() => setCondition(c.name)}
              className={cn('border p-5 text-left transition-all flex items-start gap-3',
                condition === c.name ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
              <span className="text-xl leading-none shrink-0">{c.emoji}</span>
              <span className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest">{c.name}</span>
                <span className={cn('text-xs font-medium leading-relaxed', condition === c.name ? 'text-white/80' : 'text-black/70')}>{c.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Does this item have any flaws? *</h3>
          <TrustNote>Showing flaws builds buyer trust.</TrustNote>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          <button type="button" onClick={() => setHasFlaws(false)}
            className={cn('border py-4 text-[10px] font-black uppercase tracking-widest transition-all',
              hasFlaws === false ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            No
          </button>
          <button type="button" onClick={() => setHasFlaws(true)}
            className={cn('border py-4 text-[10px] font-black uppercase tracking-widest transition-all',
              hasFlaws === true ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            Yes
          </button>
        </div>

        <AnimatePresence>
          {hasFlaws && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-3">
                <FieldLabel>Describe the flaw(s) *</FieldLabel>
                <textarea value={flawsDescription} onChange={(e) => setFlawsDescription(e.target.value)} rows={3}
                  placeholder="e.g. small stain on the left cuff, loose stitching on the hem"
                  className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20" />
                <InfoText>Add a close-up photo of the flaw in Photos. Undisclosed flaws are the most common cause of disputes.</InfoText>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PriceStep({ priceVal, setPriceVal, showSalePrice, setShowSalePrice, salePriceVal, setSalePriceVal, salePriceInvalid, shippingCategories, shippingCategory, setShippingCategory }: {
  priceVal: string; setPriceVal: (v: string) => void;
  showSalePrice: boolean; setShowSalePrice: (v: boolean) => void;
  salePriceVal: string; setSalePriceVal: (v: string) => void;
  salePriceInvalid: boolean;
  shippingCategories: ShippingCategory[];
  shippingCategory: string; setShippingCategory: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Pricing</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3">
            <FieldLabel>Price (INR) *</FieldLabel>
            <input type="number" min="1" value={priceVal} onChange={(e) => setPriceVal(e.target.value)} placeholder="3500"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
            <TrustNote>You keep 100% of this price. No selling fees.</TrustNote>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <FieldLabel>Sale Price (Optional)</FieldLabel>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={showSalePrice} onChange={() => setShowSalePrice(!showSalePrice)} />
                <div className="w-8 h-4 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>
            {showSalePrice && (
              <>
                <motion.input initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  type="number" min="1" value={salePriceVal} onChange={(e) => setSalePriceVal(e.target.value)} placeholder="2900"
                  className={cn('border-b py-4 text-sm font-bold focus:outline-none transition-all placeholder:text-black/20',
                    salePriceInvalid ? 'border-red-500 focus:border-red-600' : 'border-black/10 focus:border-black')} />
                {salePriceInvalid && (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">Sale price must be lower than the regular price.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Shipping</h3>
          <InfoText>Pick the category closest to your item. We buy the shipping label once it sells and you hand it off at pickup.</InfoText>
        </div>
        {shippingCategories.length === 0 ? (
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Loading categories…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {shippingCategories.map((c) => (
              <button key={c.key} type="button" onClick={() => setShippingCategory(c.key)}
                className={cn('border p-5 text-left transition-all',
                  shippingCategory === c.key ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
                <span className="block text-[10px] font-black uppercase tracking-widest">{c.label}</span>
                <span className="block text-[9px] mt-1 opacity-60">Buyer pays {formatCurrency(c.rate)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PayoutStep({ fullName, setFullName, phone, setPhone, userEmail, igHandle, setIgHandle, igValid, vpa, vpaPrefilled, onVpaChange }: {
  fullName: string; setFullName: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  userEmail?: string | null;
  igHandle: string; setIgHandle: (v: string) => void; igValid: boolean;
  vpa: string; vpaPrefilled: boolean;
  onVpaChange: (v: string, valid: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Your Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <div className="flex flex-col gap-3">
            <FieldLabel>Full Name *</FieldLabel>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" placeholder="Jashok Dumar"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Phone Number *</FieldLabel>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+91 98765 43210"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Seller Email</FieldLabel>
            <div className="border-b border-black/10 py-4 text-sm font-bold text-black/60">{userEmail}</div>
          </div>
          <div className="flex flex-col gap-3">
            <FieldLabel>Instagram *</FieldLabel>
            <div className="flex items-center border-b border-black/10 focus-within:border-black transition-all">
              <span className="text-sm font-bold text-black/40 select-none">https://www.instagram.com/</span>
              <input type="text" value={igHandle} onChange={(e) => setIgHandle(e.target.value.replace(/^@/, '').trim())}
                placeholder="username" autoComplete="off"
                className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20" />
            </div>
            {igHandle && !igValid && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">Letters, numbers, _ or . only - max 30 characters.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Payout</h3>
          <InfoText>We pay this UPI ID once the order is delivered and the 48-hour review window closes. Use the same ID you'd share on GPay, PhonePe, or Paytm. Type it twice to catch typos.</InfoText>
        </div>
        <React.Fragment key={vpaPrefilled ? 'prefilled' : 'empty'}>
          <UpiVpaInput value={vpa} onChange={onVpaChange} />
        </React.Fragment>
      </div>
    </div>
  );
}

function ReviewStep({
  imagePreviews, title, brand, price, salePrice, condition, hasFlaws, flawsDescription,
  shippingCategory, shippingCategories, authenticity, setAuthenticity, declarations, setDeclarations,
}: {
  imagePreviews: string[]; title: string; brand: string; price: string; salePrice: string;
  condition: string; hasFlaws: boolean | null; flawsDescription: string;
  shippingCategory: string; shippingCategories: ShippingCategory[];
  authenticity: 'confirmed' | 'unsure' | null; setAuthenticity: (v: 'confirmed' | 'unsure') => void;
  declarations: Declarations;
  setDeclarations: React.Dispatch<React.SetStateAction<Declarations>>;
}) {
  const shipRate = shippingCategories.find((c) => c.key === shippingCategory);

  const DECLARATION_ITEMS: Array<{ key: keyof typeof declarations; label: string }> = [
    { key: 'oneItem', label: 'This listing represents one physical item.' },
    { key: 'photosActual', label: 'The photos show the actual item being sold.' },
    { key: 'disclosedFlaws', label: 'I have disclosed all known flaws.' },
    { key: 'accurate', label: 'The description and details above are accurate.' },
    { key: 'authenticIfMarked', label: 'If marked authentic, this item is genuine.' },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Review</h3>
          <TrustNote>This is what buyers will see. Go back to any step to edit.</TrustNote>
        </div>

        <div className="flex gap-5 p-6 bg-zinc-50 border border-black/5">
          {imagePreviews[0] && (
            <div className="h-28 w-20 shrink-0 overflow-hidden border border-black/5">
              <img src={imagePreviews[0]} alt={title} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-xs font-black uppercase tracking-tight truncate">{title || 'Untitled item'}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">{brand}</span>
            <span className="text-sm font-black">
              {salePrice ? (
                <><span className="text-red-600">{formatCurrency(Number(salePrice))}</span>{' '}<span className="text-black/30 line-through font-bold text-xs">{formatCurrency(Number(price))}</span></>
              ) : formatCurrency(Number(price) || 0)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">{condition}</span>
            {hasFlaws ? (
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Flaws disclosed: {flawsDescription.slice(0, 60)}{flawsDescription.length > 60 ? '…' : ''}</span>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">No flaws disclosed</span>
            )}
            {shipRate && (
              <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Shipping: {shipRate.label} ({formatCurrency(shipRate.rate)}, buyer pays)</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Is this item authentic? *</h3>
        </div>
        <div className="flex flex-col gap-3 max-w-md">
          <button type="button" onClick={() => setAuthenticity('confirmed')}
            className={cn('border p-4 text-left flex items-center gap-3 transition-all',
              authenticity === 'confirmed' ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest">Yes, I confirm this item is authentic.</span>
          </button>
          <button type="button" onClick={() => setAuthenticity('unsure')}
            className={cn('border p-4 text-left flex items-center gap-3 transition-all',
              authenticity === 'unsure' ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest">I'm not sure.</span>
          </button>
        </div>
        {authenticity === 'unsure' && (
          <div className="max-w-md">
            <InfoText>Buyers will see this item's authenticity hasn't been confirmed. Mentioning proof of purchase in your description may help it sell.</InfoText>
          </div>
        )}
        <div className="max-w-md">
          <InfoText>This is a declaration, not an authentication check. Counterfeit listings are prohibited, and sellers are responsible for ensuring every item is genuine. Repeat violations can lead to account suspension.</InfoText>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Before You Publish</h3>
        <div className="flex flex-col gap-3">
          {DECLARATION_ITEMS.map((d) => (
            <label key={d.key} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={declarations[d.key]}
                onChange={(e) => setDeclarations((prev) => ({ ...prev, [d.key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-black shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/70">{d.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
