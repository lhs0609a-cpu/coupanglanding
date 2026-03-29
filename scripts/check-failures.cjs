const { readFileSync } = require('fs');
const path = require('path');

const envContent = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': key,
  'Authorization': `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function main() {
  // 1. Failed logs (most recent 15)
  console.log('=== 실패한 쿠폰 적용 로그 ===');
  const logsRes = await fetch(
    `${url}/rest/v1/coupon_apply_log?success=eq.false&order=created_at.desc&limit=15&select=id,coupon_type,coupon_id,seller_product_id,vendor_item_id,error_message,created_at`,
    { headers }
  );
  const logs = await logsRes.json();
  if (logs.length === 0) {
    console.log('(실패 로그 없음)');
  } else {
    for (const log of logs) {
      console.log(`  [${log.coupon_type}] product=${log.seller_product_id} item=${log.vendor_item_id} error=${log.error_message}`);
    }
  }

  // 2. Failed tracking items
  console.log('\n=== 실패한 트래킹 항목 ===');
  const trackRes = await fetch(
    `${url}/rest/v1/product_coupon_tracking?status=eq.failed&order=updated_at.desc&limit=15&select=id,seller_product_id,seller_product_name,vendor_item_id,error_message,instant_coupon_applied,download_coupon_applied`,
    { headers }
  );
  const tracks = await trackRes.json();
  if (tracks.length === 0) {
    console.log('(실패 항목 없음)');
  } else {
    for (const t of tracks) {
      console.log(`  product=${t.seller_product_id} item=${t.vendor_item_id} name="${t.seller_product_name}" instant=${t.instant_coupon_applied} download=${t.download_coupon_applied} error=${t.error_message}`);
    }
  }

  // 3. Progress status
  console.log('\n=== 현재 진행 상태 ===');
  const progRes = await fetch(
    `${url}/rest/v1/bulk_apply_progress?order=created_at.desc&limit=1&select=*`,
    { headers }
  );
  const progs = await progRes.json();
  if (progs.length > 0) {
    const p = progs[0];
    console.log(`  status=${p.status} total=${p.total_products} items=${p.total_items}`);
    console.log(`  instant: success=${p.instant_success} failed=${p.instant_failed}`);
    console.log(`  download: success=${p.download_success} failed=${p.download_failed}`);
    console.log(`  collecting=${p.collecting_progress}% applying=${p.applying_progress}%`);
  }

  // 4. Config check
  console.log('\n=== 쿠폰 설정 ===');
  const configRes = await fetch(
    `${url}/rest/v1/coupon_auto_sync_config?limit=1&select=instant_coupon_enabled,instant_coupon_id,instant_coupon_name,download_coupon_enabled,download_coupon_id`,
    { headers }
  );
  const configs = await configRes.json();
  if (configs.length > 0) {
    const c = configs[0];
    console.log(`  instant: enabled=${c.instant_coupon_enabled} id=${c.instant_coupon_id} name=${c.instant_coupon_name}`);
    console.log(`  download: enabled=${c.download_coupon_enabled} id=${c.download_coupon_id}`);
  }

  // 5. Sample of successful logs
  console.log('\n=== 성공 로그 (최근 5건) ===');
  const successRes = await fetch(
    `${url}/rest/v1/coupon_apply_log?success=eq.true&order=created_at.desc&limit=5&select=coupon_type,seller_product_id,vendor_item_id,created_at`,
    { headers }
  );
  const successes = await successRes.json();
  if (successes.length === 0) {
    console.log('(성공 로그 없음)');
  } else {
    for (const s of successes) {
      console.log(`  [${s.coupon_type}] product=${s.seller_product_id} item=${s.vendor_item_id}`);
    }
  }
}
main();
