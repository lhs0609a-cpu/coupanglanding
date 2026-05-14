// 실측 시뮬레이션: 16k 카테고리 × N spec → 실제 buildCoupangProductPayload 호출 → 라이브 API 메타 기준 페이로드 검증
//
// 각 cat × spec 마다:
//   1. extractOptionsEnhanced 로 buyOptions 추출
//   2. buildCoupangProductPayload 로 실제 등록 페이로드 생성 (full pipeline)
//   3. payload.sellerProductItemList[].attributes 를 라이브 attributeMeta 기준 validate
//
// Validation:
//   V1. 모든 required + EXPOSED attribute 가 payload 에 있고 value != ''
//   V2. NUMBER dataType: value 가 ^\d+(\.\d+)?<usable_unit>$ 형식
//   V3. STRING dataType: value 가 non-empty, 끝에 sentinel "없음" 부착 금지
//   V4. ENUM (attributeValues non-empty): value ∈ attributeValueList
//   V5. attributeValueName 길이 ≤ 50
//   V6. groupNumber 택1 그룹: payload 에 정확히 1개만 등장

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const oe = await jiti.import('../src/lib/megaload/services/option-extractor.ts');
const builder = await jiti.import('../src/lib/megaload/services/coupang-product-builder.ts');

const idx = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json'), 'utf-8'));

const CACHE_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'cache');
const liveMeta = {};
for (let s = 0; s < 10; s++) {
  const f = join(CACHE_DIR, `live-attr-meta-shard${String(s).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  for (const [code, val] of Object.entries(data)) if (val.attrs) liveMeta[code] = val.attrs;
}
console.log(`Live cache: ${Object.keys(liveMeta).length} cats`);

const catInfo = new Map();
for (const [code, fullSpace, leaf] of idx) {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  catInfo.set(String(code), { path, leaf });
}

// 라이브 API 의 b/s/u/c1/dt 표현을 builder AttributeMeta 형태로 변환
function liveToAttrMeta(liveAttrs) {
  return liveAttrs.map(a => ({
    attributeTypeName: a.n,
    required: !!a.r,
    dataType: a.dt,
    basicUnit: a.bu,
    usableUnits: a.uu,
    exposed: a.ex,
    groupNumber: a.gn,
    attributeValues: (a.vs || []).map(v => ({ attributeValueName: v })),
  }));
}

// dummy product
function makeProduct(code, leaf, suffix) {
  return {
    folderPath: '/tmp/dummy',
    productCode: `DUMMY_${code}`,
    productJson: {
      name: `${leaf} ${suffix}`,
      title: `${leaf} ${suffix}`,
      price: 19900,
      brand: '메가로드',
      tags: [],
      description: '',
    },
    mainImages: ['/tmp/dummy/main.jpg'],
    detailImages: [],
    infoImages: [],
    reviewImages: [],
  };
}

const DELIVERY_INFO = {
  vendorUserId: 'DUMMY_USER',
  shippingMethod: 'NOT_BUNDLE',
  deliveryCompanyCode: 'CJGLS',
  deliveryChargeType: 'FREE',
  deliveryCharge: 0,
  freeShipOverAmount: 0,
  remoteAreaDeliverable: 'Y',
  outboundShippingPlaceCode: 0,
  unionDeliveryType: 'NOT_UNION_DELIVERY',
  returnCharge: 5000,
  returnChargeName: 'DUMMY',
  returnZipCode: '00000',
  returnAddress: 'DUMMY',
  returnAddressDetail: 'DUMMY',
};
const RETURN_INFO = {
  centerCode: 'DUMMY',
  applyResolvedToAllItems: true,
};

const SPECS = [
  '17kg, 1개',
  '500ml, 2개입',
  '1kg 3개입',
  '10개입 박스',
  '60정 2통',
  '30포 3박스',
  '슈퍼 견고한 가정용 17kg, 1개',
  '프리미엄 100g x 24개',
  '대용량 200ml x 12개',
];

const stats = {
  totalCats: 0, totalCalls: 0, totalAttrs: 0, payloadGenFails: 0,
  V: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 },
  Vc: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() },
  samples: { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[], gen:[] },
};

function isSentinel(bu) { return bu === '없음' || bu === '없음 '; }

function validatePayload(payload, attributeMeta, code, path, productName, samples, stats) {
  const items = payload.items || payload.sellerProductItemList || [];
  if (items.length === 0) return;
  // 단일 옵션 상품으로 시뮬레이션 → 첫 item 만 검증
  const attrs = items[0].attributes || [];
  stats.totalAttrs += attrs.length;
  const attrMap = new Map(attrs.map(a => [a.attributeTypeName, a]));

  // V1: required + EXPOSED 모두 채워졌는지
  const requiredExposed = attributeMeta.filter(m => m.required && m.exposed === 'EXPOSED');
  // groupNumber 택1: 그룹 단위로 1개 이상 채워졌는지
  const grouped = new Map();
  for (const m of requiredExposed) {
    const key = m.groupNumber && m.groupNumber !== 'NONE' ? `gn:${m.groupNumber}` : `single:${m.attributeTypeName}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m);
  }
  for (const [, members] of grouped) {
    const filled = members.filter(m => {
      const ap = attrMap.get(m.attributeTypeName);
      return ap && ap.attributeValueName && ap.attributeValueName !== '';
    });
    if (filled.length === 0) {
      stats.V[1]++;
      stats.Vc[1].add(code);
      if (samples[1].length < 30) samples[1].push({ code, path, group: members.map(m=>m.attributeTypeName), product: productName });
    }
  }

  // V2-V5: 각 attribute value 형식 검증
  for (const a of attrs) {
    const meta = attributeMeta.find(m => m.attributeTypeName === a.attributeTypeName);
    if (!meta) continue;  // builder 가 알 수 없는 attr 만든 케이스
    const val = a.attributeValueName || '';
    const sentinel = isSentinel(meta.basicUnit);

    // V5: length
    if (val.length > 50) {
      stats.V[5]++;
      stats.Vc[5].add(code);
      if (samples[5].length < 20) samples[5].push({ code, path, attr: a.attributeTypeName, val, len: val.length });
    }

    // V2: NUMBER
    if (meta.dataType === 'NUMBER') {
      const usable = meta.usableUnits || [];
      const validUnits = [...usable];
      if (meta.basicUnit && !sentinel && !validUnits.includes(meta.basicUnit)) validUnits.push(meta.basicUnit);
      // value 형식: "<숫자>" 또는 "<숫자><unit>"
      const m = val.match(/^(\d+(?:\.\d+)?)(.*)$/);
      if (!m) {
        // 숫자로 시작 안함 — fallback "상세페이지 참조" 같은 케이스
        stats.V[2]++;
        stats.Vc[2].add(code);
        if (samples[2].length < 30) samples[2].push({ code, path, attr: a.attributeTypeName, val, validUnits });
      } else {
        const tail = m[2].trim();
        if (validUnits.length > 0 && tail && !validUnits.includes(tail)) {
          stats.V[2]++;
          stats.Vc[2].add(code);
          if (samples[2].length < 30) samples[2].push({ code, path, attr: a.attributeTypeName, val, tail, validUnits });
        }
        if (validUnits.length > 0 && !tail) {
          // 단위 누락
          stats.V[2]++;
          stats.Vc[2].add(code);
          if (samples[2].length < 30) samples[2].push({ code, path, attr: a.attributeTypeName, val, validUnits, note: 'no-unit' });
        }
      }
    }

    // V3: STRING + sentinel basicUnit
    if (meta.dataType === 'STRING') {
      if (!val) {
        stats.V[3]++;
        stats.Vc[3].add(code);
        if (samples[3].length < 30) samples[3].push({ code, path, attr: a.attributeTypeName, val, note: 'empty' });
      } else if (sentinel && val.endsWith('없음')) {
        stats.V[3]++;
        stats.Vc[3].add(code);
        if (samples[3].length < 30) samples[3].push({ code, path, attr: a.attributeTypeName, val, note: 'sentinel-suffix' });
      }
    }

    // V4: ENUM
    if (meta.attributeValues && meta.attributeValues.length > 0) {
      const enumVals = meta.attributeValues.map(v => v.attributeValueName);
      if (!enumVals.includes(val)) {
        stats.V[4]++;
        stats.Vc[4].add(code);
        if (samples[4].length < 30) samples[4].push({ code, path, attr: a.attributeTypeName, val, enumSample: enumVals.slice(0,5) });
      }
    }
  }

  // V6: groupNumber 그룹 내 EXPOSED 가 정확히 1개만 payload 에 있는지 (다중 출현 검사)
  const exposedGroups = new Map();
  for (const m of attributeMeta) {
    if (m.exposed !== 'EXPOSED' || !m.groupNumber || m.groupNumber === 'NONE') continue;
    if (!exposedGroups.has(m.groupNumber)) exposedGroups.set(m.groupNumber, []);
    exposedGroups.get(m.groupNumber).push(m.attributeTypeName);
  }
  for (const [, members] of exposedGroups) {
    const presentInPayload = members.filter(n => attrMap.has(n));
    if (presentInPayload.length > 1) {
      stats.V[6]++;
      stats.Vc[6].add(code);
      if (samples[6].length < 20) samples[6].push({ code, path, members, present: presentInPayload });
    }
  }
}

const startAt = Date.now();
const allCats = Object.keys(liveMeta);
console.log(`Simulating ${allCats.length} cats × ${SPECS.length} specs = ${allCats.length * SPECS.length} payload builds\n`);

for (let ci = 0; ci < allCats.length; ci++) {
  const code = allCats[ci];
  const info = catInfo.get(code);
  if (!info) continue;
  const liveAttrs = liveMeta[code];
  const attributeMeta = liveToAttrMeta(liveAttrs);
  stats.totalCats++;

  for (const suffix of SPECS) {
    const productName = `${info.leaf} ${suffix}`;
    stats.totalCalls++;
    let extracted;
    try {
      extracted = await oe.extractOptionsEnhanced({
        productName,
        categoryCode: code,
        categoryPath: info.path,
      });
    } catch (e) { continue; }
    if (!extracted) continue;

    let payload;
    try {
      payload = builder.buildCoupangProductPayload({
        vendorId: 'DUMMY_VENDOR',
        product: makeProduct(code, info.leaf, suffix),
        sellingPrice: 19900,
        categoryCode: code,
        mainImageUrls: ['https://example.com/main.jpg'],
        detailImageUrls: ['https://example.com/d1.jpg'],
        deliveryInfo: DELIVERY_INFO,
        returnInfo: RETURN_INFO,
        attributeMeta,
        extractedBuyOptions: extracted.buyOptions,
        totalUnitCount: extracted.totalUnitCount,
        displayProductName: productName,
        sellerProductName: productName,
        categoryPath: info.path,
      });
    } catch (e) {
      stats.payloadGenFails++;
      if (stats.samples.gen.length < 20) stats.samples.gen.push({ code, path: info.path, productName, err: e.message?.slice(0, 200) });
      continue;
    }

    validatePayload(payload, attributeMeta, code, info.path, productName, stats.samples, stats);
  }

  if ((ci + 1) % 1500 === 0) {
    const el = ((Date.now() - startAt) / 1000).toFixed(0);
    const totalV = Object.values(stats.V).reduce((a, b) => a + b, 0);
    console.log(`[${ci+1}/${allCats.length}] ${el}s | calls=${stats.totalCalls} | attrs=${stats.totalAttrs} | violations=${totalV} | genFail=${stats.payloadGenFails}`);
  }
}

const elapsedSec = ((Date.now() - startAt) / 1000).toFixed(1);
const pct = (n, d) => +(n / Math.max(1, d) * 100).toFixed(3);
const totalV = Object.values(stats.V).reduce((a, b) => a + b, 0);
const summary = {
  meta: {
    cachedCats: Object.keys(liveMeta).length,
    simulatedCats: stats.totalCats,
    totalCalls: stats.totalCalls,
    totalAttrs: stats.totalAttrs,
    payloadGenFails: stats.payloadGenFails,
    totalViolations: totalV,
    elapsedSec: parseFloat(elapsedSec),
  },
  violations: {
    V1_REQUIRED_UNFILLED: { count: stats.V[1], pct: pct(stats.V[1], stats.totalCalls), cats: stats.Vc[1].size },
    V2_NUMBER_INVALID:    { count: stats.V[2], pct: pct(stats.V[2], stats.totalAttrs), cats: stats.Vc[2].size },
    V3_STRING_INVALID:    { count: stats.V[3], pct: pct(stats.V[3], stats.totalAttrs), cats: stats.Vc[3].size },
    V4_ENUM_INVALID:      { count: stats.V[4], pct: pct(stats.V[4], stats.totalAttrs), cats: stats.Vc[4].size },
    V5_VALUE_TOO_LONG:    { count: stats.V[5], pct: pct(stats.V[5], stats.totalAttrs), cats: stats.Vc[5].size },
    V6_GROUP_DUPLICATE:   { count: stats.V[6], pct: pct(stats.V[6], stats.totalCalls), cats: stats.Vc[6].size },
  },
  samples: stats.samples,
};

writeFileSync('simulate-coupang-register-result.json', JSON.stringify(summary, null, 2));
console.log('\n=== 실측 시뮬레이션 결과 ===');
console.log(`Simulated ${stats.totalCats.toLocaleString()} cats × ${SPECS.length} specs = ${stats.totalCalls.toLocaleString()} payload builds in ${elapsedSec}s`);
console.log(`Total attributes in payloads: ${stats.totalAttrs.toLocaleString()}`);
console.log(`Payload generation failures: ${stats.payloadGenFails}\n`);
for (const [name, v] of Object.entries(summary.violations)) {
  const status = v.count === 0 ? '✅' : '🚨';
  console.log(`${status} ${name.padEnd(28)} ${v.count.toLocaleString().padStart(7)} (${v.pct}%) | ${v.cats} cats`);
}
console.log('\n결과: simulate-coupang-register-result.json');
