// Sell page. Single screen form to create a listing.
// Per-listing requirements:
//   * UPI VPA collected twice with paste blocked on the confirm field
//     (admin pays seller to this UPI after shipping is confirmed).
//   * Instagram handle entered with a fixed `https://www.instagram.com/`
//     prefix; we persist the full URL.

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, CheckCircle2, X, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { RequireAuth } from '../components/RequireAuth';
import { PromiseBanner } from '../components/PromiseBanner';
import { UpiVpaInput, VPA_REGEX } from '../components/UpiVpaInput';
import { log } from '../lib/log';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { cn } from '../lib/utils';

const slog = log('sell');

const CATEGORY_SIZES: Record<string, string[]> = {
  'Tops': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Bottoms': ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  'Outerwear': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Accessories': ['One Size'],
  'Shoes': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
};

const CONDITIONS = [
  { name: 'Pristine', desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear.' },
  { name: 'Great', desc: 'Lightly worn and well cared for. Minimal signs of wear.' },
  { name: 'Good', desc: 'Gently used with some signs of wear.' },
  { name: 'Fair', desc: 'Noticeable wear from regular use.' },
  { name: 'As Is', desc: 'Heavily worn or naturally damaged.' },
];

const IG_HANDLE_REGEX = /^[A-Za-z0-9._]{1,30}$/;
const MAX_IMAGES = 8;

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
  const [imageFiles, setImageFiles] = React.useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = React.useState<string[]>([]);
  const [showSalePrice, setShowSalePrice] = React.useState(false);
  const [showConditionInfo, setShowConditionInfo] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const [shippingMode, setShippingMode] = React.useState<'free' | 'paid'>('free');
  const [priceVal, setPriceVal] = React.useState<string>('');
  const [salePriceVal, setSalePriceVal] = React.useState<string>('');
  const [fullName, setFullName] = React.useState<string>('');
  const [phone, setPhone] = React.useState<string>('');
  const [igHandle, setIgHandle] = React.useState<string>('');
  const [vpa, setVpa] = React.useState<string>('');
  const [vpaValid, setVpaValid] = React.useState<boolean>(false);
  const [vpaPrefilled, setVpaPrefilled] = React.useState(false);

  // Prefill UPI ID from the seller's saved profile so they don't have to
  // retype it on every listing. Profile loads asynchronously after mount,
  // so this runs once it arrives; the `key` below forces UpiVpaInput to
  // remount and pick up the prefilled value (its own state only seeds once).
  React.useEffect(() => {
    if (!vpaPrefilled && profile?.default_upi_vpa) {
      setVpa(profile.default_upi_vpa);
      setVpaValid(VPA_REGEX.test(profile.default_upi_vpa));
      setVpaPrefilled(true);
    }
  }, [profile, vpaPrefilled]);

  // Prefill name/phone from the saved profile so the seller never has to
  // retype information they already entered in My Profile.
  React.useEffect(() => {
    setFullName((prev) => prev || profile?.full_name || '');
    setPhone((prev) => prev || profile?.phone || '');
  }, [profile]);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!user) { setErrorMsg('Sign in first.'); return; }
    if (!fullName.trim()) { setErrorMsg('Enter your full name.'); return; }
    if (!phone.trim()) { setErrorMsg('Enter your phone number.'); return; }
    if (imageFiles.length === 0) { setErrorMsg('Upload at least one image.'); return; }
    if (!vpaValid || !VPA_REGEX.test(vpa)) { setErrorMsg('Please enter a valid UPI ID twice.'); return; }
    if (!igValid) { setErrorMsg('Enter a valid Instagram handle (letters, numbers, _ or ., max 30).'); return; }

    const formData = new FormData(e.currentTarget);
    const title = (formData.get('title') as string).trim();
    const brand = (formData.get('brand') as string).trim();
    const price = parseFloat(formData.get('price') as string);
    const sale_price = formData.get('sale_price') ? parseFloat(formData.get('sale_price') as string) : null;
    if (sale_price !== null && !Number.isNaN(sale_price) && sale_price >= price) {
      setErrorMsg('Sale price must be lower than the regular price.'); return;
    }
    const category = formData.get('category') as string;
    const gender = formData.get('gender') as string;
    const size_type = formData.get('size_type') as string;
    const size = (formData.get('size') as string) || null;
    const condition = formData.get('condition') as string;
    const description = (formData.get('description') as string).trim();
    const shipping_cost_raw = formData.get('shipping_cost') as string | null;
    const shipping_cost = shippingMode === 'paid' ? Math.max(0, parseFloat(shipping_cost_raw || '0') || 0) : 0;
    if (shippingMode === 'paid' && !(shipping_cost > 0)) {
      setErrorMsg('Enter a shipping amount, or switch to free shipping.'); return;
    }

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
      const { error } = await supabase.from('listings').insert({
        title,
        brand,
        price,
        sale_price,
        category,
        gender,
        size_type,
        size,
        condition,
        description,
        image_url: uploadedUrls[0],
        image_urls: uploadedUrls,
        seller_id: user.id,
        seller_email: user.email,
        seller_display_name: fullName.trim() || null,
        seller_instagram,
        seller_upi_vpa: vpa,
        shipping_mode: shippingMode,
        shipping_cost,
        status: 'pending',
      });
      if (error) throw error;
      tFull.end({ outcome: 'success' });
      setSubmitted(true);
    } catch (err: any) {
      slog.error('handleSubmit THREW', err);
      tFull.end({ outcome: 'error' });
      setErrorMsg(err?.message || 'Failed to submit listing');
    } finally {
      setLoading(false);
    }
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
          <button onClick={() => { setSubmitted(false); setImageFiles([]); setImagePreviews([]); }}
            className="border border-black px-12 py-5 text-xs font-black uppercase tracking-widest text-black hover:bg-black hover:text-white">
            List Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="pt-20">
        <PromiseBanner variant="ticker" />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-20">
      <div className="mb-12 flex flex-col gap-4">
        <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">Create Listing</h1>
      </div>

      <div className="mb-12">
        <PromiseBanner variant="pricing" />
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Image Upload */}
        <div className="lg:col-span-5 lg:sticky lg:top-28 lg:self-start">
          <label className="block text-[10px] font-black uppercase tracking-widest mb-4">Item Images</label>
          {imagePreviews.length === 0 ? (
            <label className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-4 bg-zinc-50 border border-dashed border-black/15 hover:border-black/40 transition-all group">
              <div className="h-16 w-16 rounded-full border border-black/10 flex items-center justify-center group-hover:border-black/30 transition-all">
                <Plus className="h-6 w-6 text-black/30 group-hover:text-black" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-black">Upload Photos</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Tap to choose up to {MAX_IMAGES} HD shots</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} multiple />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {imagePreviews.map((preview, idx) => (
                <div key={idx} className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-50 border border-black/5 group">
                  <img src={preview} alt={`Preview ${idx + 1}`} className="h-full w-full object-cover" />
                  {idx === 0 && (
                    <span className="absolute top-2 left-2 bg-black px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white">Cover</span>
                  )}
                  <button type="button" onClick={() => removeImage(idx)}
                    className="absolute top-2 right-2 bg-black p-2 text-white hover:bg-zinc-800 transition-all opacity-0 group-hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {imagePreviews.length < MAX_IMAGES && (
                <label className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-4 bg-zinc-50 border border-dashed border-black/10 hover:border-black/30 transition-all group">
                  <div className="h-12 w-12 rounded-full border border-black/10 flex items-center justify-center group-hover:border-black/30 transition-all">
                    <Plus className="h-5 w-5 text-black/20 group-hover:text-black" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-black">Upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} multiple />
                </label>
              )}
            </div>
          )}
          <p className="mt-6 text-[10px] text-black font-black uppercase tracking-widest leading-relaxed">
            {imagePreviews.length}/{MAX_IMAGES} photos · HD shots only.
          </p>
        </div>

        <div className="lg:col-span-7 flex flex-col gap-10">
          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Item Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Item Name *</label>
            <input name="title" type="text" placeholder="e.g. Vintage 90s Biker Jacket" required
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Brand *</label>
            <input name="brand" type="text" placeholder="e.g. Levi's" required
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Pricing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Price (INR) *</label>
            <input name="price" type="number" min="1" value={priceVal}
              onChange={(e) => setPriceVal(e.target.value)} placeholder="3500" required
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest">Sale Price (Optional)</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={showSalePrice}
                  onChange={() => setShowSalePrice(!showSalePrice)} />
                <div className="w-8 h-4 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>
            {showSalePrice && (
              <>
                <motion.input initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  name="sale_price" type="number" min="1" value={salePriceVal}
                  onChange={(e) => setSalePriceVal(e.target.value)} placeholder="2900"
                  className={cn('border-b py-4 text-sm font-bold focus:outline-none transition-all placeholder:text-black/20',
                    salePriceInvalid ? 'border-red-500 focus:border-red-600' : 'border-black/10 focus:border-black')} />
                {salePriceInvalid && (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">
                    Sale price must be lower than the regular price.
                  </p>
                )}
              </>
            )}
          </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Category & Sizing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Gender *</label>
            <select name="gender" required
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none">
              <option value="">Select Gender</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Category *</label>
            <select name="category" required value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
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
            <label className="text-[10px] font-black uppercase tracking-widest">Size *</label>
            <select name="size_type" required disabled={!selectedCategory}
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none disabled:opacity-50">
              <option value="">{selectedCategory ? 'Select Size' : 'Select Category First'}</option>
              {selectedCategory && CATEGORY_SIZES[selectedCategory]?.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Size Detail (Optional)</label>
            <input name="size" type="text" placeholder="e.g. 34x30 or Oversized fit"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Your Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Full Name *</label>
            <input name="full_name" type="text" required value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jashok Dumar"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Phone Number *</label>
            <input name="phone" type="tel" required value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Seller Email</label>
            <div className="border-b border-black/10 py-4 text-sm font-bold text-black/60">
              {user?.email}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Instagram *</label>
            <div className="flex items-center border-b border-black/10 focus-within:border-black transition-all">
              <span className="text-sm font-bold text-black/40 select-none">https://www.instagram.com/</span>
              <input type="text" value={igHandle}
                onChange={(e) => setIgHandle(e.target.value.replace(/^@/, '').trim())}
                placeholder="username" autoComplete="off"
                className="flex-1 py-4 text-sm font-bold focus:outline-none placeholder:text-black/20" />
            </div>
            {igHandle && !igValid && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">
                Letters, numbers, _ or . only - max 30 characters.
              </p>
            )}
          </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Payout</h3>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-widest">Your UPI ID *</label>
              <p className="text-[10px] font-bold text-black/40 leading-relaxed">
                We'll send your earnings to this UPI ID once the buyer's order ships. Use the same ID you'd share to receive money on GPay, PhonePe, or Paytm (it looks like <span className="font-mono">name@upi</span> or <span className="font-mono">phonenumber@bank</span>). Type it twice so a typo doesn't send your payout to the wrong place.
              </p>
            </div>
            <React.Fragment key={vpaPrefilled ? 'prefilled' : 'empty'}>
              <UpiVpaInput value={vpa} onChange={(v, valid) => { setVpa(v); setVpaValid(valid); }} />
            </React.Fragment>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Shipping</h3>
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">
                Choose free shipping (you cover postage) or paid shipping (buyer pays the amount you set).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setShippingMode('free')}
                className={cn('border p-5 text-left transition-all',
                  shippingMode === 'free' ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
                <span className="block text-[10px] font-black uppercase tracking-widest">Free Shipping</span>
                <span className="block text-[9px] mt-1 opacity-60">Buyer pays ₹0</span>
              </button>
              <button type="button" onClick={() => setShippingMode('paid')}
                className={cn('border p-5 text-left transition-all',
                  shippingMode === 'paid' ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black')}>
                <span className="block text-[10px] font-black uppercase tracking-widest">Paid Shipping</span>
                <span className="block text-[9px] mt-1 opacity-60">Buyer pays your amount</span>
              </button>
            </div>
            {shippingMode === 'paid' && (
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest">Shipping Cost (INR) *</label>
                <input name="shipping_cost" type="number" min="1" placeholder="80" required
                  className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20" />
                <p className="text-[9px] font-bold uppercase tracking-widest text-black/40">
                  Goes 100% to you.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 border-b border-black/5 pb-3">Condition & Description</h3>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest">Condition *</label>
              <button type="button"
                onMouseEnter={() => setShowConditionInfo(true)}
                onMouseLeave={() => setShowConditionInfo(false)}
                onClick={() => setShowConditionInfo(!showConditionInfo)}
                className="text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80">
                (Learn More)
              </button>
            </div>
            <AnimatePresence>
              {showConditionInfo && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="bg-zinc-50 border border-black/5 p-6 flex flex-col gap-4 mb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest">Item Condition Standards</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {CONDITIONS.map((c) => (
                        <div key={c.name} className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest">{c.name}</span>
                          <p className="text-[9px] text-black/50 leading-relaxed">{c.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {CONDITIONS.map((c) => (
                <label key={c.name} className="relative group cursor-pointer">
                  <input type="radio" name="condition" value={c.name} className="peer hidden" required />
                  <div className="border border-black/10 p-4 text-center transition-all peer-checked:bg-black peer-checked:text-white group-hover:border-black">
                    <span className="text-[10px] font-black uppercase tracking-widest">{c.name}</span>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <label className="text-[10px] font-black uppercase tracking-widest">Description *</label>
              <textarea name="description" rows={4} required
                placeholder="Tell buyers about the fit, original retail, material, any flaws - every relevant detail."
                className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20" />
            </div>
          </div>

          {errorMsg && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{errorMsg}</p>
          )}

          <div className="pt-10 border-t border-black/5">
            <button type="submit"
              disabled={loading || salePriceInvalid || !vpaValid || !igValid || imageFiles.length === 0}
              className="w-full bg-black py-6 text-xs font-black uppercase tracking-[0.4em] text-white transition-all hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-4">
              {loading ? (<><Loader2 className="h-5 w-5 animate-spin" /><span>Submitting...</span></>) : (<span>Submit Listing for Approval</span>)}
            </button>
            <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-widest text-black/30">
              We want to hear from you. <Link to="/contact" className="underline text-black/50 hover:text-black">Share your thoughts</Link>
            </p>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}
