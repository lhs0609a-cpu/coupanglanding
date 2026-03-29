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
  console.log('Missing env vars');
  process.exit(1);
}

async function runSQL(sql, label) {
  try {
    const res = await fetch(`${url}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    // If RPC doesn't work, try the Supabase management API approach
    if (!res.ok) {
      console.log(`[${label}] RPC method not available, using direct SQL...`);
      return false;
    }
    console.log(`[${label}] OK`);
    return true;
  } catch (e) {
    console.log(`[${label}] Error: ${e.message}`);
    return false;
  }
}

async function main() {
  // Read migration files
  const migration1 = readFileSync(path.join(__dirname, '..', 'supabase', 'migration_promotion.sql'), 'utf-8');
  const migration2 = readFileSync(path.join(__dirname, '..', 'supabase', 'migration_promotion_vendor_item.sql'), 'utf-8');

  console.log('=== Supabase Migration Runner ===');
  console.log('URL:', url);
  console.log('');
  console.log('Cannot run SQL directly via REST API.');
  console.log('Please run the following SQL in Supabase SQL Editor:');
  console.log('');
  console.log('Go to: ' + url.replace('.supabase.co', '.supabase.co').replace('https://', 'https://supabase.com/dashboard/project/') + '/sql/new');
  console.log('');
  console.log('--- Copy below ---');
  console.log('');
  console.log(migration1);
  console.log('');
  console.log('-- Vendor item migration --');
  console.log(migration2);
}

main();
