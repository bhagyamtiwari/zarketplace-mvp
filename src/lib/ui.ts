// The handful of class strings every signed-in page and form shares, so a
// label on Checkout, My Profile and the listing form is the same label.
//
// The system, in one place:
//   page title     display type, uppercase, the site's H1
//   section title  uppercase, one step down
//   label          bold, sentence case, full ink
//   input          an underline, not a box; the value in regular weight
//   inputBox       a bordered rectangle, where a prefilled value has to
//                  still read as something you can change
//   help           body text, full ink (never grey: guidance is content)
//   buttons        the tracked micro-label, the one place it belongs
export const ui = {
  pageTitle: 'text-4xl sm:text-5xl font-black tracking-tighter uppercase',
  sectionTitle: 'text-xl font-black uppercase tracking-tight',
  label: 'text-sm font-bold text-black',
  input:
    'w-full border-b border-black/20 bg-transparent py-3 text-sm text-black placeholder:text-black/35 ' +
    'focus:border-black focus:outline-none transition-colors disabled:text-black/50',
  // The boxed variant, for forms where a value arrives already filled in from
  // the account. An underline under a prefilled name reads as a printed fact;
  // a bordered rectangle reads as a field to check and correct. Sharp corners,
  // like every other rectangle in the kit.
  inputBox:
    'w-full border border-black/25 bg-zinc-50 px-3.5 py-3 text-sm text-black placeholder:text-black/35 ' +
    'focus:border-black focus:bg-white focus:outline-none transition-colors disabled:text-black/50',
  help: 'text-sm leading-relaxed text-black',
  error: 'text-sm font-bold text-red-600',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 bg-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white ' +
    'transition-colors hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-black',
  btnSecondary:
    'inline-flex items-center justify-center gap-2 border border-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-black ' +
    'transition-colors hover:bg-black hover:text-white disabled:opacity-40',
  link: 'underline underline-offset-4 decoration-black/30 hover:decoration-black',
} as const;
