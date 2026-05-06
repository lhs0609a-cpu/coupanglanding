import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const env = readFileSync(envPath, 'utf-8');
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
};
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
const sb = createClient(url, key);

console.log('=== Supabase Storage 진단 ===');

// 1. bucket 존재 확인
const { data: buckets, error: bErr } = await sb.storage.listBuckets();
if (bErr) { console.error('listBuckets err:', bErr); process.exit(1); }
console.log('\n[buckets]');
for (const b of buckets) {
  console.log(`  ${b.id}: public=${b.public}, file_size_limit=${b.file_size_limit}, allowed_mime=${b.allowed_mime_types?.join(',') || 'all'}`);
}

// 2. product-images 버킷 사용량 (sample listing)
const target = 'product-images';
const { data: list, error: lErr } = await sb.storage.from(target).list('', { limit: 5 });
if (lErr) {
  console.error(`\nlist '${target}' err:`, lErr);
} else {
  console.log(`\n[${target} root entries: ${list.length}+]`);
  for (const f of list.slice(0, 3)) console.log(`  ${f.name} (${f.metadata?.size || '?'}B)`);
}

// 3. PNG 이미지 업로드 (실제 사용자 시나리오 재현)
console.log(`\n=== 1x1 PNG 이미지 업로드 (오류문의 첨부 시나리오) ===`);
const testPath = `_diag/test-${Date.now()}.png`;
// 1x1 transparent PNG
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const start = Date.now();
const { error: uErr } = await sb.storage.from(target).upload(testPath, png1x1, {
  contentType: 'image/png',
  upsert: true,
});
const elapsed = Date.now() - start;
if (uErr) {
  console.error('❌ 업로드 실패:', uErr.message, '| status=', uErr.statusCode || '?', '| elapsed=', elapsed + 'ms');
  // detail
  console.log('  full err:', JSON.stringify(uErr).slice(0, 500));
} else {
  console.log('✅ 업로드 성공:', testPath, '|', elapsed + 'ms');
  await sb.storage.from(target).remove([testPath]);
}

// 4. 큰 PNG 이미지 (5MB 시뮬레이션)
console.log(`\n=== 5MB PNG 업로드 ===`);
const big = Buffer.alloc(5 * 1024 * 1024, 'A');
const bigPath = `_diag/test-big-${Date.now()}.png`;
const bStart = Date.now();
const { error: bErr2 } = await sb.storage.from(target).upload(bigPath, big, {
  contentType: 'image/png',
  upsert: true,
});
if (bErr2) {
  console.error('❌ 5MB 업로드 실패:', bErr2.message, '| status=', bErr2.statusCode || '?', '| elapsed=', Date.now() - bStart + 'ms');
} else {
  console.log('✅ 5MB 업로드 성공 |', Date.now() - bStart + 'ms');
  await sb.storage.from(target).remove([bigPath]);
}

// 4. 버킷 사용량 (가능하면)
console.log('\n=== usage 추정 ===');
try {
  const r = await fetch(`${url}/rest/v1/storage_usage?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (r.ok) console.log(await r.json());
  else console.log('storage_usage not exposed via REST');
} catch (e) {
  console.log('usage check skipped:', e.message);
}
