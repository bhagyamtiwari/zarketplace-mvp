// Buyer-side proof of payment input: UTR (12 digits) and/or receipt upload.
// At least one is required. Surfaces validity + selected file to parent.

import * as React from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  utr: string;
  onUtrChange: (v: string) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  disabled?: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,application/pdf';

export function PaymentProofInput({ utr, onUtrChange, file, onFileChange, disabled }: Props) {
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    if (file.type === 'application/pdf') { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) { onFileChange(null); return; }
    if (f.size > MAX_BYTES) { setError('Receipt is larger than 5 MB.'); return; }
    if (!/^image\/|application\/pdf$/.test(f.type)) {
      setError('Use a PNG, JPG, WEBP or PDF.');
      return;
    }
    onFileChange(f);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-[9px] font-black uppercase tracking-widest">UPI Reference / UTR (12 digits)</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={12}
          value={utr}
          onChange={(e) => onUtrChange(e.target.value.replace(/\D/g, ''))}
          placeholder="e.g. 412345678901"
          disabled={disabled}
          className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all tracking-widest"
        />
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
          Or copy the UPI Ref No / Transaction ID from your UPI app and paste it above.
        </p>
      </div>

      <div className="text-center text-[10px] font-black uppercase tracking-widest text-black/40">- or -</div>

      <div className="flex flex-col gap-2">
        <label className="text-[9px] font-black uppercase tracking-widest">Upload Payment Receipt</label>
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/40 leading-relaxed">
          In GPay / PhonePe / Paytm, tap the transaction → "Share Receipt" → save the image, then upload it here.
        </p>

        {file ? (
          <div className="border border-black/10 bg-zinc-50 p-4 flex items-center gap-4">
            {previewUrl ? (
              <img src={previewUrl} alt="receipt" className="h-20 w-20 object-cover border border-black/10" />
            ) : (
              <FileText className="h-12 w-12 text-black/40" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{file.name}</p>
              <p className="text-[10px] font-bold text-black/50">{Math.round(file.size / 1024)} KB</p>
            </div>
            <button
              type="button"
              onClick={() => handleFile(null)}
              className="p-1 hover:bg-black/5"
              aria-label="Remove receipt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className={cn(
            'border-2 border-dashed border-black/20 p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-black transition-all',
            disabled && 'opacity-50 cursor-not-allowed',
          )}>
            <Upload className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Click to upload</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">PNG · JPG · WEBP · PDF · max 5MB</span>
            <input
              type="file"
              accept={ACCEPT}
              className="hidden"
              disabled={disabled}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        {error && <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export const isValidUtr = (utr: string) => /^\d{12}$/.test(utr);
