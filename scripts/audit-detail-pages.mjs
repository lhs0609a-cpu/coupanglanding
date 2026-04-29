// ============================================================
// 상세페이지 전수 감사 — 16,259 카테고리 × 30상품 = 487,770건
// 중복/오염/이상 패턴을 모두 추출 (streaming)
//
// 사용: node --max-old-space-size=8192 scripts/audit-detail-pages.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const { generatePersuasionContent } = await import(
  '../.build-test/lib/megaload/services/persuasion-engine.js'
);

const SEO_DATA = JSON.parse(fs.readFileSync('src/lib/megaload/data/seo-keyword-pools.json', 'utf8'));
const CAT_POOLS = SEO_DATA.categoryPools;
const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// 16,259 카테고리 전부 — env SMOKE=1로 200카테곡, SMOKE=N으로 N카테고리만
const ALL_CATS_FULL = [];
for (const [code, v] of Object.entries(CAT_DETAILS)) {
  if (v && v.p && typeof v.p === 'string') {
    ALL_CATS_FULL.push({ code, path: v.p });
  }
}
const SMOKE = process.env.SMOKE ? parseInt(process.env.SMOKE) : 0;
const CHUNK_START = process.env.CHUNK_START ? parseInt(process.env.CHUNK_START) : 0;
const CHUNK_END = process.env.CHUNK_END ? parseInt(process.env.CHUNK_END) : ALL_CATS_FULL.length;
const STRATIFIED = process.env.STRATIFIED === '1';

// 계층화 샘플링: top 카테고리별 균등 분포 (도서만 200개 같은 편향 방지)
function stratifiedSample(allCats, totalSize) {
  const byTop = new Map();
  for (const c of allCats) {
    const top = c.path.split('>')[0];
    if (!byTop.has(top)) byTop.set(top, []);
    byTop.get(top).push(c);
  }
  const tops = [...byTop.keys()];
  const perTop = Math.ceil(totalSize / tops.length);
  const out = [];
  for (const t of tops) {
    const arr = byTop.get(t);
    const step = Math.max(1, Math.floor(arr.length / perTop));
    for (let i = 0; i < arr.length && out.length < totalSize; i += step) out.push(arr[i]);
  }
  return out.slice(0, totalSize);
}

const ALL_CATS = STRATIFIED
  ? stratifiedSample(ALL_CATS_FULL, SMOKE > 0 ? SMOKE : 500)
  : SMOKE > 0
    ? ALL_CATS_FULL.slice(0, SMOKE)
    : ALL_CATS_FULL.slice(CHUNK_START, CHUNK_END);
const CHUNK_TAG = process.env.CHUNK_TAG || (STRATIFIED ? 'stratified' : (SMOKE > 0 ? 'smoke' : (CHUNK_START > 0 || CHUNK_END < ALL_CATS_FULL.length ? `chunk-${CHUNK_START}-${CHUNK_END}` : 'full')));

const SAMPLES_PER_CAT = process.env.SAMPLES ? parseInt(process.env.SAMPLES) : 30;
const SELLER_SEED = 'audit-2026-04-28';
const TOTAL = ALL_CATS.length * SAMPLES_PER_CAT;

console.log(`상세페이지 전수 감사 시작`);
console.log(`카테고리 ${ALL_CATS.length}개 × ${SAMPLES_PER_CAT}건 = ${TOTAL.toLocaleString()}건\n`);

// ─── top별 부적합 단어 ──
const FORBIDDEN_BY_TOP = {
  '뷰티': ['강아지','고양이','사료','오메가3','쌀밥','한우','삼겹살','타이어','브레이크','노트북','자동차','김치찌개','다이어리','티셔츠','냉장고','세탁기','블록','퍼즐','카시트'],
  '식품': ['크림','에센스','세럼','토너','샴푸','립스틱','마스카라','파운데이션','강아지사료','고양이사료','기저귀','타이어','노트북','자동차','볼펜','다이어리','TV','냉장고','세탁기','블록','퍼즐'],
  '생활용품': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','블록','퍼즐','노트북','타이어','브레이크','마스카라'],
  '가전/디지털': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','마스카라'],
  '패션의류잡화': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','냉장고','세탁기','타이어','마스카라'],
  '가구/홈데코': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','타이어','브레이크','마스카라'],
  '출산/유아동': ['강아지사료','고양이사료','립스틱','마스카라','오메가3','홍삼','한우','삼겹살','타이어','브레이크','노트북','자동차','파운데이션'],
  // 스포츠/레져: 자전거 타이어는 정상 → '타이어' 제외
  '스포츠/레져': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','파운데이션','샴푸','두피','모발','마스카라'],
  '주방용품': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','파운데이션','샴푸','기저귀','타이어','마스카라'],
  // 반려: 펫 샴푸는 정상 → '샴푸' 제외. 헤어 전용 단어만 forbid
  '반려/애완용품': ['크림','에센스','립스틱','오메가3','홍삼','김치','된장','한우','파운데이션','두피','모발','기저귀','타이어','노트북','마스카라'],
  '완구/취미': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','마스카라'],
  // 자동차: 차량용 샴푸는 정상 → '샴푸' 제외. 헤어 전용 단어만 forbid
  '자동차용품': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','두피','모발','기저귀','마스카라'],
  '문구/사무': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','마스카라'],
  '문구/오피스': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','마스카라'],
  '도서': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','파운데이션','샴푸','기저귀','타이어','브레이크','마스카라'],
};

// ─── 풀 리졸버: 정확한 catPath → 상위 catPath fallback ──
function resolvePool(catPath) {
  if (CAT_POOLS[catPath]) return CAT_POOLS[catPath];
  const segs = catPath.split('>');
  for (let i = segs.length - 1; i >= 1; i--) {
    const tryPath = segs.slice(0, i).join('>');
    if (CAT_POOLS[tryPath]) return CAT_POOLS[tryPath];
  }
  // top 단계
  return CAT_POOLS[segs[0]] || CAT_POOLS['DEFAULT'] || {};
}

function genProductNames(catPath, n = SAMPLES_PER_CAT) {
  const pool = resolvePool(catPath);
  const generic = pool.generic || [];
  const ingredients = pool.ingredients || [];
  const features = pool.features || [];
  const segs = catPath.split('>');
  const lastSeg = segs[segs.length - 1];
  const brands = ['브랜드A','네이처','프리미엄','데일리','오가닉','순수','퓨어','플러스','베스트','마스터','','','',''];
  const sizes = ['100ml','200ml','300g','500g','1kg','30캡슐','60정','100매','1개입','2팩','5종세트','대용량'];

  const out = [];
  for (let i = 0; i < n; i++) {
    const ing = ingredients[i % Math.max(1, ingredients.length)] || '';
    const feat = features[i % Math.max(1, features.length)] || '';
    const size = sizes[i % sizes.length];
    const brand = brands[i % brands.length];
    const base = generic[i % Math.max(1, generic.length)] || lastSeg || '제품';
    const parts = [];
    if (brand) parts.push(brand);
    if (i % 3 === 0 && feat) parts.push(feat);
    if (i % 2 === 0 && ing) parts.push(ing);
    parts.push(base);
    if (i % 4 === 0) parts.push(size);

    // ⚠️ 변형 패턴 — 실 사용자 입력 다양성 시뮬레이션 (Phase 8 stress test)
    let name = parts.filter(Boolean).join(' ');
    const variant = i % 10;
    if (variant === 0) name = `(주)${brand || '컴퍼니'}_${name}_2024`;
    else if (variant === 1) name = `[정품][한정]${name} ★★★`;
    else if (variant === 2) name = `${name} ${name.slice(0, 10)}`; // 부분 중복
    else if (variant === 3) name = `${name} 사과 자몽 배`; // 모순 토큰
    else if (variant === 4) name = `${size} ${size} ${name}`; // 사양 중복
    else if (variant === 5) name = `${brand || '브랜드'} ${brand || '브랜드'} ${name}`; // 브랜드 중복
    else if (variant === 6) name = `${name.slice(0, 8)}…★`; // 매우 짧음
    else if (variant === 7) name = `${name} ${ing || '성분'} ${ing || '성분'} ${ing || '성분'}`; // 성분 반복
    // variant 8, 9는 정상 패턴 유지

    out.push(name);
  }
  return out;
}

function blocksToText(blocks) {
  return blocks.map(b => {
    const parts = [];
    if (b.title) parts.push(b.title);
    if (b.content) parts.push(b.content);
    if (b.subContent) parts.push(b.subContent);
    if (b.items && Array.isArray(b.items)) parts.push(...b.items);
    if (b.emphasis) parts.push(b.emphasis);
    return parts.join(' ');
  }).join(' ');
}

function tokenize(text) {
  return text.replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
}

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

function splitSentences(text) {
  return text.split(/(?<=[\.\?!。])\s+|(?<=요\.)\s*|(?<=다\.)\s*/)
    .map(s => s.trim())
    .filter(s => s.length >= 6 && s.length <= 200);
}

// ─── 글로벌 누적기 ──
const phraseFreq = new Map();    // 4-gram
const ngramFreq = new Map();     // 10-gram (긴 중복)
const sentenceFreq = new Map();  // 문장 카논
const sentenceCatMap = new Map();// 문장 → Set(top)
const fwCount = new Map();
const lengthBuckets = { '<600': 0, '600-1500': 0, '1500-3000': 0, '3000-5000': 0, '>5000': 0 };
const lengthSamples = []; // for median
const topPerCat = {};      // top별 통계
const seenFullTextHash = new Map(); // hash -> {cat, productName}

// 문제 케이스 누적 (제한된 샘플 수)
const issues = {
  unfilled_var: [],
  empty_paren: [],
  consec_space: [],
  raw_particle: [],
  forbidden_word: [],
  too_short: [],
  too_long: [],
  word_repeat_in_doc: [],
  identical_full_text: [],
  category_keyword_missing: [],
  generation_error: [],
  // SEO·품질 항목
  seo_too_short: [],          // <2000자 (쿠팡 SEO 권장 미달)
  seo_no_above_fold_kw: [],   // 첫 200자 안 카테고리 키워드 없음
  seo_low_density: [],        // 키워드 밀도 < 1%
  flow_short_sentences: [],   // 짧은 문장(5어절 미만) 비율 30%+
  flow_adjacent_dup: [],      // 인접 어절 동일 비율 5%+
  tone_mixed: [],             // ~다/~요 혼용 비율 30~70% (한쪽 일관성 무너짐)
  no_cta: [],                 // 마지막 200자 안에 행동 유도 표현 없음
  no_trust_signal: [],        // 인증/후기/추천 표현 0개
  block_missing: [],          // 핵심 블록 (hook/solution/cta) 누락
  bad_sentence_avg: [],       // 평균 어절 5 미만 또는 25 초과
};
const issueCounts = Object.fromEntries(Object.keys(issues).map(k => [k, 0]));
const SAMPLE_CAP = 80;

// 단순 djb2 해시 (텍스트 동일성용 — Map 키 비용 절감)
function hashText(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function pushIssue(type, payload) {
  issueCounts[type]++;
  if (issues[type].length < SAMPLE_CAP) issues[type].push(payload);
}

// ─── Map 크기 제어: 일정 주기로 빈도 1짜리 제거 ──
function compactMap(map, threshold = 200000) {
  if (map.size < threshold) return;
  for (const [k, v] of map) if (v <= 1) map.delete(k);
}

const HARD_LIMIT = 12_000_000; // V8 Map 한계 약 16.7M, 안전 margin

function safeMapAdd(map, key, inc = 1) {
  if (map.size >= HARD_LIMIT) {
    // 강제 컴팩션: 빈도 ≤2 제거
    for (const [k, v] of map) if (v <= 2) map.delete(k);
    if (map.size >= HARD_LIMIT) return; // 못 줄였으면 그냥 패스
  }
  map.set(key, (map.get(key) || 0) + inc);
}

const startedAt = Date.now();
let processed = 0;
let errors = 0;
let lastLogPct = -1;

for (let ci = 0; ci < ALL_CATS.length; ci++) {
  const { code, path: catPath } = ALL_CATS[ci];
  const top = catPath.split('>')[0];
  const forbidden = FORBIDDEN_BY_TOP[top] || [];
  const pool = resolvePool(catPath);
  const productNames = genProductNames(catPath);

  if (!topPerCat[top]) topPerCat[top] = { count: 0, errors: 0, totalChars: 0, contam: 0, missingKw: 0 };
  topPerCat[top].count += productNames.length;

  for (let pi = 0; pi < productNames.length; pi++) {
    processed++;
    const productName = productNames[pi];

    let result, text;
    try {
      result = generatePersuasionContent(
        productName, catPath, SELLER_SEED, pi,
        (pool.generic || []).slice(0, 3),
        code,
      );
      text = blocksToText(result.blocks);
    } catch (err) {
      errors++;
      topPerCat[top].errors++;
      pushIssue('generation_error', { cat: catPath, productName, err: String(err).slice(0, 200) });
      continue;
    }

    fwCount.set(result.framework, (fwCount.get(result.framework) || 0) + 1);
    const charCount = text.length;
    topPerCat[top].totalChars += charCount;
    if (charCount < 600) lengthBuckets['<600']++;
    else if (charCount < 1500) lengthBuckets['600-1500']++;
    else if (charCount < 3000) lengthBuckets['1500-3000']++;
    else if (charCount < 5000) lengthBuckets['3000-5000']++;
    else lengthBuckets['>5000']++;
    if (lengthSamples.length < 50000) lengthSamples.push(charCount);

    // 1) 미치환 변수
    const unfilled = text.match(/\{[^}]+\}/g);
    if (unfilled) pushIssue('unfilled_var', { cat: catPath, productName, found: unfilled.slice(0, 5), sample: text.slice(0, 200) });

    // 2) 빈 괄호
    if (/\(\s*\)|《\s*》|【\s*】|""|''/.test(text)) {
      pushIssue('empty_paren', { cat: catPath, productName, sample: text.slice(0, 200) });
    }

    // 3) 연속 공백
    if (/\s{3,}/.test(text)) {
      pushIssue('consec_space', { cat: catPath, productName, sample: text.slice(0, 200) });
    }

    // 4) raw 조사
    const partM = text.match(/(을\/를|를\/을|이\/가|가\/이|은\/는|는\/은|와\/과|과\/와|으로\/로|로\/으로)/);
    if (partM) {
      pushIssue('raw_particle', { cat: catPath, productName, found: partM[0], sample: text.slice(0, 200) });
    }

    // 5) 카테고리 부적합
    const contam = forbidden.filter(f =>
      text.includes(f) && !productName.includes(f) && !catPath.includes(f),
    );
    if (contam.length > 0) {
      topPerCat[top].contam++;
      pushIssue('forbidden_word', { cat: catPath, productName, contams: contam, sample: text.slice(0, 200) });
    }

    // 6) 길이 이상
    if (charCount < 600) pushIssue('too_short', { cat: catPath, productName, charCount });
    if (charCount > 5500) pushIssue('too_long', { cat: catPath, productName, charCount });

    // 7) 한 글 안 의미 단어 7회+ 반복 (한국어 함수어/조사어미 제외)
    //   "있습니다", "있어요", "입니다" 같은 stop-word는 자연스러운 한국어 빈도 단어라
    //   실제 saturation이 아니므로 측정에서 제외해야 false positive 방지.
    const STOP_WORDS = new Set([
      '있습니다', '있어요', '있는데', '있어서', '있고', '있는', '있을', '있다',
      '입니다', '예요', '에요', '이에요', '이라면', '이라', '이며',
      '됩니다', '돼요', '되요', '되는', '될', '되면', '되어',
      '합니다', '해요', '하는', '하고', '하면', '한다', '했어요', '했습니다',
      '제품', '상품', '제품입니다', '제품이에요', '제품이', '상품이',
      '품질', '품질입니다', '품질이에요', '품질이',
      '들이는', '들이고', '들이면', '들여',
      '좋은', '좋아요', '좋습니다', '좋게', '좋은데',
      '많아요', '많은', '많습니다', '많이',
      '필요한', '필요해', '필요합니다', '필요',
      '사용', '사용해', '사용하', '사용시',
      '분이라면', '분께', '분에게', '분도', '분들', '분들도', '분들이',
      '느낌이', '느낌이에요', '느낌입니다',
      // 한국어 추천/리뷰 텍스트 고빈도 함수어
      '이유가', '이유로', '이유는', '이유예요', '이유입니다',
      '차이를', '차이가', '차이는', '차이입니다', '차이도',
      '만족도가', '만족도', '만족도는', '만족이', '만족도까지',
      '꾸준히', '꾸준한', '꾸준해', '꾸준함이',
      '분야', '분야의', '분야에', '분야에서', '분야가',
      '부분', '부분이', '부분도', '부분에', '부분은',
      '카테고리', '카테고리에서', '카테고리가', '카테고리의',
      '검색', '검색해', '검색하', '검색시',
      '직접', '실제로', '진짜', '정말', '솔직히',
      '평이', '평가', '평가가', '평가도',
      '구매', '구매해', '구매시', '구매를',
      '리뷰', '리뷰가', '후기', '후기가',
      '시점', '시점에', '시점이', '시점입니다',
      // Phase 9: 페이지 길이 증가 후 추가로 발견된 함수어
      '다릅니다', '다른', '다른데', '다르게',
      '변화를', '변화가', '변화도', '변화는', '변화로',
      '경험해보세요', '경험을', '경험이', '경험은',
      '만합니다', '만한', '만하다', '만하게',
      '성능을', '성능이', '성능은', '성능도',
      '보입니다', '보이는', '보이고',
      '일상에서', '일상의', '일상이', '일상도', '일상에', '일상을', '일상이라',
      '안전하고', '안전한', '안전하게', '안전성',
      '자세히', '자연스럽게', '자연스러운',
      '가치가', '가치를', '가치는', '가치도',
      '매일의', '매일', '매일매일',
      '신뢰할', '신뢰가', '신뢰성', '신뢰도',
      '이어집니다', '이어지는', '이어가',
      '조용히', '꾸밈없는', '담백한',
      '프리미엄', // 상품 수식어 — 모든 카테고리 자연 등장
    ]);
    const tokens = tokenize(text);
    const tCnt = new Map();
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (/[A-Za-z0-9]/.test(t)) continue;
      if (STOP_WORDS.has(t)) continue;
      tCnt.set(t, (tCnt.get(t) || 0) + 1);
    }
    const heavy = [];
    for (const [w, c] of tCnt) {
      if (c >= 7 && !productName.includes(w)) heavy.push([w, c]);
    }
    if (heavy.length > 0) {
      pushIssue('word_repeat_in_doc', {
        cat: catPath, productName,
        words: heavy.slice(0, 5).map(([w, c]) => `${w}×${c}`),
      });
    }

    // 8) 카테고리 키워드 미포함
    const hasCatKw = (pool.generic || []).some(g => text.includes(g));
    if (!hasCatKw) {
      topPerCat[top].missingKw++;
      pushIssue('category_keyword_missing', { cat: catPath, productName, sample: text.slice(0, 180) });
    }

    // 9) 본문 완전 일치
    const fh = hashText(text);
    if (seenFullTextHash.has(fh)) {
      const prev = seenFullTextHash.get(fh);
      pushIssue('identical_full_text', {
        prev: { cat: prev.cat, productName: prev.productName },
        cur: { cat: catPath, productName },
      });
    } else {
      seenFullTextHash.set(fh, { cat: catPath, productName });
    }

    // ─── SEO·품질 측정 ──────────────────────────────────

    // S1) 글 길이 (쿠팡 SEO 권장 2000-3000자)
    if (charCount < 2000) pushIssue('seo_too_short', { cat: catPath, productName, charCount });

    // S2) 첫 200자 안 카테고리 키워드 등장 (above-the-fold)
    const aboveFold = text.slice(0, 200);
    const hasAboveFoldKw = (pool.generic || []).some(g => aboveFold.includes(g));
    if (!hasAboveFoldKw && (pool.generic || []).length > 0) {
      pushIssue('seo_no_above_fold_kw', { cat: catPath, productName, sample: aboveFold });
    }

    // S3) 키워드 밀도 — 카테고리 generic 중 본문에 가장 많이 등장하는 단어 빈도
    let kwTotalCount = 0;
    for (const g of (pool.generic || [])) {
      if (g.length < 2) continue;
      const re = new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      kwTotalCount += (text.match(re) || []).length;
    }
    const wordsCount = tokens.length;
    const density = wordsCount > 0 ? (kwTotalCount / wordsCount) : 0;
    if (density < 0.01 && (pool.generic || []).length > 0) {
      pushIssue('seo_low_density', { cat: catPath, productName, kwCount: kwTotalCount, words: wordsCount, density: density.toFixed(3) });
    }

    // F1) 문장 길이 분포 (어절 기준)
    const sentencesForFlow = splitSentences(text);
    const sentTokens = sentencesForFlow.map(s => s.split(/\s+/).filter(Boolean).length);
    const shortSents = sentTokens.filter(n => n < 5).length;
    const shortRatio = sentTokens.length > 0 ? shortSents / sentTokens.length : 0;
    if (shortRatio > 0.3 && sentTokens.length >= 10) {
      pushIssue('flow_short_sentences', { cat: catPath, productName, ratio: shortRatio.toFixed(2), short: shortSents, total: sentTokens.length });
    }
    const avgWordsPerSent = sentTokens.length > 0 ? (sentTokens.reduce((a, b) => a + b, 0) / sentTokens.length) : 0;
    if (avgWordsPerSent > 0 && (avgWordsPerSent < 5 || avgWordsPerSent > 25)) {
      pushIssue('bad_sentence_avg', { cat: catPath, productName, avg: avgWordsPerSent.toFixed(1) });
    }

    // F2) 인접 어절 동일 비율 (n과 n+1번째 어절이 같은 단어)
    let adjDup = 0;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i] === tokens[i - 1] && tokens[i].length >= 2) adjDup++;
    }
    const adjRatio = tokens.length > 0 ? adjDup / tokens.length : 0;
    if (adjRatio > 0.05) {
      pushIssue('flow_adjacent_dup', { cat: catPath, productName, ratio: adjRatio.toFixed(3), count: adjDup });
    }

    // T1) 어미 일관성 — ~다 vs ~요 비율
    const formal = (text.match(/[가-힣](다|입니다|습니다|입니까|됩니다)[\s.!?。]/g) || []).length;
    const casual = (text.match(/[가-힣](요|어요|아요|에요|예요|네요|군요|죠)[\s.!?。]/g) || []).length;
    const tonalTotal = formal + casual;
    if (tonalTotal >= 8) {
      const formalRatio = formal / tonalTotal;
      // 30~70% 사이면 혼용 (한쪽으로 일관성 무너짐)
      if (formalRatio > 0.3 && formalRatio < 0.7) {
        pushIssue('tone_mixed', { cat: catPath, productName, formal, casual, formalRatio: formalRatio.toFixed(2) });
      }
    }

    // C1) CTA — 마지막 200자 안에 행동 유도 표현
    // Phase 9: 패턴 확장 — "담아두세요/받아보실/마무리하시기/추천/시점/주문" 등 정상 CTA 인식
    const tail = text.slice(-200);
    const hasCta = /(보세요|살펴보|챙겨|시작|기회|선택|드립니다|드려요|골라보|만나|경험|확인|구매|들여|담아|받아보|마무리|주문|준비|결정|검토|골라|추천드|권합|시도|찾는|들이는|들이실)/.test(tail);
    if (!hasCta) {
      pushIssue('no_cta', { cat: catPath, productName, tail });
    }

    // C2) 신뢰 신호 — 인증/후기/추천 표현
    const trust = (text.match(/(인증|HACCP|GMP|KC|FDA|CE|ISO|등급|특허|임상|시험|검사|후기|리뷰|평가|만족|추천|재구매|베스트)/g) || []).length;
    if (trust === 0) {
      pushIssue('no_trust_signal', { cat: catPath, productName, sample: text.slice(0, 200) });
    }

    // B1) 블록 시퀀스 핵심 (hook/solution/cta)
    const blockTypes = result.blocks.map(b => b.type);
    const hasCore = blockTypes.includes('hook') && blockTypes.includes('solution') && blockTypes.includes('cta');
    if (!hasCore) {
      pushIssue('block_missing', { cat: catPath, productName, blocks: blockTypes });
    }

    // 글로벌 빈도 (safeMapAdd로 hard limit 보호)
    const phrases = ngrams(tokens, 4);
    for (const p of phrases) safeMapAdd(phraseFreq, p);
    const longGrams = ngrams(tokens, 10);
    for (const p of longGrams) safeMapAdd(ngramFreq, p);

    const sentences = sentencesForFlow;
    const canonName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reName = canonName ? new RegExp(canonName, 'g') : null;
    for (const s of sentences) {
      const canon = reName ? s.replace(reName, '{P}') : s;
      safeMapAdd(sentenceFreq, canon);
      if (sentenceCatMap.size < HARD_LIMIT) {
        let topSet = sentenceCatMap.get(canon);
        if (!topSet) { topSet = new Set(); sentenceCatMap.set(canon, topSet); }
        topSet.add(top);
      }
    }
  }

  // 진행률
  const pct = Math.floor(((ci + 1) / ALL_CATS.length) * 100);
  if (pct !== lastLogPct && pct % 5 === 0) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    const rate = (processed / parseFloat(elapsed)).toFixed(0);
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`  ${pct}% (${ci + 1}/${ALL_CATS.length} cat, ${processed.toLocaleString()}건 / 오류 ${errors}, ${rate}/s, mem ${memMB}MB, sentMap ${sentenceFreq.size.toLocaleString()})`);
    lastLogPct = pct;
  }

  // 메모리 컴팩션 — 시드 다양성 폭증으로 인한 Map 폭주 방지
  if (ci > 0 && ci % 800 === 0) {
    const before = phraseFreq.size + ngramFreq.size + sentenceFreq.size;
    compactMap(phraseFreq, 1_000_000);
    compactMap(ngramFreq, 2_000_000);
    compactMap(sentenceFreq, 1_500_000);
    if (sentenceCatMap.size > 2_000_000) {
      // canon 문장도 빈도 1짜리 제거
      for (const [k, set] of sentenceCatMap) if (set.size <= 1) sentenceCatMap.delete(k);
    }
    const after = phraseFreq.size + ngramFreq.size + sentenceFreq.size;
    if (before !== after) {
      console.log(`    [compact] ${before.toLocaleString()} → ${after.toLocaleString()}`);
    }
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n생성 완료 — ${processed.toLocaleString()}건 (오류 ${errors}), ${elapsed}s\n`);

// ─── 분석 ──
const fwTotal = processed - errors;
const fwTop = [...fwCount.entries()].sort((a, b) => b[1] - a[1]);

const topPhrases = [...phraseFreq.entries()]
  .filter(([, c]) => c >= 5000)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 100);

const topNgrams = [...ngramFreq.entries()]
  .filter(([, c]) => c >= 30)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 200);

const topSentences = [...sentenceFreq.entries()]
  .filter(([, c]) => c >= 30)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 200);

const crossTopSentences = [...sentenceCatMap.entries()]
  .filter(([, tops]) => tops.size >= 5)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 100);

lengthSamples.sort((a, b) => a - b);
const median = lengthSamples[Math.floor(lengthSamples.length / 2)] || 0;
const p10 = lengthSamples[Math.floor(lengthSamples.length * 0.1)] || 0;
const p90 = lengthSamples[Math.floor(lengthSamples.length * 0.9)] || 0;
const avgLen = lengthSamples.length ? Math.round(lengthSamples.reduce((a, b) => a + b, 0) / lengthSamples.length) : 0;

// ─── 콘솔 출력 ──
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('상세페이지 전수 감사 결과');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`총 생성: ${processed.toLocaleString()}건 (오류 ${errors})`);
console.log(`길이 (자): 평균 ${avgLen} / 중앙값 ${median} / p10-p90 ${p10}-${p90}`);
console.log(`길이 분포: <600=${lengthBuckets['<600']}, 600-1500=${lengthBuckets['600-1500']}, 1500-3000=${lengthBuckets['1500-3000']}, 3000-5000=${lengthBuckets['3000-5000']}, >5000=${lengthBuckets['>5000']}`);

console.log(`\n[A] 미치환 변수:           ${issueCounts.unfilled_var.toLocaleString()}건 (${(issueCounts.unfilled_var/fwTotal*100).toFixed(2)}%)`);
console.log(`[B] 빈 괄호/따옴표:        ${issueCounts.empty_paren.toLocaleString()}건 (${(issueCounts.empty_paren/fwTotal*100).toFixed(2)}%)`);
console.log(`[C] 연속 공백 3+:          ${issueCounts.consec_space.toLocaleString()}건 (${(issueCounts.consec_space/fwTotal*100).toFixed(2)}%)`);
console.log(`[D] raw 조사 표기:         ${issueCounts.raw_particle.toLocaleString()}건 (${(issueCounts.raw_particle/fwTotal*100).toFixed(2)}%)`);
console.log(`[E] 카테고리 부적합 단어:  ${issueCounts.forbidden_word.toLocaleString()}건 (${(issueCounts.forbidden_word/fwTotal*100).toFixed(2)}%)`);
console.log(`[F] 너무 짧음 (<600):      ${issueCounts.too_short.toLocaleString()}건`);
console.log(`[G] 너무 김 (>5500):       ${issueCounts.too_long.toLocaleString()}건`);
console.log(`[H] 한 글 단어 7+회 반복: ${issueCounts.word_repeat_in_doc.toLocaleString()}건 (${(issueCounts.word_repeat_in_doc/fwTotal*100).toFixed(2)}%)`);
console.log(`[I] 본문 완전 일치 쌍:     ${issueCounts.identical_full_text.toLocaleString()}건`);
console.log(`[J] 카테고리 키워드 없음: ${issueCounts.category_keyword_missing.toLocaleString()}건 (${(issueCounts.category_keyword_missing/fwTotal*100).toFixed(2)}%)`);
console.log(`[X] 생성 오류:             ${issueCounts.generation_error.toLocaleString()}건`);

console.log(`\n━━ SEO·품질 측정 ━━`);
console.log(`[S1] <2000자 (SEO 미달):        ${issueCounts.seo_too_short.toLocaleString()}건 (${(issueCounts.seo_too_short/fwTotal*100).toFixed(2)}%)`);
console.log(`[S2] 첫 200자 안 키워드 없음:  ${issueCounts.seo_no_above_fold_kw.toLocaleString()}건 (${(issueCounts.seo_no_above_fold_kw/fwTotal*100).toFixed(2)}%)`);
console.log(`[S3] 키워드 밀도 <1%:           ${issueCounts.seo_low_density.toLocaleString()}건 (${(issueCounts.seo_low_density/fwTotal*100).toFixed(2)}%)`);
console.log(`[F1] 짧은 문장 비율 30%+:      ${issueCounts.flow_short_sentences.toLocaleString()}건 (${(issueCounts.flow_short_sentences/fwTotal*100).toFixed(2)}%)`);
console.log(`[F2] 인접 어절 동일 5%+:       ${issueCounts.flow_adjacent_dup.toLocaleString()}건 (${(issueCounts.flow_adjacent_dup/fwTotal*100).toFixed(2)}%)`);
console.log(`[F3] 평균 어절 5미만/25초과:    ${issueCounts.bad_sentence_avg.toLocaleString()}건 (${(issueCounts.bad_sentence_avg/fwTotal*100).toFixed(2)}%)`);
console.log(`[T1] 어미 혼용 (~다/~요):      ${issueCounts.tone_mixed.toLocaleString()}건 (${(issueCounts.tone_mixed/fwTotal*100).toFixed(2)}%)`);
console.log(`[C1] CTA 부재 (마지막 200자): ${issueCounts.no_cta.toLocaleString()}건 (${(issueCounts.no_cta/fwTotal*100).toFixed(2)}%)`);
console.log(`[C2] 신뢰 신호 0개:             ${issueCounts.no_trust_signal.toLocaleString()}건 (${(issueCounts.no_trust_signal/fwTotal*100).toFixed(2)}%)`);
console.log(`[B1] 핵심 블록(hook+sol+cta) 누락: ${issueCounts.block_missing.toLocaleString()}건 (${(issueCounts.block_missing/fwTotal*100).toFixed(2)}%)`);

console.log('\n[K] 프레임워크 분포:');
for (const [fw, n] of fwTop) {
  console.log(`    ${fw.padEnd(20)} ${n.toLocaleString()}건 (${((n/fwTotal)*100).toFixed(1)}%)`);
}

console.log('\n[L] top별 오염/미포함 통계:');
for (const [tp, st] of Object.entries(topPerCat)) {
  console.log(`    ${tp.padEnd(20)} ${st.count.toLocaleString()}건 / 오염 ${st.contam.toLocaleString()} (${(st.contam/st.count*100).toFixed(2)}%) / 키워드없음 ${st.missingKw.toLocaleString()} (${(st.missingKw/st.count*100).toFixed(2)}%) / 평균 ${Math.round(st.totalChars/st.count)}자`);
}

console.log(`\n[M] Top 30 같은 문장 반복:`);
for (let i = 0; i < Math.min(30, topSentences.length); i++) {
  const [s, c] = topSentences[i];
  console.log(`    ${String(c).padStart(6)}회: "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}"`);
}

console.log(`\n[N] Top 20 같은 10어절 반복 (긴 구간 동일 등장):`);
for (let i = 0; i < Math.min(20, topNgrams.length); i++) {
  const [p, c] = topNgrams[i];
  console.log(`    ${String(c).padStart(6)}회: "${p.slice(0, 90)}${p.length > 90 ? '…' : ''}"`);
}

console.log(`\n[O] 5개+ top에 동일 등장하는 문장:`);
for (let i = 0; i < Math.min(20, crossTopSentences.length); i++) {
  const [s, tops] = crossTopSentences[i];
  console.log(`    ${tops.size}top: "${s.slice(0, 80)}${s.length > 80 ? '…' : ''}" → ${[...tops].slice(0,6).join(',')}`);
}

// ─── 저장 ──
const reportDir = 'scripts/verification-reports';
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');

const jsonPath = path.join(reportDir, `audit-detail-${CHUNK_TAG}-${ts}.json`);
fs.writeFileSync(jsonPath, JSON.stringify({
  meta: {
    totalGenerated: processed,
    errors,
    elapsedSec: parseFloat(elapsed),
    avgLen, median, p10, p90,
    lengthBuckets,
  },
  counts: issueCounts,
  framework: Object.fromEntries(fwTop),
  topPerCat,
  topPhrases,
  topNgrams,
  topSentences,
  crossTopSentences: crossTopSentences.map(([s, tops]) => ({ sentence: s, tops: [...tops] })),
  issuesSamples: issues,
}, null, 2), 'utf8');
console.log(`\n저장: ${jsonPath}`);

const mdPath = path.join(reportDir, `audit-detail-${CHUNK_TAG}-${ts}.md`);
const md = [];
md.push(`# 상세페이지 감사 — 16,259 카테고리 × 30상품 = ${processed.toLocaleString()}건`);
md.push(`소요 ${elapsed}s, 오류 ${errors}건`);
md.push(``);
md.push(`## 길이`);
md.push(`평균 **${avgLen}**자 · 중앙값 ${median} · p10 ${p10} · p90 ${p90}`);
md.push(`- <600자: ${lengthBuckets['<600'].toLocaleString()}`);
md.push(`- 600-1500: ${lengthBuckets['600-1500'].toLocaleString()}`);
md.push(`- 1500-3000: ${lengthBuckets['1500-3000'].toLocaleString()}`);
md.push(`- 3000-5000: ${lengthBuckets['3000-5000'].toLocaleString()}`);
md.push(`- >5000: ${lengthBuckets['>5000'].toLocaleString()}`);
md.push(``);
md.push(`## 문제 발생 건수`);
md.push(`| 코드 | 문제 | 건수 | 비율 |`);
md.push(`|----|----|----:|----:|`);
const order = [
  ['unfilled_var', '미치환 변수 {xxx}'],
  ['empty_paren', '빈 괄호/따옴표'],
  ['consec_space', '연속 공백 3+'],
  ['raw_particle', 'raw 조사 표기'],
  ['forbidden_word', '카테고리 부적합 단어 (오염)'],
  ['too_short', '<600자'],
  ['too_long', '>5500자'],
  ['word_repeat_in_doc', '한 글에 단어 7회+'],
  ['identical_full_text', '본문 완전 일치 쌍'],
  ['category_keyword_missing', '카테고리 키워드 없음'],
  ['generation_error', '생성 오류'],
];
for (const [k, label] of order) {
  const n = issueCounts[k];
  md.push(`| ${k} | ${label} | ${n.toLocaleString()} | ${(n/fwTotal*100).toFixed(2)}% |`);
}

md.push(``);
md.push(`## 프레임워크 분포`);
for (const [fw, n] of fwTop) {
  md.push(`- ${fw}: ${n.toLocaleString()} (${(n/fwTotal*100).toFixed(1)}%)`);
}

md.push(``);
md.push(`## top별 통계`);
md.push(`| top | 생성 | 오염 | 비율 | 키워드없음 | 비율 | 평균자 |`);
md.push(`|----|---:|---:|---:|---:|---:|---:|`);
for (const [tp, st] of Object.entries(topPerCat)) {
  md.push(`| ${tp} | ${st.count.toLocaleString()} | ${st.contam.toLocaleString()} | ${(st.contam/st.count*100).toFixed(2)}% | ${st.missingKw.toLocaleString()} | ${(st.missingKw/st.count*100).toFixed(2)}% | ${Math.round(st.totalChars/st.count)} |`);
}

md.push(``);
md.push(`## 같은 문장이 반복 (Top 50, 30회+)`);
md.push(`| 횟수 | 문장 |`);
md.push(`|---:|----|`);
for (const [s, c] of topSentences.slice(0, 50)) {
  md.push(`| ${c.toLocaleString()} | ${s.slice(0, 220).replace(/\|/g, '\\|')} |`);
}

md.push(``);
md.push(`## 같은 10어절 구간 반복 (Top 50, 30회+)`);
md.push(`| 횟수 | 10어절 |`);
md.push(`|---:|----|`);
for (const [p, c] of topNgrams.slice(0, 50)) {
  md.push(`| ${c.toLocaleString()} | ${p.slice(0, 220).replace(/\|/g, '\\|')} |`);
}

md.push(``);
md.push(`## Top 5+ 카테고리에 동일 등장하는 문장`);
md.push(`| top수 | 문장 | 등장 top |`);
md.push(`|---:|----|----|`);
for (const [s, tops] of crossTopSentences.slice(0, 50)) {
  md.push(`| ${tops.size} | ${s.slice(0, 180).replace(/\|/g, '\\|')} | ${[...tops].slice(0, 8).join(', ')} |`);
}

md.push(``);
md.push(`## 카테고리 부적합 단어 샘플 (최대 ${SAMPLE_CAP}건)`);
for (const c of issues.forbidden_word) {
  md.push(`- **[${c.cat}]** "${c.productName}" — 부적합: ${c.contams.join(', ')}`);
}

md.push(``);
md.push(`## 미치환 변수 샘플`);
for (const c of issues.unfilled_var) {
  md.push(`- **[${c.cat}]** "${c.productName}" — ${c.found.join(', ')}`);
}

md.push(``);
md.push(`## 한 글에 단어 7회+ 반복 샘플`);
for (const c of issues.word_repeat_in_doc) {
  md.push(`- **[${c.cat}]** "${c.productName}" — ${c.words.join(', ')}`);
}

md.push(``);
md.push(`## 본문 완전 일치 쌍 샘플`);
for (const d of issues.identical_full_text) {
  md.push(`- [${d.prev.cat}] "${d.prev.productName}" ≡ [${d.cur.cat}] "${d.cur.productName}"`);
}

fs.writeFileSync(mdPath, md.join('\n'), 'utf8');
console.log(`저장: ${mdPath}`);
