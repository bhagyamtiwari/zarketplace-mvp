import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Upload, CheckCircle2, Info, HelpCircle, X, Plus } from 'lucide-react';

const CATEGORY_SIZES: Record<string, string[]> = {
  'Tops': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Outerwear': ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
  'Bottoms': ['28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size'],
  'Shoes': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12', 'UK 13'],
  'Accessories': ['One Size'],
  'Miscellaneous': ['One Size']
};

const CONDITIONS = [
  { 
    name: 'Pristine', 
    desc: 'Like new. Either never worn or worn once or twice with zero visible signs of wear. Tags may or may not be attached.' 
  },
  { 
    name: 'Great', 
    desc: 'Lightly worn and well cared for. Minimal signs of wear. No major flaws or damage. Clean and ready to wear.' 
  },
  { 
    name: 'Good', 
    desc: 'Gently used with some signs of wear. Slight fading or small imperfections, but overall in solid shape. Still has many lives left.' 
  },
  { 
    name: 'Fair', 
    desc: 'Noticeable wear from regular use. May include fading, loose threads, or minor marks. Still wearable with character.' 
  },
  { 
    name: 'As Is', 
    desc: 'Heavily worn or naturally damaged. Visible flaws such as stains, holes, or broken hardware. Best for upcycling or collectors who appreciate the wear story. Priced accordingly.' 
  }
];

export function Sell() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [imageFiles, setImageFiles] = React.useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = React.useState<string[]>([]);
  const [showSalePrice, setShowSalePrice] = React.useState(false);
  const [showConditionInfo, setShowConditionInfo] = React.useState(false);
  const [isFreeShipping, setIsFreeShipping] = React.useState(true);
  const [noReturns, setNoReturns] = React.useState(true);
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList) {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file) {
          setImageFiles(prev => [...prev, file]);
          const reader = new FileReader();
          reader.onloadend = () => {
            setImagePreviews(prev => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (imageFiles.length === 0) {
      alert('Please upload at least one image.');
      return;
    }
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const brand = formData.get('brand') as string;
    const price = parseFloat(formData.get('price') as string);
    const sale_price = formData.get('sale_price') ? parseFloat(formData.get('sale_price') as string) : null;
    const category = formData.get('category') as string;
    const gender = formData.get('gender') as string;
    const size_type = formData.get('size_type') as string;
    const size = formData.get('size') as string;
    const condition = formData.get('condition') as string;
    const description = formData.get('description') as string;
    const seller_email = formData.get('seller_email') as string;
    const seller_instagram = formData.get('seller_instagram') as string;
    const shipping_cost = isFreeShipping ? 0 : parseFloat(formData.get('shipping_cost') as string || '0');

    try {
      const uploadedUrls: string[] = [];

      for (const file of imageFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `listings/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('listing-images')
          .getPublicUrl(filePath);
        
        uploadedUrls.push(publicUrl);
      }

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
        seller_email,
        seller_instagram,
        no_returns: noReturns,
        shipping_cost,
        status: 'pending'
      });

      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      console.error('Error submitting listing:', err);
      console.error("FULL ERROR:", err);
      console.error("MESSAGE:", err?.message);
      console.error("DETAILS:", err?.details);
      console.error("HINT:", err?.hint);
      alert(err?.message || 'Failed to submit listing');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-black text-white mb-8">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter uppercase mb-4">Listing Submitted</h1>
        <p className="text-black font-medium uppercase tracking-widest text-xs mb-12 max-w-md">
          Your item has been sent for approval.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button 
            onClick={() => navigate('/browse')}
            className="bg-black px-12 py-5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-zinc-800"
          >
            Browse
          </button>
          <button 
            onClick={() => setSubmitted(false)}
            className="border border-black px-12 py-5 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-black hover:text-white"
          >
            List Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-32">
      <div className="mb-20 flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-2">
          <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-8 w-auto" referrerPolicy="no-referrer" />
          <span className="lowercase font-black tracking-tighter text-3xl">zarketplace</span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Sell with us</span>
        <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">Create Listing</h1>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Image Upload */}
        <div className="lg:col-span-5">
          <label className="block text-[10px] font-black uppercase tracking-widest mb-4">Item Images</label>
          <div className="grid grid-cols-2 gap-4">
            {imagePreviews.map((preview, idx) => (
              <div key={idx} className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-50 border border-black/5 group">
                <img src={preview} alt={`Preview ${idx + 1}`} className="h-full w-full object-cover" />
                <button 
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-2 right-2 bg-black p-2 text-white hover:bg-zinc-800 transition-all opacity-0 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {[...Array(Math.max(0, 4 - imagePreviews.length))].map((_, i) => (
              <label key={i} className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-4 bg-zinc-50 border border-dashed border-black/10 hover:border-black/30 transition-all group">
                <div className="h-12 w-12 rounded-full border border-black/10 flex items-center justify-center group-hover:border-black/30 transition-all">
                  <Plus className="h-5 w-5 text-black/20 group-hover:text-black" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-black">Upload</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} multiple />
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <p className="text-[10px] text-black font-black uppercase tracking-widest leading-relaxed">
              Take as many angles and size tags as necessary. Please make sure photos are in HD.
            </p>
            <p className="text-[10px] text-black font-bold uppercase tracking-widest leading-relaxed">
              Better pictures lead to quicker sales.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Item Name *</label>
            <input 
              name="title"
              type="text" 
              placeholder="e.g. Vintage 90s Biker Jacket"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
              required
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Brand *</label>
            <input 
              name="brand"
              type="text" 
              placeholder="e.g. Levi's"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
              required
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Price (INR) *</label>
            <input 
              name="price"
              type="number" 
              placeholder="3500"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
              required
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest">Sale Price (Optional)</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={showSalePrice}
                  onChange={() => setShowSalePrice(!showSalePrice)}
                />
                <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>
            {showSalePrice && (
              <motion.input 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                name="sale_price"
                type="number" 
                placeholder="2900"
                className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
              />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Gender *</label>
            <select 
              name="gender"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none"
              required
            >
              <option value="">Select Gender</option>
              <option value="Men">Men</option>
              <option value="Women">Women</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Category *</label>
            <select 
              name="category"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none"
              required
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Select Category</option>
              <option value="Tops">Tops</option>
              <option value="Outerwear">Outerwear</option>
              <option value="Bottoms">Bottoms</option>
              <option value="Accessories">Accessories</option>
              <option value="Shoes">Shoes</option>
              <option value="Miscellaneous">Miscellaneous</option>
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Size *</label>
            <select 
              name="size_type"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none bg-white appearance-none disabled:opacity-50"
              required
              disabled={!selectedCategory}
            >
              <option value="">{selectedCategory ? 'Select Size' : 'Select Category First'}</option>
              {selectedCategory && CATEGORY_SIZES[selectedCategory]?.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Size Detail (Optional)</label>
            <input 
              name="size"
              type="text" 
              placeholder="e.g. 34x30 or Oversized fit"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Seller Email *</label>
            <input 
              name="seller_email"
              type="email" 
              placeholder="your@email.com"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
              required
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Seller Instagram (Optional)</label>
            <input 
              name="seller_instagram"
              type="text" 
              placeholder="@username"
              className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest">Condition *</label>
              <button 
                type="button"
                onMouseEnter={() => setShowConditionInfo(true)}
                onMouseLeave={() => setShowConditionInfo(false)}
                onClick={() => setShowConditionInfo(!showConditionInfo)}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 transition-colors"
              >
                (Learn More)
              </button>
            </div>
            
            <AnimatePresence>
              {showConditionInfo && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-zinc-50 border border-black/5 p-6 flex flex-col gap-4 mb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest">Item Condition Standards</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {CONDITIONS.map(c => (
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
              {CONDITIONS.map(c => (
                <label key={c.name} className="relative group cursor-pointer">
                  <input type="radio" name="condition" value={c.name} className="peer hidden" required />
                  <div className="border border-black/10 p-4 text-center transition-all peer-checked:bg-black peer-checked:text-white group-hover:border-black">
                    <span className="text-[10px] font-black uppercase tracking-widest">{c.name}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col gap-3">
            <label className="text-[10px] font-black uppercase tracking-widest">Description *</label>
            <textarea 
              name="description"
              rows={4}
              placeholder="Tell buyers about the fit, estimated original retail price, material, any flaws, any and every relevant details..."
              className="border border-black/10 p-6 text-sm font-medium focus:border-black focus:outline-none resize-none transition-all placeholder:text-black/20"
              required
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-6 pt-10 border-t border-black/5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-widest">Returns Policy</label>
                <p className="text-[9px] font-bold uppercase tracking-widest text-black/40">Toggle on if returns or exchanges are not possible</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={noReturns}
                  onChange={() => setNoReturns(!noReturns)}
                />
                <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>
            {noReturns && (
              <p className="text-[10px] font-black uppercase tracking-widest text-black bg-zinc-50 p-4 border border-black/5">
                No returns policy active. Listing will show buyers that returns or exchanges are not possible for this listing.
              </p>
            )}
          </div>

          <div className="md:col-span-2 flex flex-col gap-6 pt-10 border-t border-black/5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-widest">Shipping</label>
                <p className="text-[9px] font-bold uppercase tracking-widest text-black/40">Sell faster by offering free shipping</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isFreeShipping}
                  onChange={() => setIsFreeShipping(!isFreeShipping)}
                />
                <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>
            
            {!isFreeShipping && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
              >
                <label className="text-[10px] font-black uppercase tracking-widest">Shipping Cost (INR) *</label>
                <input 
                  name="shipping_cost"
                  type="number" 
                  placeholder="150"
                  className="border-b border-black/10 py-4 text-sm font-bold focus:border-black focus:outline-none transition-all placeholder:text-black/20"
                  required={!isFreeShipping}
                />
              </motion.div>
            )}
          </div>

          <div className="md:col-span-2 pt-10 border-t border-black/5">
            <div className="bg-zinc-50 p-6 border border-black/5 mb-8">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest">Seller Fees</h4>
                <div className="relative group/fees">
                  <button type="button" className="text-black/40 hover:text-black transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-white border border-black/5 p-4 shadow-2xl opacity-0 invisible group-hover/fees:opacity-100 group-hover/fees:visible transition-all z-50">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-2">Example:</p>
                    <p className="text-[9px] font-medium uppercase tracking-widest leading-relaxed text-black/60">
                      If transaction total is ₹1,000, seller will be sent ₹900 after buyer pays and after the product is delivered. You will be able to see funds expected and released in your account. If you offered free shipping, you are expected to cover shipping charges from your funds.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <p className="text-[10px] font-medium uppercase tracking-widest leading-relaxed text-black/60">
                  As a special launch to onboard new sellers, we are charging only a 10% transaction amount as listing fees.
                </p>
                <p className="text-[9px] font-medium uppercase tracking-widest leading-relaxed text-black/40">
                  Fees are subject to policy change.
                </p>
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-black py-6 text-xs font-black uppercase tracking-[0.4em] text-white transition-all hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-4"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Listing for Approval</span>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
