/**
 * Standing contrast assertion.
 *
 * This exists because .body-longform hardcoded black-at-80% and, inside the
 * black panels on /about and /condition, painted black text on black. Three
 * paragraphs shipped invisible. No source-level check could have caught it:
 * the class was correct in isolation and only failed against the ground it
 * landed on, which is a fact about the rendered page.
 *
 * So this measures the rendered page. It composites both the text colour and
 * the effective background through a canvas, which resolves oklab() and
 * oklch() - the colour spaces Tailwind 4 emits - to real pixels. Parsing the
 * computed colour string as RGB does not work and silently reports a ratio of
 * 1 for everything, which is how the first version of this check produced a
 * page of false positives.
 *
 * Run: npm run test:contrast   (BASE_URL overrides the target)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const PAGES = [
  '/', '/browse', '/condition', '/about', '/faq', '/contact', '/returns',
  '/refund-policy', '/shipping-policy', '/buyer-protection', '/vendor-policy',
  '/terms', '/privacy', '/sell', '/cart',
];
const WIDTHS = [375, 1440];

const audit = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  // Paint `under` first, then `color` over it, and read the composited pixel.
  // This handles alpha and any colour space the browser understands.
  const px = (color, under) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = under; cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = color; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let e = el;
    while (e) {
      const b = getComputedStyle(e).backgroundColor;
      if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b;
      e = e.parentElement;
    }
    return 'rgb(255,255,255)';
  };
  const out = [];
  let checked = 0;
  for (const el of document.querySelectorAll('p,span,li,h1,h2,h3,h4,a,button,label,div,td,th')) {
    // Measure an element's OWN text, not its descendants' - but do not skip
    // a paragraph merely because it contains an inline link. The /about
    // paragraphs that shipped invisible each wrap an <a>, so a leaf-only rule
    // would have missed the very bug this file exists for.
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!ownText) continue;
    if (el.closest('[aria-hidden="true"],[aria-hidden=""]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent) continue;
    if (parseFloat(cs.opacity) === 0) continue;
    const under = bgOf(el);
    const bg = px(under, 'rgb(255,255,255)');
    const fg = px(cs.color, under);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const need = large ? 3 : 4.5;
    checked += 1;
    if (ratio < need) out.push({ ratio: +ratio.toFixed(2), need, size, text: ownText.slice(0, 60) });
  }
  return { checked, bad: out };
};

const browser = await chromium.launch();
const failures = [];
let total = 0;
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const { checked, bad } = await page.evaluate(audit);
    // The first version of this file passed on a build that rendered nothing:
    // the app throws "supabaseUrl is required" without its env vars, every
    // page was blank, and a check with no elements to measure reports success.
    // A contrast run that examined almost nothing is a failure, not a pass.
    if (checked < 20) {
      console.error(`\n${path} at ${width}px rendered only ${checked} text nodes - the page did not boot.\n`);
      process.exit(1);
    }
    total += checked;
    for (const row of bad) failures.push({ width, path, ...row });
  }
  await page.close();
}
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} element(s) below WCAG AA:\n`);
  for (const f of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.error(`  ${f.ratio}:1 (needs ${f.need}) ${f.width}px ${f.path} ${f.size}px  "${f.text}"`);
  }
  console.error('');
  process.exit(1);
}
console.log(`Contrast OK: ${total} text nodes across ${PAGES.length} pages x ${WIDTHS.length} widths, nothing under AA.`);
