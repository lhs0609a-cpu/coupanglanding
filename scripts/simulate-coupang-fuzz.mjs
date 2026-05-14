// Fuzz 실측 시뮬레이션 — 15,430 cat × 30 variants = ~460k payload build
//
// simulate-coupang-register 와 동일하지만 광범위 fuzz product name 사용.
// 라이브 attributeMeta 기준 검증.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
import { generateFuzzNames } from './fuzz-product-names.mjs';

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

function liveToAttrMeta(la) {
  return la.map(a => ({
    attributeTypeName: a.n, required: !!a.r, dataType: a.dt,
    basicUnit: a.bu, usableUnits: a.uu, exposed: a.ex, groupNumber: a.gn,
    attributeValues: (a.vs || []).map(v => ({ attributeValueName: v })),
  }));
}

function isSentinel(bu) { return bu === '없음' || bu === '없음 '; }

const VARIANTS_PER_CAT = parseInt(process.env.VARIANTS || '30', 10);

const DELIVERY_INFO = {
  vendorUserId: 'DUMMY_USER', shippingMethod: 'NOT_BUNDLE', deliveryCompanyCode: 'CJGLS',
  deliveryChargeType: 'FREE', deliveryCharge: 0, freeShipOverAmount: 0,
  remoteAreaDeliverable: 'Y', outboundShippingPlaceCode: 0, unionDeliveryType: 'NOT_UNION_DELIVERY',
  returnCharge: 5000, returnChargeName: 'X', returnZipCode: '00000', returnAddress: 'X', returnAddressDetail: 'X',
};
const RETURN_INFO = { returnCenterCode: 'X' };

const stats = {
  totalCats: 0, totalCalls: 0, totalAttrs: 0, payloadGenFails: 0, extractFails: 0,
  V: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0 },
  Vc: { 1:new Set(),2:new Set(),3:new Set(),4:new Set(),5:new Set(),6:new Set(),7:new Set() },
  samples: { 1:[],2:[],3:[],4:[],5:[],6:[],7:[],gen:[],ext:[] },
};

function validatePayload(payload, attributeMeta, code, path, productName) {
  const items = payload.items || [];
  if (items.length === 0) return;
  const attrs = items[0].attributes || [];
  stats.totalAttrs += attrs.length;
  const attrMap = new Map(attrs.map(a => [a.attributeTypeName, a]));

  // V1: required + EXPOSED 그룹 검증
  const requiredExposed = attributeMeta.filter(m => m.required && m.exposed === 'EXPOSED');
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
      stats.V[1]++; stats.Vc[1].add(code);
      if (stats.samples[1].length < 30) stats.samples[1].push({ code, path, group: members.map(m=>m.attributeTypeName), product: productName });
    }
  }

  // V2-V5
  for (const a of attrs) {
    const meta = attributeMeta.find(m => m.attributeTypeName === a.attributeTypeName);
    if (!meta) continue;
    const val = a.attributeValueName || '';
    const sentinel = isSentinel(meta.basicUnit);

    if (val.length > 50) {
      stats.V[5]++; stats.Vc[5].add(code);
      if (stats.samples[5].length < 20) stats.samples[5].push({ code, path, attr: a.attributeTypeName, val, len: val.length, product: productName });
    }

    if (meta.dataType === 'NUMBER') {
      const usable = meta.usableUnits || [];
      const validUnits = [...usable];
      if (meta.basicUnit && !sentinel && !validUnits.includes(meta.basicUnit)) validUnits.push(meta.basicUnit);
      const m = val.match(/^(\d+(?:\.\d+)?)(.*)$/);
      if (!m) {
        stats.V[2]++; stats.Vc[2].add(code);
        if (stats.samples[2].length < 30) stats.samples[2].push({ code, path, attr: a.attributeTypeName, val, validUnits, product: productName });
      } else {
        const tail = m[2].trim();
        if (validUnits.length > 0 && tail && !validUnits.includes(tail)) {
          stats.V[2]++; stats.Vc[2].add(code);
          if (stats.samples[2].length < 30) stats.samples[2].push({ code, path, attr: a.attributeTypeName, val, tail, validUnits, product: productName });
        }
        if (validUnits.length > 0 && !tail) {
          stats.V[2]++; stats.Vc[2].add(code);
          if (stats.samples[2].length < 30) stats.samples[2].push({ code, path, attr: a.attributeTypeName, val, validUnits, note: 'no-unit', product: productName });
        }
      }
    }
    if (meta.dataType === 'STRING') {
      if (!val) {
        stats.V[3]++; stats.Vc[3].add(code);
        if (stats.samples[3].length < 30) stats.samples[3].push({ code, path, attr: a.attributeTypeName, val, note: 'empty', product: productName });
      } else if (sentinel && val.endsWith('없음')) {
        stats.V[3]++; stats.Vc[3].add(code);
        if (stats.samples[3].length < 30) stats.samples[3].push({ code, path, attr: a.attributeTypeName, val, note: 'sentinel-suffix', product: productName });
      }
    }
    if (meta.attributeValues && meta.attributeValues.length > 0) {
      const enumVals = meta.attributeValues.map(v => v.attributeValueName);
      if (!enumVals.includes(val)) {
        stats.V[4]++; stats.Vc[4].add(code);
        if (stats.samples[4].length < 20) stats.samples[4].push({ code, path, attr: a.attributeTypeName, val, enumSample: enumVals.slice(0,5), product: productName });
      }
    }
  }

  // V6: groupNumber 중복
  const exposedGroups = new Map();
  for (const m of attributeMeta) {
    if (m.exposed !== 'EXPOSED' || !m.groupNumber || m.groupNumber === 'NONE') continue;
    if (!exposedGroups.has(m.groupNumber)) exposedGroups.set(m.groupNumber, []);
    exposedGroups.get(m.groupNumber).push(m.attributeTypeName);
  }
  for (const [, members] of exposedGroups) {
    const presentInPayload = members.filter(n => attrMap.has(n));
    if (presentInPayload.length > 1) {
      stats.V[6]++; stats.Vc[6].add(code);
      if (stats.samples[6].length < 20) stats.samples[6].push({ code, path, members, present: presentInPayload, product: productName });
    }
  }

  // V7: attributeValueName 빈 값 (전 모든 attr 대상)
  for (const a of attrs) {
    if (!a.attributeValueName || a.attributeValueName === '') {
      stats.V[7]++; stats.Vc[7].add(code);
      if (stats.samples[7].length < 20) stats.samples[7].push({ code, path, attr: a.attributeTypeName, product: productName });
    }
  }
}

const startAt = Date.now();
const allCats = Object.keys(liveMeta);
console.log(`Fuzz simulating ${allCats.length} cats × ${VARIANTS_PER_CAT} variants = ${allCats.length * VARIANTS_PER_CAT} payload builds\n`);

for (let ci = 0; ci < allCats.length; ci++) {
  const code = allCats[ci];
  const info = catInfo.get(code);
  if (!info) continue;
  const attributeMeta = liveToAttrMeta(liveMeta[code]);
  stats.totalCats++;

  const fuzzNames = generateFuzzNames(info.leaf, VARIANTS_PER_CAT);

  for (const productName of fuzzNames) {
    stats.totalCalls++;
    let extracted;
    try {
      extracted = await oe.extractOptionsEnhanced({
        productName, categoryCode: code, categoryPath: info.path,
      });
    } catch (e) {
      stats.extractFails++;
      if (stats.samples.ext.length < 10) stats.samples.ext.push({ code, path: info.path, productName, err: e.message?.slice(0, 200) });
      continue;
    }
    if (!extracted) continue;

    let payload;
    try {
      payload = builder.buildCoupangProductPayload({
        vendorId: 'DUMMY_VENDOR',
        product: { folderPath: '/tmp', productCode: `D_${code}_${stats.totalCalls}`, productJson: { name: productName, price: 19900 }, mainImages: ['m.jpg'], detailImages: [], infoImages: [], reviewImages: [] },
        sellingPrice: 19900,
        categoryCode: code,
        mainImageUrls: ['https://example.com/m.jpg'],
        detailImageUrls: ['https://example.com/d.jpg'],
        deliveryInfo: DELIVERY_INFO, returnInfo: RETURN_INFO,
        attributeMeta,
        extractedBuyOptions: extracted.buyOptions,
        totalUnitCount: extracted.totalUnitCount,
        displayProductName: productName || info.leaf,
        sellerProductName: productName || info.leaf,
        categoryPath: info.path,
      });
    } catch (e) {
      stats.payloadGenFails++;
      if (stats.samples.gen.length < 30) stats.samples.gen.push({ code, path: info.path, productName, err: e.message?.slice(0, 250) });
      continue;
    }
    validatePayload(payload, attributeMeta, code, info.path, productName);
  }

  if ((ci + 1) % 1500 === 0) {
    const el = ((Date.now() - startAt) / 1000).toFixed(0);
    const tot = Object.values(stats.V).reduce((a, b) => a + b, 0);
    console.log(`[${ci+1}/${allCats.length}] ${el}s | calls=${stats.totalCalls} | attrs=${stats.totalAttrs} | V=${tot} | genFail=${stats.payloadGenFails} | extFail=${stats.extractFails}`);
  }
}

const elapsedSec = ((Date.now() - startAt) / 1000).toFixed(1);
const pct = (n, d) => +(n / Math.max(1, d) * 100).toFixed(3);
const summary = {
  meta: {
    cachedCats: Object.keys(liveMeta).length,
    simulatedCats: stats.totalCats,
    variantsPerCat: VARIANTS_PER_CAT,
    totalCalls: stats.totalCalls,
    totalAttrs: stats.totalAttrs,
    payloadGenFails: stats.payloadGenFails,
    extractFails: stats.extractFails,
    elapsedSec: parseFloat(elapsedSec),
  },
  violations: {
    V1_REQUIRED_UNFILLED: { count: stats.V[1], pct: pct(stats.V[1], stats.totalCalls), cats: stats.Vc[1].size },
    V2_NUMBER_INVALID:    { count: stats.V[2], pct: pct(stats.V[2], stats.totalAttrs), cats: stats.Vc[2].size },
    V3_STRING_INVALID:    { count: stats.V[3], pct: pct(stats.V[3], stats.totalAttrs), cats: stats.Vc[3].size },
    V4_ENUM_INVALID:      { count: stats.V[4], pct: pct(stats.V[4], stats.totalAttrs), cats: stats.Vc[4].size },
    V5_VALUE_TOO_LONG:    { count: stats.V[5], pct: pct(stats.V[5], stats.totalAttrs), cats: stats.Vc[5].size },
    V6_GROUP_DUPLICATE:   { count: stats.V[6], pct: pct(stats.V[6], stats.totalCalls), cats: stats.Vc[6].size },
    V7_ATTR_VALUE_EMPTY:  { count: stats.V[7], pct: pct(stats.V[7], stats.totalAttrs), cats: stats.Vc[7].size },
  },
  samples: stats.samples,
};

writeFileSync('simulate-coupang-fuzz-result.json', JSON.stringify(summary, null, 2));
console.log('\n=== Fuzz 실측 시뮬레이션 결과 ===');
console.log(`Simulated ${stats.totalCats.toLocaleString()} cats × ${VARIANTS_PER_CAT} variants = ${stats.totalCalls.toLocaleString()} builds in ${elapsedSec}s`);
console.log(`Attrs checked: ${stats.totalAttrs.toLocaleString()} | extractFail=${stats.extractFails} | payloadGenFail=${stats.payloadGenFails}\n`);
for (const [name, v] of Object.entries(summary.violations)) {
  const status = v.count === 0 ? '✅' : '🚨';
  console.log(`${status} ${name.padEnd(28)} ${v.count.toLocaleString().padStart(7)} (${v.pct}%) | ${v.cats} cats`);
}
console.log('\n결과: simulate-coupang-fuzz-result.json');
