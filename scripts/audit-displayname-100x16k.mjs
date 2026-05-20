// ─────────────────────────────────────────────────────────────────────────────
// 실측: 16,259 카테고리 × 100 서로 다른 상품명 → 노출상품명(displayName) 도메인 적합성
//
// 사과(신선식품)에 "단백질/무첨가/담백한/봉지/신상/저탄소" 가 섞이던 문제가
// 다른 카테고리에도 있는지 전수 검증.
//
// 생성: 카테고리당 100개 서로 다른 상품명 (leaf + 랜덤 수식어, 30%는 타도메인 노이즈 주입)
//   → generateDisplayName (프로덕션) → 출력 검사
// 검출:
//   D_CROSSCAT : detectCrossCategory — 타 도메인 토큰 누출(영양제/콜라겐/노트북/강아지 등)
//   D_FRESH    : 신선식품 카테고리에 가공/건강/마케팅 descriptor (단백질/무첨가/담백한/봉지/신상/저탄소…)
//   D_LEAF     : 카테고리 정체성(leaf) 토큰이 노출명에 없음
//   D_EMPTY    : 노출명 비거나 과소
//   D_CRASH    : 생성 예외
//
// 실행: SHARDS=6 SHARD=0 node scripts/audit-displayname-100x16k.mjs  (LIMIT=200 스모크)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const dn = await jiti.import('../src/lib/megaload/services/display-name-generator.ts');
const guard = await jiti.import('../src/lib/megaload/services/cross-category-guard.ts');

const SHARDS = parseInt(process.env.SHARDS || '1', 10);
const SHARD = parseInt(process.env.SHARD || '0', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const NAMES_PER_CAT = parseInt(process.env.VARIANTS || '100', 10);

const details = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json'), 'utf-8'));
const codes = Object.keys(details);

function makeRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

// 신선식품 부적합 descriptor — display-name-generator 의 FRESH_PRODUCE_FORBIDDEN_DESCRIPTORS 와 동일
const FRESH_BAD = new Set([
  '단백질', '고단백', '단백질보충', '식이섬유', '저칼로리', '다이어트', '키토제닉', '저탄수', '고지방', '글루텐프리', '비건', '저당',
  '무첨가', '무방부제', '무색소', '무설탕', '무가당', 'msg무첨가',
  '담백한', '깊은맛',
  '봉지', '신상', '신상품', '인기상품', '추천상품', '저탄소',
  '찌개', '탕', '볶음', '조림', '구이', '튀김', '즉석', '전자레인지', '에어프라이어', '안주', '술안주', '밥반찬', '국물', '야식',
]);
function isFreshProduce(p) {
  if (!p) return false;
  if (/신선식품|농산물|축산물|수산물/.test(p)) return true;
  if (/가공식품|가공\/즉석|건강식품|음료|커피|차|디저트|아이스크림|스낵|간식|소스|조미료|전통주/.test(p)) return false;
  return p.split('>').some(s => /^(과일류?|채소류?|정육|계란|쌀\/잡곡|잡곡|버섯|나물)$/.test(s.trim()));
}
// 범용 스팸 필러/포럼 노이즈
const FLUFF = new Set(['상품', '신상', '신상품', '인기상품', '추천상품', '베스트상품', '히트상품', '뽐뿌', '뽐뿌휴대폰', '컴퓨터존', '뽐뿌폰']);
// 반려 비식품에 사료/영양 descriptor
const PET_FOOD = new Set(['영양균형', '기호성', '관절건강', '장건강', '체중관리', '모질개선', '모질관리', '피모건강', '무항생제', '소화흡수', '눈물자국', '면역균형', '영양간식', '식이관리', '사료']);
function isPetNonFood(p) { return /반려|애완|강아지|고양이/.test(p) && !/사료|간식|영양제|먹이|트릿|육포|껌/.test(p); }
// 향수에 스킨케어 효능어
const SKINCARE = new Set(['주름개선', '주름', '모공', '모공축소', '각질', '각질제거', '리프팅', '탄력', '미백', '알부틴', '판테놀', 'pha', 'aha', 'bha', '약산성', '재생', '진정', '고보습', '보습', '수분공급', '피부장벽']);
function isFragrance(p) { return /향수|퍼퓸|오드|디퓨저|방향제|룸스프레이/.test(p); }

// 일반 수식어 (도메인 중립 — 노이즈)
const NEUTRAL = ['', '', '프리미엄', '고급', '인기', '정품', '신상', '국내산', '가성비', '베스트', '대용량', '미니', '실속'];
const BRANDS = ['', '', '메가로드', '코멤버스', '오가닉', '데일리'];
// 타 도메인 유혹 토큰 — 필터가 제거하는지 테스트 (30% 케이스에 1개 주입)
const CROSS_NOISE = ['영양제', '프로틴', '루테인', '콜라겐', '노트북', '강아지', '세차', '발수코팅', '비타민', '캡슐', '김치', '한우', '면역', '다이어트'];

function genName(rng, leaf, injectCross) {
  const parts = [pick(rng, NEUTRAL), pick(rng, BRANDS), leaf, pick(rng, NEUTRAL)];
  if (injectCross) parts.splice(2 + Math.floor(rng() * 2), 0, pick(rng, CROSS_NOISE));
  // 약간의 spec
  if (rng() < 0.5) parts.push(`${1 + Math.floor(rng() * 20)}${pick(rng, ['개', 'kg', 'ml', 'g', '팩'])}`);
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

const stats = {
  cats: 0, calls: 0, freshCats: 0, freshCalls: 0,
  D: { CROSSCAT: 0, FRESH: 0, FLUFF: 0, PET: 0, FRAGRANCE: 0, LEAF: 0, EMPTY: 0, CRASH: 0 },
  failCats: {}, samples: {}, crossTokens: {}, freshTokens: {},
};
for (const k of Object.keys(stats.D)) { stats.failCats[k] = new Set(); stats.samples[k] = []; }
function fail(k, s) { stats.D[k]++; stats.failCats[k].add(s.code); if (stats.samples[k].length < 40) stats.samples[k].push(s); }

function leafIdent(path) {
  const leafRaw = path.split('>').pop()?.trim() || '';
  const tok = leafRaw.split(/[\s/,()\[\]]+/).filter(t => t.length >= 2)[0] || '';
  return tok.replace(/^(여성|남성|키즈|아동|유아|어른|성인)/, '').trim();
}

async function run() {
  const t0 = Date.now();
  let cats = codes.filter((_, i) => i % SHARDS === SHARD);
  if (LIMIT > 0) cats = cats.slice(0, LIMIT);
  console.log(`[shard ${SHARD}/${SHARDS}] ${cats.length} cats × ${NAMES_PER_CAT}`);

  for (let ci = 0; ci < cats.length; ci++) {
    const code = cats[ci];
    const path = details[code]?.p;
    if (!path) continue;
    const leaf = path.split('>').pop() || '';
    const leafTok = leafIdent(path);
    const fresh = isFreshProduce(path);
    stats.cats++; if (fresh) stats.freshCats++;
    const rng = makeRng((parseInt(code, 10) || ci) + 2654435761);
    const seen = new Set();

    for (let k = 0; k < NAMES_PER_CAT; k++) {
      // 서로 다른 이름 보장
      let name, tries = 0;
      do { name = genName(rng, leaf, k % 10 < 3); tries++; } while (seen.has(name) && tries < 5);
      seen.add(name);
      stats.calls++; if (fresh) stats.freshCalls++;

      let dispName;
      try { dispName = dn.generateDisplayName(name, pick(rng, BRANDS) || '브랜드', path, `seller_${SHARD}`, k); }
      catch (e) { fail('CRASH', { code, leaf, name, err: String(e.message || e).slice(0, 150) }); continue; }

      if (!dispName || dispName.trim().length < 2) { fail('EMPTY', { code, leaf, name, disp: dispName }); continue; }

      // D_CROSSCAT — 타 도메인 토큰 누출 (단, 카테고리 자기이름 토큰은 거짓양성이므로 제외)
      const pathNorm = path.replace(/[\s/]/g, '');
      const cc = guard.detectCrossCategory(dispName, path).filter(t => !pathNorm.includes(t));
      if (cc.length > 0) {
        for (const t of cc) stats.crossTokens[t] = (stats.crossTokens[t] || 0) + 1;
        fail('CROSSCAT', { code, leaf, path, name, disp: dispName, tokens: [...new Set(cc)].slice(0, 6) });
      }

      const toksLower = dispName.split(/[\s/]+/).map(t => t.toLowerCase());
      // D_FLUFF — 범용 스팸 필러/포럼 노이즈 (전 카테고리)
      {
        const bad = [...new Set(toksLower.filter(t => FLUFF.has(t)))];
        if (bad.length) fail('FLUFF', { code, leaf, path, name, disp: dispName, bad });
      }
      // D_PET — 반려 비식품에 사료/영양 descriptor
      if (isPetNonFood(path)) {
        const bad = [...new Set(toksLower.filter(t => PET_FOOD.has(t)))];
        if (bad.length) fail('PET', { code, leaf, path, name, disp: dispName, bad });
      }
      // D_FRAGRANCE — 향수에 스킨케어 효능어
      if (isFragrance(path)) {
        const bad = [...new Set(toksLower.filter(t => SKINCARE.has(t)))];
        if (bad.length) fail('FRAGRANCE', { code, leaf, path, name, disp: dispName, bad });
      }

      // D_FRESH — 신선식품 부적합 descriptor
      if (fresh) {
        const toks = dispName.split(/[\s/]+/).map(t => t.toLowerCase());
        const bad = [...new Set(toks.filter(t => FRESH_BAD.has(t)))];
        if (bad.length > 0) {
          for (const t of bad) stats.freshTokens[t] = (stats.freshTokens[t] || 0) + 1;
          fail('FRESH', { code, leaf, path, name, disp: dispName, bad });
        }
      }

      // D_LEAF — 정체성 토큰 부재 (숫자/영문/특수 포함 leaf 는 토큰화 노이즈라 제외, 순한글만 검증)
      if (leafTok && leafTok.length >= 2 && !/[0-9A-Za-z\-]/.test(leafTok) && !dispName.includes(leafTok)) {
        fail('LEAF', { code, leaf, leafTok, name, disp: dispName });
      }
    }

    if ((ci + 1) % 1000 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const d = stats.D;
      console.log(`[shard ${SHARD}] ${ci + 1}/${cats.length} ${el}s | calls=${stats.calls} xcat=${d.CROSSCAT} fresh=${d.FRESH} leaf=${d.LEAF} empty=${d.EMPTY} crash=${d.CRASH}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const out = {
    shard: SHARD, shards: SHARDS, elapsedSec: +elapsed,
    cats: stats.cats, calls: stats.calls, freshCats: stats.freshCats, freshCalls: stats.freshCalls,
    defects: stats.D,
    failCats: Object.fromEntries(Object.entries(stats.failCats).map(([k, v]) => [k, v.size])),
    topCrossTokens: top(stats.crossTokens, 30), topFreshTokens: top(stats.freshTokens, 30),
    samples: stats.samples,
  };
  const fn = `audit-dispname-shard${SHARD}-of-${SHARDS}.json`;
  writeFileSync(fn, JSON.stringify(out, null, 2));
  console.log(`\n[shard ${SHARD}] done ${elapsed}s → ${fn}`);
  console.log(`  calls=${stats.calls} fresh=${stats.freshCalls} | ` + Object.entries(stats.D).map(([k, v]) => `${k}=${v}`).join(' '));
}
run();
