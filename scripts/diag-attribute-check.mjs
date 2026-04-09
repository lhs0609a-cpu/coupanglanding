/**
 * 진단 스크립트: 쿠팡 API의 실제 attributeTypeName과 로컬 JSON의 buyOptions 이름 비교
 *
 * 사용: node scripts/diag-attribute-check.mjs [categoryCode]
 * 예시: node scripts/diag-attribute-check.mjs 58920
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──
const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTE4MSwiZXhwIjoyMDg4MDA3MTgxfQ.nU6WSkFOgU6YX6uhIzSZFseK6jWud4v4yq3WheLjirI';
const COUPANG_PROXY_URL = 'https://coupang-api-proxy.fly.dev';
const COUPANG_PROXY_SECRET = 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

const categoryCode = process.argv[2] || '58920';

// ── Supabase에서 첫 번째 쿠팡 자격증명 가져오기 ──
async function getCredentials() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('channel_credentials')
    .select('credentials, megaload_user_id')
    .eq('channel', 'coupang')
    .eq('is_connected', true)
    .limit(1)
    .single();

  if (error || !data) throw new Error(`자격증명 조회 실패: ${error?.message}`);
  return data.credentials;
}

// ── HMAC 서명 생성 ──
function generateSignature(method, path, query, accessKey, secretKey) {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(2);
  const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const HH = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

  const message = `${datetime}${method}${path}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

// ── 쿠팡 API 호출 (Fly.io 프록시 경유) ──
async function callCoupangApi(method, path, accessKey, secretKey, vendorId) {
  const proxyPath = `/proxy${path}`;
  const url = `${COUPANG_PROXY_URL}${proxyPath}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': COUPANG_PROXY_SECRET,
      'X-Coupang-Access-Key': accessKey,
      'X-Coupang-Secret-Key': secretKey,
      'X-Coupang-Vendor-Id': vendorId,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
  }

  return res.json();
}

// ── 로컬 JSON에서 buyOptions 읽기 ──
function getLocalBuyOptions(code) {
  const detailsPath = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
  const raw = JSON.parse(readFileSync(detailsPath, 'utf-8'));
  const entry = raw[code];
  if (!entry) return null;
  return {
    path: entry.p,
    buyOptions: entry.b.map(o => ({ name: o.n, required: o.r, unit: o.u, choose1: o.c1 })),
  };
}

// ── Main ──
async function main() {
  console.log(`\n🔍 카테고리 ${categoryCode} 속성 비교 진단\n`);

  // 1. 로컬 JSON
  const local = getLocalBuyOptions(categoryCode);
  if (!local) {
    console.error(`❌ 로컬 JSON에서 카테고리 ${categoryCode}을 찾을 수 없습니다.`);
    process.exit(1);
  }
  console.log(`📁 카테고리: ${local.path}`);
  console.log(`📁 로컬 buyOptions (${local.buyOptions.length}개):`);
  for (const opt of local.buyOptions) {
    console.log(`   - "${opt.name}" (필수=${opt.required}, 단위=${opt.unit || 'N/A'}, 택1=${!!opt.choose1})`);
  }

  // 2. 쿠팡 API
  console.log(`\n🌐 쿠팡 API 조회 중...`);
  const creds = await getCredentials();
  const { vendorId, accessKey, secretKey } = creds;

  // 올바른 endpoint: category-related-metas (notices + attributes 둘 다 반환)
  const correctPath = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${categoryCode}`;
  console.log(`   정확한 endpoint: ${correctPath}`);
  const metaResult = await callCoupangApi('GET', correctPath, accessKey, secretKey, vendorId);
  const metaData = metaResult.data || metaResult;

  console.log(`   응답 키: [${Object.keys(metaData).join(', ')}]`);
  const apiAttrs = metaData.attributes || [];

  // 잘못된 endpoint도 시도해서 실패 확인
  const wrongPath = `/v2/providers/seller_api/apis/api/v1/vendor/categories/${categoryCode}/attributes`;
  console.log(`\n⚠️  기존 코드의 endpoint 테스트: ${wrongPath}`);
  try {
    await callCoupangApi('GET', wrongPath, accessKey, secretKey, vendorId);
    console.log(`   결과: 성공 (예상과 다름!)`);
  } catch (e) {
    console.log(`   결과: ❌ ${e.message.slice(0, 200)}`);
    console.log(`   → getCategoryAttributes()는 항상 실패하여 빈 배열 반환!\n`);
  }

  // Raw structure 출력 (첫 번째 + 마지막 속성)
  if (apiAttrs.length > 0) {
    console.log(`\n📋 API 속성 raw 구조 (첫 번째):`);
    console.log(JSON.stringify(apiAttrs[0], null, 2));
    if (apiAttrs.length > 4) {
      console.log(`\n📋 API 속성 raw 구조 (5번째 - 검색용):`);
      console.log(JSON.stringify(apiAttrs[4], null, 2));
    }
  }

  console.log(`\n🌐 쿠팡 API attributes (${apiAttrs.length}개):`);
  const requiredAttrs = apiAttrs.filter(a => a.required);
  console.log(`   필수 속성 (${requiredAttrs.length}개):`);
  for (const attr of requiredAttrs) {
    const enumCount = attr.attributeValueList?.length || 0;
    console.log(`   - "${attr.attributeTypeName}" (dataType=${attr.dataType}, exposed=${attr.exposed}, enum=${enumCount}개)`);
  }

  console.log(`\n   전체 속성 (선택 포함):`);
  for (const attr of apiAttrs) {
    const tag = attr.required ? '★필수' : '선택';
    console.log(`   - [${tag}] "${attr.attributeTypeName}" (dataType=${attr.dataType}, exposed=${attr.exposed})`);
  }

  // 3. 비교 분석
  console.log(`\n═══════════════════════════════════════`);
  console.log(`📊 비교 분석`);
  console.log(`═══════════════════════════════════════\n`);

  let mismatchCount = 0;
  for (const local_opt of local.buyOptions) {
    const exactMatch = apiAttrs.find(a => a.attributeTypeName === local_opt.name);
    if (exactMatch) {
      console.log(`✅ "${local_opt.name}" → API에 정확히 존재 (exposed=${exactMatch.exposed})`);
    } else {
      mismatchCount++;
      // 유사 매칭
      const similar = apiAttrs.find(a => {
        const apiN = a.attributeTypeName;
        const localN = local_opt.name;
        // "개당" 공통 접두사
        if (apiN.includes('개당') && localN.includes('개당')) return true;
        // 수량 계열
        if ((apiN === '수량' || apiN === '총 수량') && (localN === '수량' || localN === '총 수량')) return true;
        return false;
      });
      if (similar) {
        console.log(`⚠️  "${local_opt.name}" → API에서 "${similar.attributeTypeName}"으로 변경됨! (NAME MISMATCH)`);
      } else {
        console.log(`❌ "${local_opt.name}" → API에 존재하지 않음`);
      }
    }
  }

  // API에만 있는 구매옵션형
  const apiOnlyBuyOpts = apiAttrs.filter(a => {
    const n = a.attributeTypeName.toLowerCase();
    const isBuyLike = n.includes('개당') || n === '수량' || n === '총 수량';
    return isBuyLike && !local.buyOptions.some(l => l.name === a.attributeTypeName);
  });
  if (apiOnlyBuyOpts.length > 0) {
    console.log(`\n🆕 API에만 있는 구매옵션형 속성:`);
    for (const a of apiOnlyBuyOpts) {
      console.log(`   - "${a.attributeTypeName}" (required=${a.required}, dataType=${a.dataType})`);
    }
  }

  // 4. 값 포맷 시뮬레이션
  console.log(`\n📝 값 포맷 시뮬레이션 (구매옵션 EXPOSED 속성):`);
  const exposedAttrs = apiAttrs.filter(a => a.exposed === 'EXPOSED');
  for (const attr of exposedAttrs) {
    const localOpt = local.buyOptions.find(l => l.name === attr.attributeTypeName);
    const unit = attr.basicUnit || localOpt?.unit || '';
    console.log(`   "${attr.attributeTypeName}": dataType=${attr.dataType}, basicUnit="${unit}", usableUnits=[${(attr.usableUnits || []).join(',')}]`);
    console.log(`      → 현재 코드가 보내는 값 형태: "숫자${unit}" (예: "90${unit}")`);
    console.log(`      → NUMBER dataType → 순수 숫자만 보내야 할 수 있음 (예: "90")`);
  }

  // 5. 최종 진단
  console.log(`\n═══════════════════════════════════════`);
  if (mismatchCount > 0) {
    console.log(`🚨 진단 결과: ${mismatchCount}개 이름 불일치 발견!`);
  } else {
    console.log(`✅ 이름 일치 확인됨`);
  }
  console.log(`\n🔑 핵심 문제 (확정):`);
  console.log(`   getCategoryAttributes()가 잘못된 endpoint를 사용하여 항상 404`);
  console.log(`   → attributeMeta = [] → 모든 구매옵션 건너뜀 → 옵션 미전송`);
  console.log(`   → 수정: category-related-metas endpoint 사용으로 해결`);
  console.log(`═══════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
