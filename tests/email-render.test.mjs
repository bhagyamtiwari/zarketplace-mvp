/**
 * Renders every email template and checks it survives a dark-mode client.
 *
 * The site contrast assertion cannot cover this: email is not the site, the
 * markup never reaches a browser we control, and the failure mode is
 * specifically about what a mail client paints UNDERNEATH our markup. So this
 * renders each template twice, once on white and once on near-black, and
 * fails if anything becomes unreadable when the ground changes.
 *
 * What it can prove: that our markup declares its own colours, that nothing
 * depends on an inherited background, and that every button and the logo stay
 * legible when the client supplies a dark page behind them.
 *
 * What it cannot prove: how Gmail's proxy rewrites the CSS, or what Outlook's
 * Word engine does with it. Those need a real client. See docs/EMAIL.md.
 *
 * Run: npm run test:email
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// Staged fresh on every run. An earlier version copied the templates by hand
// and then ran against that snapshot, so editing a template and re-running
// the check silently tested the previous code. A test that can pass against
// code that is not the code is worse than no test.
const STAGE = '/tmp/zk-mailcheck/src';
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
const SRC_BUYER = 'supabase/functions/send-email/templates';
for (const f of readdirSync(SRC_BUYER)) {
  if (f.endsWith('.test.ts')) continue;
  copyFileSync(join(SRC_BUYER, f), join(STAGE, f));
}
copyFileSync('supabase/functions/dispatch-vendor-emails/templates.ts', join(STAGE, 'vendor-templates.ts'));
const SITE = 'https://www.zarketplace.com';

const order = {
  order_number: 'ZKT-00000', buyer_name: 'Test Buyer', buyer_email: 'b@example.com',
  listing_title: 'Test item', listing_sku: 'SKU-1', total_amount: 1999,
  amount: 1899, shipping_cost: 100, tracking_number: 'TRK1', courier_name: 'Delhivery',
  listing_image_url: null, refund_amount: 1999, cancel_reason: 'test',
};
const vendorPayloads = {
  offer_made: { offer_amount: 1200, expires_at: new Date().toISOString(), item_title: 'Test item' },
  offer_rejected: { reasons: ['Photos are too dark.'], note: null, item_title: 'Test item' },
  item_sold: { item_title: 'Test item', offer_amount: 1200 },
  label_issued: { item_title: 'Test item', ship_by: new Date().toISOString(), tracking_number: 'TRK1' },
  ship_by_reminder: { item_title: 'Test item', ship_by: new Date().toISOString() },
  received_at_hub: { item_title: 'Test item' },
  accepted: { item_title: 'Test item', offer_amount: 1200 },
  payout_sent: { item_title: 'Test item', offer_amount: 1200, upi_vpa: 'x@upi' },
  refused: { item_title: 'Test item', reason: 'CONDITION_MISMATCH', note: 'Not as described' },
  abandonment_30: { item_title: 'Test item' },
  abandonment_7: { item_title: 'Test item' },
  vendor_cancelled: { item_title: 'Test item' },
};

const { buildEmail } = await import(pathToFileURL(`${STAGE}/index.ts`).href);
const { renderVendorEmail } = await import(pathToFileURL(`${STAGE}/vendor-templates.ts`).href);

const rendered = [];
for (const t of ['order_confirmation_buyer','tracking_update_buyer','payment_confirmed_buyer',
                 'payment_failed_buyer','payment_conflict_buyer','order_cancelled_buyer',
                 'order_refunded_buyer','order_delivered_buyer','custom']) {
  const e = buildEmail(t, { order, extra: { subject: 'y', to: 'b@example.com',
                    html: '<h1>Campaign</h1><p>Body copy for an admin campaign.</p>' }, siteUrl: SITE });
  rendered.push({ name: `buyer/${t}`, html: e.html });
}
for (const [kind, payload] of Object.entries(vendorPayloads)) {
  const e = renderVendorEmail(kind, { ...payload, listing_id: 'abc' }, SITE);
  if (!e) { console.error(`MISSING vendor template: ${kind}`); process.exitCode = 1; continue; }
  rendered.push({ name: `vendor/${kind}`, html: e.html });
}

const audit = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const px = (c, u) => { cx.clearRect(0,0,1,1); cx.fillStyle=u; cx.fillRect(0,0,1,1);
    cx.fillStyle=c; cx.fillRect(0,0,1,1); const d=cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2]]; };
  const lum = ([r,g,b]) => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const bgOf = (el) => { let e=el; while(e){ const b=getComputedStyle(e).backgroundColor;
    if(b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; e=e.parentElement; } return null; };
  const out = []; let checked = 0;
  for (const el of document.querySelectorAll('p,h1,h2,h3,li,a,td,span,strong')) {
    const own = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || !el.offsetParent) continue;
    const under = bgOf(el);
    // An element with no background anywhere up the tree is the actual bug:
    // it is relying on whatever the client paints.
    if (!under) { out.push({ ratio: 0, text: own.slice(0,45), why: 'no background declared anywhere above it' }); checked++; continue; }
    const bg = px(under, 'rgb(255,255,255)'), fg = px(cs.color, under);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const size = parseFloat(cs.fontSize);
    const need = (size>=24 || (size>=18.66 && parseInt(cs.fontWeight,10)>=700)) ? 3 : 4.5;
    checked++;
    if (ratio < need) out.push({ ratio:+ratio.toFixed(2), need, text: own.slice(0,45), why: 'below AA' });
  }
  return { checked, bad: out };
};

const browser = await chromium.launch();
const failures = [];
const thin = [];
let total = 0;
for (const ground of ['#ffffff', '#1a1a1a']) {
  const page = await browser.newPage();
  for (const r of rendered) {
    // Paint the client's ground UNDER the email, which is exactly what a
    // dark-mode client does. Our markup has to survive it unaided.
    await page.setContent(
      `<div style="background:${ground}; padding:0; margin:0; min-height:100vh;">${r.html}</div>`,
      { waitUntil: 'domcontentloaded' });
    const { checked, bad } = await page.evaluate(audit);
    // A template that rendered almost nothing was not checked, and an
    // unchecked template must not pass quietly. Two is the real floor:
    // received_at_hub is legitimately a heading and one line.
    if (checked < 2) thin.push({ ground, name: r.name, checked });
    total += checked;
    for (const b of bad) failures.push({ ground, name: r.name, ...b });
  }
  await page.close();
}
await browser.close();

if (thin.length) {
  console.error(`\n${thin.length} template render(s) produced almost no text - they were not really checked:\n`);
  for (const t of thin) console.error(`  [${t.ground}] ${t.name}: ${t.checked} text nodes`);
}
if (failures.length || thin.length) {
  if (failures.length) console.error(`\n${failures.length} problem(s) across ${rendered.length} templates on two grounds:\n`);
  for (const f of failures.sort((a,b)=>a.ratio-b.ratio)) {
    console.error(`  [${f.ground}] ${f.name}  ${f.ratio}:1  ${f.why}  "${f.text}"`);
  }
  process.exit(1);
}
console.log(`Email OK: ${rendered.length} templates x 2 grounds, ${total} text nodes, nothing unreadable.`);
