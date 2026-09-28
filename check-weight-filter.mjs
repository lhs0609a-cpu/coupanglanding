import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: allProducts, error } = await supabase
  .from('catalog_products')
  .select('id, product_name, coupang_category_code, suggested_price')
  .eq('status', 'active').eq('is_visible', true)
  .order('created_at', { ascending: true })
  .limit(5000);

console.log('error:', error?.message || 'none');
console.log('rows:', allProducts?.length);
console.log('첫 행 키:', allProducts?.[0] ? Object.keys(allProducts[0]).join(', ') : '(없음)');
console.log('첫 행 product_name:', JSON.stringify(allProducts?.[0]?.product_name));

const WEIGHT_RE = /[0-9]+(\.[0-9]+)?\s*(kg|g)/i;
const usable = (allProducts || []).filter((p) => WEIGHT_RE.test(p.product_name || ''));
console.log('매칭:', usable.length, '/', allProducts?.length);
console.log('\n매칭 안 된 5건:');
(allProducts || []).filter((p) => !WEIGHT_RE.test(p.product_name || '')).slice(0, 5)
  .forEach((p) => console.log('  ', JSON.stringify(p.product_name)));
