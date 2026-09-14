// Sitewide brand mark - text-only "zarketplace" wordmark, no separate icon.
//
// The assets are cropped to the glyphs themselves. The originals are square
// 1254x1254 canvases with the letters occupying a band about 14% of the height
// and roughly 8% transparent margin either side, and that margin was real
// layout: it pushed whatever sat next to the mark away by an amount nobody had
// chosen. The old fix cropped vertically with aspect-ratio plus object-cover,
// which fixed the height and left the horizontal padding in place.
//
// Cropping the files instead means the element's own box is the letters, so
// spacing around the mark is set by whatever lays it out rather than by
// leftover pixels. Intrinsic dimensions carry the aspect ratio, so height
// alone sizes it and the width follows.
import { cn } from '../lib/utils';

const SRC: Record<'light' | 'dark', string> = {
  // "light" = for use on a light background (renders black letters)
  light: '/images/wordmark-tight-black.png',
  // "dark" = for use on a dark background (renders white letters)
  dark: '/images/wordmark-tight-white.png',
};

interface WordmarkProps {
  /** Which background this sits on - picks the matching letter colour. */
  on: 'light' | 'dark';
  /**
   * Tailwind height class, e.g. "h-7". Width follows from the intrinsic
   * aspect. Pass an empty string when sizing it from `className` instead,
   * which is what an inline mark inside a heading wants: a height in `em`
   * scales with the type around it at every breakpoint.
   */
  heightClassName?: string;
  className?: string;
}

export function Wordmark({ on, heightClassName = 'h-7', className }: WordmarkProps) {
  return (
    <img
      src={SRC[on]}
      alt="zarketplace"
      referrerPolicy="no-referrer"
      className={cn('block w-auto', heightClassName, className)}
    />
  );
}
