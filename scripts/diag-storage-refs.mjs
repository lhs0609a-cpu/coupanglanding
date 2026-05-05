import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== Active megaload_users ===');
const { count: muCount } = await supabase.from('megaload_users').select('*', { count: 'exact', head: true });
console.log(`total: ${muCount}`);

console.log('\n=== sh_products ===');
const { count: prodCount } = await supabase.from('sh_products').select('*', { count: 'exact', head: true });
console.log(`total: ${prodCount}`);

console.log('\n=== sh_product_images ===');
const { count: imgCount } = await supabase.from('sh_product_images').select('*', { count: 'exact', head: true });
console.log(`total: ${imgCount}`);

console.log('\n=== sh_bug_report attachments size estimate ===');
const { data: bugReports } = await supabase.from('sh_bug_reports').select('attachments');
let bugAttachCount = 0;
let bugAttachBytes = 0;
for (const r of bugReports || []) {
  const atts = Array.isArray(r.attachments) ? r.attachments : [];
  for (const a of atts) {
    bugAttachCount++;
    bugAttachBytes += a.size || 0;
  }
}
console.log(`bug-report attachments: ${bugAttachCount} files, ${(bugAttachBytes/1024/1024).toFixed(1)} MB`);

console.log('\n=== Top users by sh_product_images count ===');
const { data: imgsByUser } = await supabase
  .from('sh_product_images')
  .select('product_id')
  .limit(50000);
console.log(`sample size: ${imgsByUser?.length}`);
