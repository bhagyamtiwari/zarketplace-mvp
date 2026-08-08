// One-off backfill for listings uploaded before the image pipeline.
//
// Those rows point at the original phone photo - measured average 1.5 MB, the
// largest 8 MB - and that single file is what a grid card, a product hero and
// a WhatsApp preview all download. It is the last thing holding LCP at ~8s.
//
// For each affected photo this writes the same variants a new upload would
// (-400/-800/-1600 plus the -og.jpg social card), then repoints the listing at
// the 1600px file. Originals are left in the bucket untouched: nothing here
// deletes anything, so a bad run costs storage, not data.
//
// Idempotent - a listing whose image_url already ends in a variant suffix is
// skipped, so re-running after a partial failure only does the remainder.
//
// Requires the service role key (RLS blocks writing to another seller's rows
// and objects) and macOS `sips` for the resizing:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-listing-images.mjs [--dry-run]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');
const BUCKET = 'listing-images';

if (!URL_BASE || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const VARIANT_SUFFIX_RE = /-(?:400|800|1600)\.(?:webp|jpe?g|png)$/i;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function upload(objectPath, buf, contentType) {
  if (DRY) return;
  const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': '31536000' },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${objectPath} -> ${res.status} ${await res.text()}`);
}

const publicUrl = (p) => `${URL_BASE}/storage/v1/object/public/${BUCKET}/${p}`;

function sips(args) {
  execFileSync('sips', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/** Resize one original into the four derivatives; returns their local paths. */
function derive(dir, srcPath, base) {
  const out = {};
  for (const w of [400, 800, 1600]) {
    const p = join(dir, `${base}-${w}.jpg`);
    sips(['-Z', String(w), '-s', 'format', 'jpeg', '-s', 'formatOptions', w === 1600 ? '82' : '76', srcPath, '--out', p]);
    out[w] = p;
  }
  // 1200x630 letterboxed on white, matching encodeSocialCard() in the app.
  const og = join(dir, `${base}-og.jpg`);
  sips(['-Z', '1200', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', srcPath, '--out', og]);
  sips(['-p', '630', '1200', '--padColor', 'FFFFFF', og, '--out', og]);
  out.og = og;
  return out;
}

const rows = await rest('listings?select=id,sku,image_url,image_urls&order=created_at.asc');
let converted = 0, skipped = 0, bytesBefore = 0, bytesAfter = 0;

for (const row of rows) {
  const urls = (row.image_urls?.length ? row.image_urls : [row.image_url]).filter(Boolean);
  if (!urls.length || urls.every((u) => VARIANT_SUFFIX_RE.test(u))) { skipped++; continue; }

  const dir = mkdtempSync(join(tmpdir(), 'zk-'));
  try {
    const newUrls = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (VARIANT_SUFFIX_RE.test(url)) { newUrls.push(url); continue; }

      const res = await fetch(url);
      if (!res.ok) { console.warn(`  ! ${row.sku} photo ${i}: ${res.status}, left as-is`); newUrls.push(url); continue; }
      const orig = Buffer.from(await res.arrayBuffer());
      bytesBefore += orig.length;

      const srcPath = join(dir, `src-${i}`);
      writeFileSync(srcPath, orig);
      const base = decodeURIComponent(url.split('/').pop()).replace(/\.[^.]+$/, '');
      const made = derive(dir, srcPath, base);

      for (const w of [400, 800, 1600]) {
        const buf = readFileSync(made[w]);
        if (w === 1600) bytesAfter += buf.length;
        await upload(`listings/${base}-${w}.jpg`, buf, 'image/jpeg');
      }
      if (i === 0) await upload(`listings/${base}-og.jpg`, readFileSync(made.og), 'image/jpeg');

      newUrls.push(publicUrl(`listings/${base}-1600.jpg`));
    }

    if (!DRY) {
      await rest(`listings?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ image_url: newUrls[0], image_urls: newUrls }),
      });
    }
    converted++;
    console.log(`${DRY ? '[dry] ' : ''}${row.sku}: ${urls.length} photo(s)`);
  } catch (err) {
    console.error(`  x ${row.sku}: ${err.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(1);
console.log(`\n${DRY ? 'Would convert' : 'Converted'} ${converted} listing(s), skipped ${skipped} already done.`);
console.log(`Originals ${mb(bytesBefore)} MB -> 1600px ${mb(bytesAfter)} MB (plus 800/400/og variants).`);
if (DRY) console.log('Dry run: nothing uploaded, nothing updated.');
