// ─────────────────────────────────────────────────────────────────────────────
// 실측: 16,259 쿠팡 카테고리 전부 프리플라이트 검증 게이트를 통과하는지 전수 시뮬레이션
//
// 방식: 각 카테고리에 대해 "정상 합성 상품"(유효한 상품명/판매가/원가/카테고리코드/이미지1장)을
//   만들고, 해당 카테고리의 로컬 메타(coupang-cat-details.json 의 b/s=속성, nc=정보고시)로
//   validateProductDeep 를 실행 → errors.length>0 이면 그 카테고리는 "프리플라이트 실패".
//   (쿠팡 API 호출 0번 — 전부 로컬. 프리플라이트 route 의 pass 기준: validation.errors.length===0)
//
// 출력: 통과/실패 수 + 실패 사유별 집계 + 실패 카테고리 샘플 → audit-preflight-16k-result.json
// 실행: node scripts/audit-preflight-16k.mjs   (LIMIT=500 스모크)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const jiti = createJiti(import.meta.url, { interopDefault: true });

const pv = await jiti.import('../src/lib/megaload/services/product-validator.ts');
const validateProductDeep = pv.validateProductDeep;

const cats = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/coupang-cat-details.json'), 'utf-8'));
const codes = Object.keys(cats);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : codes.length;

/** 로컬 cat-details 항목 → CategoryMetadata (b/s → attributeMeta, nc → noticeMeta) */
function toMeta(c) {
  const attrs = [...(c.b || []), ...(c.s || [])].map((a) => ({
    attributeTypeName: a.n,
    required: !!a.r,
    dataType: a.dataType || 'STRING',
    basicUnit: a.u,
    attributeValues: a.v ? a.v.map((x) => ({ attributeValueName: typeof x === 'string' ? x : x.n })) : undefined,
  }));
  let notices = [];
  const nc = c.nc;
  if (nc && typeof nc === 'object') {
    // nc 가 {n, f:[{n,r}]} 또는 배열 형태일 수 있음 — 방어적 매핑
    const arr = Array.isArray(nc) ? nc : [nc];
    notices = arr.filter(Boolean).map((g) => ({
      noticeCategoryName: g.n || g.noticeCategoryName || '기타',
      fields: (g.f || g.fields || []).map((f) => ({ name: f.n || f.name, required: !!(f.r ?? f.required) })),
    }));
  }
  return { attributeMeta: attrs, noticeMeta: notices };
}

const reasonCount = {};
const failSamples = [];
let pass = 0, fail = 0, crash = 0;

const t0 = Date.now();
for (let i = 0; i < LIMIT; i++) {
  const code = codes[i];
  const c = cats[code];
  const leaf = (c.p || '').split('>').pop() || '상품';
  const meta = toMeta(c);
  const product = {
    editedName: `${leaf} 정품 프리미엄 테스트 상품명`.slice(0, 90),
    editedSellingPrice: 19900,
    editedCategoryCode: code,
    editedBrand: '테스트브랜드',
    sourcePrice: 9900,
    mainImageCount: 1,
    scannedMainImages: [{ name: '1.jpg' }],
    noticeMeta: meta.noticeMeta,
    attributeMeta: meta.attributeMeta,
  };
  try {
    const res = validateProductDeep(product, meta, '010-1234-5678', {});
    if (res.errors.length > 0) {
      fail++;
      for (const e of res.errors) {
        const key = `${e.field}:${(e.message || '').slice(0, 40)}`;
        reasonCount[key] = (reasonCount[key] || 0) + 1;
      }
      if (failSamples.length < 40) failSamples.push({ code, path: c.p, errors: res.errors.map((e) => `${e.field}: ${e.message}`) });
    } else {
      pass++;
    }
  } catch (err) {
    crash++;
    const key = `CRASH:${(err.message || '').slice(0, 50)}`;
    reasonCount[key] = (reasonCount[key] || 0) + 1;
    if (failSamples.length < 40) failSamples.push({ code, path: c.p, crash: err.message });
  }
  if (i % 2000 === 0) console.log(`  ${i}/${LIMIT} … pass=${pass} fail=${fail} crash=${crash}`);
}

const result = {
  total: LIMIT,
  pass, fail, crash,
  passRate: ((pass / LIMIT) * 100).toFixed(2) + '%',
  wallSec: ((Date.now() - t0) / 1000).toFixed(1),
  reasonCount: Object.fromEntries(Object.entries(reasonCount).sort((a, b) => b[1] - a[1])),
  failSamples,
};
writeFileSync(join(root, 'audit-preflight-16k-result.json'), JSON.stringify(result, null, 2));
console.log('\n=== 프리플라이트 16k 실측 ===');
console.log(`총 ${LIMIT} · 통과 ${pass} (${result.passRate}) · 실패 ${fail} · 크래시 ${crash} · ${result.wallSec}s`);
console.log('실패 사유 TOP:', JSON.stringify(result.reasonCount, null, 2).slice(0, 800));
console.log('결과: audit-preflight-16k-result.json');
