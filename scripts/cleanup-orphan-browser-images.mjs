/**
 * megaload/browser/ 고아 파일 일회성 정리
 *
 * 사용법:
 *   node scripts/cleanup-orphan-browser-images.mjs            # dry-run (기본)
 *   node scripts/cleanup-orphan-browser-images.mjs --execute  # 실제 삭제
 *   node scripts/cleanup-orphan-browser-images.mjs --execute --max=10000  # 최대 N개만
 *
 * 안전장치:
 * - 24시간 미만 파일은 절대 안 지움 (in-flight upload 보호)
 * - 3일 미만 파일도 보존 (recent retention)
 * - sh_product_images / sh_products.raw_data / sh_product_options.raw_data 에 참조된 URL은 보존
 * - dry-run 기본
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const maxArg = args.find(a => a.startsWith('--max='));
const MAX_DELETE = maxArg ? parseInt(maxArg.split('=')[1], 10) : Infinity;

const env = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'product-images';
const FOLDER = 'megaload/browser';
const MIN_AGE_HOURS = 24;
const RETENTION_DAYS = 3;
const LIST_PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// ── 1. Referenced URL set 구축 (sh_product_images + sh_products.raw_data + sh_product_options.raw_data) ──
log('=== Building referenced path set (global) ===');

function extractBrowserPath(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = '/product-images/megaload/browser/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const tail = url.substring(idx + '/product-images/'.length);
  // tail = "megaload/browser/<filename>"
  return tail.split('?')[0]; // strip query
}

function harvestPathsFromAny(v, refs) {
  if (!v) return;
  const stack = [v];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (typeof cur === 'string') {
      const p = extractBrowserPath(cur);
      if (p) refs.add(p);
    } else if (Array.isArray(cur)) {
      for (const x of cur) stack.push(x);
    } else if (cur && typeof cur === 'object') {
      for (const x of Object.values(cur)) stack.push(x);
    }
  }
}

const refs = new Set();

// sh_product_images
{
  let from = 0;
  let total = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sh_product_images')
      .select('image_url, cdn_url')
      .range(from, from + LIST_PAGE_SIZE - 1);
    if (error) { log('sh_product_images error', error); break; }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const p1 = extractBrowserPath(row.image_url);
      const p2 = extractBrowserPath(row.cdn_url);
      if (p1) refs.add(p1);
      if (p2) refs.add(p2);
    }
    total += data.length;
    if (data.length < LIST_PAGE_SIZE) break;
    from += LIST_PAGE_SIZE;
  }
  log(`sh_product_images scanned: ${total} rows, refs accumulated: ${refs.size}`);
}

// sh_products.raw_data
{
  let from = 0;
  let total = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sh_products')
      .select('raw_data')
      .range(from, from + LIST_PAGE_SIZE - 1);
    if (error) { log('sh_products error', error); break; }
    if (!data || data.length === 0) break;
    for (const row of data) harvestPathsFromAny(row.raw_data, refs);
    total += data.length;
    if (data.length < LIST_PAGE_SIZE) break;
    from += LIST_PAGE_SIZE;
  }
  log(`sh_products scanned: ${total} rows, refs total: ${refs.size}`);
}

// sh_product_options.raw_data
{
  let from = 0;
  let total = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sh_product_options')
      .select('raw_data')
      .range(from, from + LIST_PAGE_SIZE - 1);
    if (error) { log('sh_product_options error', error); break; }
    if (!data || data.length === 0) break;
    for (const row of data) harvestPathsFromAny(row.raw_data, refs);
    total += data.length;
    if (data.length < LIST_PAGE_SIZE) break;
    from += LIST_PAGE_SIZE;
  }
  log(`sh_product_options scanned: ${total} rows, refs total: ${refs.size}`);
}

log(`\nFinal referenced set size: ${refs.size}`);

// ── 2. megaload/browser/ 파일 목록 페이지네이션 + 분류 ──
log('\n=== Listing megaload/browser/ files ===');

const now = Date.now();
const minRecentMs = MIN_AGE_HOURS * 60 * 60 * 1000;
const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

let totalScanned = 0;
let totalReferenced = 0;
let totalRecent = 0;
let totalRetention = 0;
let totalToDelete = 0;
let totalDeleted = 0;
let totalBytesScanned = 0;
let totalBytesToDelete = 0;
let totalBytesDeleted = 0;
let listOffset = 0;

const deleteBuffer = [];

async function flushDeleteBuffer() {
  if (deleteBuffer.length === 0) return;
  if (!EXECUTE) {
    log(`  [DRY] would delete ${deleteBuffer.length} files`);
    deleteBuffer.length = 0;
    return;
  }
  const batch = deleteBuffer.splice(0, deleteBuffer.length);
  for (let i = 0; i < batch.length; i += DELETE_BATCH_SIZE) {
    const chunk = batch.slice(i, i + DELETE_BATCH_SIZE);
    const paths = chunk.map(x => x.path);
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      log(`  remove error:`, error.message);
    } else {
      totalDeleted += chunk.length;
      totalBytesDeleted += chunk.reduce((s, x) => s + x.size, 0);
    }
  }
  log(`  deleted=${totalDeleted}/${totalToDelete} (${(totalBytesDeleted/1024/1024/1024).toFixed(2)} GB)`);
}

while (true) {
  const { data, error } = await supabase.storage.from(BUCKET).list(FOLDER, {
    limit: LIST_PAGE_SIZE,
    offset: listOffset,
    sortBy: { column: 'created_at', order: 'asc' },
  });
  if (error) { log('list error', error.message); break; }
  if (!data || data.length === 0) break;

  for (const item of data) {
    if (!item.metadata) continue; // skip folders
    totalScanned++;
    const size = item.metadata.size || 0;
    totalBytesScanned += size;

    const path = `${FOLDER}/${item.name}`;
    const ts = item.created_at ? Date.parse(item.created_at) : 0;
    const ageMs = ts ? now - ts : 0;

    if (!ts || ageMs < minRecentMs) { totalRecent++; continue; }
    if (refs.has(path)) { totalReferenced++; continue; }
    if (ageMs < retentionMs) { totalRetention++; continue; }

    if (totalToDelete >= MAX_DELETE) {
      // already at cap
    } else {
      totalToDelete++;
      totalBytesToDelete += size;
      deleteBuffer.push({ path, size });
      if (deleteBuffer.length >= 1000) {
        await flushDeleteBuffer();
      }
    }
  }

  if (totalScanned % 10000 < LIST_PAGE_SIZE) {
    log(`  scanned=${totalScanned} ref=${totalReferenced} recent=${totalRecent} retention=${totalRetention} toDelete=${totalToDelete}`);
  }

  if (data.length < LIST_PAGE_SIZE) break;
  listOffset += data.length;

  if (totalToDelete >= MAX_DELETE) {
    log(`  reached MAX_DELETE=${MAX_DELETE}, stopping list`);
    break;
  }
}

await flushDeleteBuffer();

log('\n=== SUMMARY ===');
log(`mode: ${EXECUTE ? 'EXECUTE (real delete)' : 'DRY-RUN'}`);
log(`scanned: ${totalScanned.toLocaleString()} files, ${(totalBytesScanned/1024/1024/1024).toFixed(2)} GB`);
log(`  referenced (kept): ${totalReferenced.toLocaleString()}`);
log(`  recent <24h (kept): ${totalRecent.toLocaleString()}`);
log(`  retention <${RETENTION_DAYS}d (kept): ${totalRetention.toLocaleString()}`);
log(`  to delete: ${totalToDelete.toLocaleString()} files, ${(totalBytesToDelete/1024/1024/1024).toFixed(2)} GB`);
if (EXECUTE) {
  log(`  ACTUALLY deleted: ${totalDeleted.toLocaleString()} files, ${(totalBytesDeleted/1024/1024/1024).toFixed(2)} GB`);
}
