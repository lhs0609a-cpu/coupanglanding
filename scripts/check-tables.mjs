import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

const tables = [
  'coupon_auto_sync_config',
  'bulk_apply_progress',
  'product_coupon_tracking',
  'coupon_apply_log',
];

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('id').limit(1);
  if (error) {
    console.log(`❌ ${table}: ${error.message} (${error.code})`);
  } else {
    console.log(`✅ ${table}: OK (${data.length} rows found)`);
  }
}
