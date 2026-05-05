import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== sh_product_images: 경로별 분포 ===');
const imgs = [];
let from = 0;
const pageSize = 1000;
let totalCount = 0;
while (true) {
  const { data, count, error } = await supabase
    .from('sh_product_images')
    .select('image_url', { count: 'exact' })
    .range(from, from + pageSize - 1);
  if (error) { console.error(error); break; }
  if (totalCount === 0) totalCount = count;
  if (!data || data.length === 0) break;
  imgs.push(...data);
  if (data.length < pageSize) break;
  from += pageSize;
}
console.log(`total rows: ${totalCount}, fetched: ${imgs.length}`);

const stats = {
  'megaload/browser/': 0,
  'megaload/{userId}/browser/': 0,
  'megaload/{userId}/bulk/': 0,
  'megaload/{userId}/resized/': 0,
  'megaload/{userId}/regenerated/': 0,
  'megaload/{userId}/stock/': 0,
  'other product-images': 0,
  'external (not product-images)': 0,
};
for (const r of imgs || []) {
  const u = r.image_url || '';
  if (!u.includes('/product-images/')) { stats['external (not product-images)']++; continue; }
  if (u.includes('/megaload/browser/')) { stats['megaload/browser/']++; continue; }
  if (/\/megaload\/[0-9a-f-]+\/browser\//.test(u)) { stats['megaload/{userId}/browser/']++; continue; }
  if (/\/megaload\/[0-9a-f-]+\/bulk\//.test(u)) { stats['megaload/{userId}/bulk/']++; continue; }
  if (/\/megaload\/[0-9a-f-]+\/resized\//.test(u)) { stats['megaload/{userId}/resized/']++; continue; }
  if (/\/megaload\/[0-9a-f-]+\/regenerated\//.test(u)) { stats['megaload/{userId}/regenerated/']++; continue; }
  if (/\/megaload\/[0-9a-f-]+\/stock\//.test(u)) { stats['megaload/{userId}/stock/']++; continue; }
  stats['other product-images']++;
}
for (const [k, v] of Object.entries(stats)) {
  console.log(`  ${k}: ${v.toLocaleString()}`);
}

console.log('\n=== Sample image_url values ===');
for (const r of (imgs || []).slice(0, 5)) {
  console.log(`  ${r.image_url?.substring(0, 150)}`);
}
