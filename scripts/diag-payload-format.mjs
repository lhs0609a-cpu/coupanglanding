/**
 * 종합 진단: 쿠팡 구매옵션 값 포맷 검증
 *
 * 1. category-related-metas RAW 응답 확인
 * 2. 우리 코드가 빌드하는 attributes 시뮬레이션
 * 3. 기존 등록 상품 조회하여 실제 attribute 포��� 비교
 *
 * 사용: node scripts/diag-payload-format.mjs [categoryCode]
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dwfhcshvkxyokvtbgluw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Zmhjc2h2a3h5b2t2dGJnbHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTE4MSwiZXhwIjoyMDg4MDA3MTgxfQ.nU6WSkFOgU6YX6uhIzSZFseK6jWud4v4yq3WheLjirI';
const COUPANG_PROXY_URL = 'https://coupang-api-proxy.fly.dev';
const COUPANG_PROXY_SECRET = 'cpx-3dbbbbc400bb7c15e68d258bfb86e2dc';

const categoryCode = process.argv[2] || '58920';

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

async function callCoupangApi(method, path, accessKey, secretKey, vendorId, body) {
  const proxyPath = `/proxy${path}`;
  const url = `${COUPANG_PROXY_URL}${proxyPath}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': COUPANG_PROXY_SECRET,
      'X-Coupang-Access-Key': accessKey,
      'X-Coupang-Secret-Key': secretKey,
      'X-Coupang-Vendor-Id': vendorId,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function main() {
  const creds = await getCredentials();
  const { vendorId, accessKey, secretKey } = creds;

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  쿠팡 구매옵션 포맷 종합 진단`);
  console.log(`  카테고리: ${categoryCode}, 벤더: ${vendorId}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // ═══ 1. category-related-metas RAW 응답 ═══
  console.log(`\n📋 [1] category-related-metas RAW 응답\n`);
  const metaPath = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${categoryCode}`;
  const metaRaw = await callCoupangApi('GET', metaPath, accessKey, secretKey, vendorId);
  const metaData = metaRaw.data || metaRaw;

  const attrs = metaData.attributes || [];
  console.log(`  총 속성: ${attrs.length}개`);
  console.log(`  응답 최상위 키: [${Object.keys(metaData).join(', ')}]`);

  const exposedAttrs = attrs.filter(a => a.exposed === 'EXPOSED');
  const mandatoryExposed = exposedAttrs.filter(a => a.required === 'MANDATORY');

  console.log(`\n  📌 EXPOSED 속성 (${exposedAttrs.length}개, 필수=${mandatoryExposed.length}개):`);
  for (const attr of exposedAttrs) {
    console.log(`    [${attr.required}] "${attr.attributeTypeName}"`);
    console.log(`       dataType=${attr.dataType}, basicUnit="${attr.basicUnit || ''}", usableUnits=[${(attr.usableUnits || []).join(',')}]`);
    console.log(`       groupNumber=${attr.groupNumber}, inputValues=${(attr.inputValues || []).length}개`);
    if (attr.inputValues && attr.inputValues.length > 0) {
      console.log(`       inputValues 예시: ${attr.inputValues.slice(0, 5).map(v => `"${v.inputValue || v.attributeValueName}"`).join(', ')}`);
    }
  }

  const nonExposedMandatory = attrs.filter(a => a.exposed !== 'EXPOSED' && a.required === 'MANDATORY');
  console.log(`\n  📌 NON-EXPOSED 필수 속성 (${nonExposedMandatory.length}개):`);
  for (const attr of nonExposedMandatory) {
    console.log(`    [${attr.exposed}] "${attr.attributeTypeName}" dataType=${attr.dataType}`);
  }

  // ═══ 2. 우리 코드의 buildAttributes 시뮬레이션 ═══
  console.log(`\n\n📋 [2] buildAttributes 시뮬레이션 (현�� 코드 로직)\n`);

  // EXPOSED + MANDATORY만 빌드 (현재 코드 로직)
  const simulatedAttrs = [];
  for (const attr of attrs) {
    const isRequired = attr.required === 'MANDATORY';
    const isExposed = attr.exposed === 'EXPOSED';
    if (!isRequired || !isExposed) continue;

    const unit = attr.basicUnit || (attr.usableUnits && attr.usableUnits[0]) || '';
    let value;

    if (attr.inputValues && attr.inputValues.length > 0) {
      // ENUM: 첫 번��� 선택지
      value = attr.inputValues[0].inputValue || attr.inputValues[0].attributeValueName || '';
    } else if (attr.dataType === 'NUMBER') {
      // NUMBER: "1+단위" 폴백
      value = unit ? `1${unit}` : '1';
    } else {
      value = '상세페이지 참조';
    }

    simulatedAttrs.push({
      attributeTypeName: attr.attributeTypeName,
      attributeValueName: value,
      _meta: { dataType: attr.dataType, basicUnit: attr.basicUnit, usableUnits: attr.usableUnits, groupNumber: attr.groupNumber },
    });
  }

  console.log(`  빌드된 attributes (${simulatedAttrs.length}개):`);
  for (const a of simulatedAttrs) {
    const meta = a._meta;
    console.log(`    "${a.attributeTypeName}" = "${a.attributeValueName}"`);
    console.log(`       (dataType=${meta.dataType}, basicUnit="${meta.basicUnit || ''}", usableUnits=[${(meta.usableUnits || []).join(',')}], group=${meta.groupNumber})`);
  }

  // 택1 그룹 시뮬레이션
  const groups = new Map();
  for (const a of simulatedAttrs) {
    const gn = a._meta.groupNumber;
    if (gn && gn !== 'NONE') {
      if (!groups.has(gn)) groups.set(gn, []);
      groups.get(gn).push(a.attributeTypeName);
    }
  }
  if (groups.size > 0) {
    console.log(`\n  ⚠️ 택1 그룹:`);
    for (const [gn, members] of groups) {
      console.log(`    그룹 ${gn}: [${members.join(', ')}] → ${members.length > 1 ? '하나만 남겨야 함!' : 'OK'}`);
    }
  }

  // 택1 그룹 처리 후 최종 (첫번째만 유지)
  const finalAttrs = [];
  const keptGroups = new Set();
  for (const a of simulatedAttrs) {
    const gn = a._meta.groupNumber;
    if (gn && gn !== 'NONE') {
      if (keptGroups.has(gn)) continue;
      keptGroups.add(gn);
    }
    finalAttrs.push({ attributeTypeName: a.attributeTypeName, attributeValueName: a.attributeValueName });
  }

  console.log(`\n  🔥 최종 전송될 attributes (${finalAttrs.length}개):`);
  for (const a of finalAttrs) {
    console.log(`    { "attributeTypeName": "${a.attributeTypeName}", "attributeValueName": "${a.attributeValueName}" }`);
  }

  // ═══ 3. 기존 등록 상품에서 실제 attribute 포맷 확인 ═══
  console.log(`\n\n📋 [3] 기존 등록 상품의 실제 attributes 포맷\n`);

  // DB에서 최근 성공한 상품 ID 조회
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: recentProducts } = await supabase
    .from('megaload_registered_products')
    .select('channel_product_id, product_code, category_code, status')
    .eq('channel', 'coupang')
    .not('channel_product_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentProducts && recentProducts.length > 0) {
    console.log(`  최근 등록 상품 ${recentProducts.length}개:`);
    for (const p of recentProducts) {
      console.log(`    - ID=${p.channel_product_id}, code=${p.product_code}, cat=${p.category_code}, status=${p.status}`);
    }

    // 첫 번째 상품 조회
    const productId = recentProducts[0].channel_product_id;
    console.log(`\n  🔍 상품 조회: ${productId}`);
    try {
      const productPath = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${productId}`;
      const productRaw = await callCoupangApi('GET', productPath, accessKey, secretKey, vendorId);
      const productData = productRaw.data || productRaw;

      const items = productData.items || productData.sellerProductItemList || [];
      console.log(`  items: ${items.length}개`);

      if (items.length > 0) {
        const item0 = items[0];
        const itemAttrs = item0.attributes || [];
        console.log(`\n  ✅ 실제 등록된 상품의 attributes (${itemAttrs.length}개):`);
        for (const a of itemAttrs) {
          console.log(`    { "attributeTypeName": "${a.attributeTypeName}", "attributeValueName": "${a.attributeValueName}" ${a.exposed ? `, "exposed": "${a.exposed}"` : ''} ${a.editable !== undefined ? `, "editable": ${a.editable}` : ''} }`);
        }
      }
    } catch (e) {
      console.log(`  ❌ 상품 조회 실패: ${e.message.slice(0, 200)}`);
    }
  } else {
    console.log(`  등록된 상품이 없습니다.`);
  }

  // ═══ 4. 에러 상품의 payload 로그 확인 ═══
  console.log(`\n\n📋 [4] 최근 실패한 상품 정보\n`);
  const { data: failedProducts } = await supabase
    .from('megaload_registered_products')
    .select('product_code, category_code, error_message, created_at')
    .eq('channel', 'coupang')
    .eq('status', 'error')
    .ilike('error_message', '%구매 옵션%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (failedProducts && failedProducts.length > 0) {
    console.log(`  최근 구매옵션 에러 상품 ${failedProducts.length}개:`);
    for (const p of failedProducts) {
      console.log(`    - code=${p.product_code}, cat=${p.category_code}`);
      console.log(`      에러: ${(p.error_message || '').slice(0, 200)}`);
      console.log(`      시간: ${p.created_at}`);
    }

    // 실패 상품의 카테고리로 메타 확인
    if (failedProducts[0].category_code && failedProducts[0].category_code !== categoryCode) {
      const failCat = failedProducts[0].category_code;
      console.log(`\n  ⚠️ 실패 상품의 카테고리 (${failCat})가 테스트 카테고리 (${categoryCode})와 다릅니다!`);
      console.log(`  실패 카테고리 메타 조회 중...`);

      try {
        const failMetaPath = `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${failCat}`;
        const failMetaRaw = await callCoupangApi('GET', failMetaPath, accessKey, secretKey, vendorId);
        const failMetaData = failMetaRaw.data || failMetaRaw;
        const failAttrs = (failMetaData.attributes || []).filter(a => a.exposed === 'EXPOSED');

        console.log(`  EXPOSED 속성 (${failAttrs.length}개):`);
        for (const a of failAttrs) {
          const unit = a.basicUnit || '';
          const usable = (a.usableUnits || []).join(',');
          console.log(`    [${a.required}] "${a.attributeTypeName}" type=${a.dataType} unit="${unit}" usable=[${usable}] group=${a.groupNumber}`);
        }
      } catch (e) {
        console.log(`  메타 조회 실패: ${e.message.slice(0, 200)}`);
      }
    }
  } else {
    console.log(`  구매옵션 관련 에러 상품 없음`);
  }

  // ═══ 5. 포맷 비교 & 결론 ═══
  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  📊 진단 결론`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  console.log(`  현재 코드가 보내는 값 포맷:`);
  for (const a of finalAttrs) {
    console.log(`    "${a.attributeTypeName}": "${a.attributeValueName}"`);
  }
  console.log(`\n  확인 필요 사항:`);
  console.log(`  1. 실제 등록 성공한 상품의 attribute 포맷과 일치하는지?`);
  console.log(`  2. 택1 그룹이 올바르게 1개만 전송되는지?`);
  console.log(`  3. 전송하는 단위가 API의 basicUnit/usableUnits에 포함되는지?`);
  console.log(`  4. 실패 상품의 카테고리가 유효한지?\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
