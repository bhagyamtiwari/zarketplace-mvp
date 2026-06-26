// Sitewide brand mark — text-only "zarketplace" wordmark, no separate icon.
// The source PNGs are square (1254x1254) with the actual glyphs occupying
// only the middle ~14% of the canvas height, so every usage crops to that
// band via aspect-ratio + object-fit:cover rather than rendering the raw
// square (which would make the text tiny relative to its bounding box).
import { cn } from '../lib/utils';

const SRC: Record<'light' | 'dark', string> = {
  // "light" = for use on a light background (renders black text, transparent bg)
  light: '/images/wordmark-w-tp.png',
  // "dark" = for use on a dark background (renders white text, transparent bg)
  dark: '/images/wordmark-tp.png',
};

interface WordmarkProps {
  /** Which background this sits on - picks the matching text color. */
  on: 'light' | 'dark';
  /** Tailwind height class, e.g. "h-7". Width follows automatically via aspect-ratio. */
  heightClassName?: string;
  className?: string;
}

export function Wordmark({ on, heightClassName = 'h-7', className }: WordmarkProps) {
  return (
    <img
      src={SRC[on]}
      alt="zarketplace"
      referrerPolicy="no-referrer"
      className={cn('aspect-[1254/178] w-auto object-cover object-center', heightClassName, className)}
    />
  );
}
