const { readFileSync } = require('fs');
const path = require('path');

// Load .env.local
const envContent = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
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

// Use fetch directly (REST API)
const headers = {
  'apikey': key,
  'Authorization': `Bearer ${key}`,
  'Content-Type': 'application/json',
};

const tables = [
  'coupon_auto_sync_config',
  'bulk_apply_progress',
  'product_coupon_tracking',
  'coupon_apply_log',
];

async function main() {
  for (const table of tables) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
      if (res.ok) {
        const data = await res.json();
        console.log(`OK ${table}: exists (${data.length} rows returned)`);
      } else {
        const err = await res.json().catch(() => ({}));
        console.log(`X ${table}: ${res.status} - ${err.message || err.hint || JSON.stringify(err)}`);
      }
    } catch (e) {
      console.log(`X ${table}: ${e.message}`);
    }
  }
}
main();
