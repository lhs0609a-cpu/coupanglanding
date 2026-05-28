#!/usr/bin/env node
// ============================================================
// 100×16k Comprehensive Audit — 1.6M generations
// ============================================================
// 검증 차원 (한 패스에 모두 측정):
//   A. 디스플레이명 SEO     : 길이/금지어/스터핑/leaf 포함/연예인/특수문자
//   B. 본문 정체성 오염    : cross-cat 시그니처 토큰 누출 (식품/뷰티/가전/패션 등)
//   C. 보충제 누출         : 프로틴/BCAA/오메가3 등 헬스 토큰 누출
//   D. 정체성 붕괴         : leaf 토큰이 본문에 0회 (카테고리 부재)
//   E. 동사 부조화         : 카테고리 부적합 동사 (식품 카테고리에 "익히다" 등)
//   F. 톤 혼재             : 친근체/격식체/광고체 60% 미만 도미넌트
//   G. 반복 문장           : 동일 문장 ≥2회 / n-gram 3회 이상
//   H. 이상한 단어         : 한글 자모 단독, 깨진 글자, 빈도 낮은 잡음
//   I. 글 길이 최적화      : 너무 짧음(<800) / 너무 김(>5000) / 문단 수 비정상
// ============================================================
import fs from 'node:fs';

const PE = await import('../.build-test/lib/megaload/services/persuasion-engine.js');
const GEN = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const RR = await import('../.build-test/lib/megaload/services/real-review-composer.js');
const { generatePersuasionContent, contentBlocksToParagraphs } = PE;
const { generateDisplayName } = GEN;
const { generateRealReview } = RR;

const CAT_INDEX = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8'));
const ALL_CATS = CAT_INDEX.map(([code, fullSpace, leaf]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf };
});

const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const VARIANTS = parseInt(process.env.VARIANTS || '100', 10);
const SHARD_COUNT = parseInt(process.env.SHARDS || '1', 10);
const SHARD_INDEX = parseInt(process.env.SHARD || '0', 10);

let SELECTED = LIMIT > 0 ? ALL_CATS.slice(0, LIMIT) : ALL_CATS;
if (SHARD_COUNT > 1) SELECTED = SELECTED.filter((_, i) => i % SHARD_COUNT === SHARD_INDEX);
const CATEGORIES = SELECTED;
console.log(`Shard ${SHARD_INDEX}/${SHARD_COUNT} | ${CATEGORIES.length} cats × ${VARIANTS} = ${CATEGORIES.length * VARIANTS} gens`);

// ─── 카테고리 그룹 (audit-supplement-leak-16k 패턴 재사용) ──────
function getCategoryGroup(path) {
  if (path.startsWith('출산')) {
    if (/유아간식|유아국|유아양념|유아 우유|유아생수|유아티백/.test(path)) return 'baby_food';
    if (path.includes('유아건강식품')) return 'health_supplement';
    return 'baby';
  }
  if (path.startsWith('식품>건강식품') || /영양제|비타민\/미네랄|홍삼|오메가3|루테인|프로바이오|콜라겐|쏘팔메토|코엔자임|밀크씨슬/.test(path)) return 'health_supplement';
  if (path.startsWith('식품>신선식품') || /과일류|채소|축산|수산|정육|농산물|곡물/.test(path)) return 'fresh_food';
  if (path.startsWith('식품>가공') || /즉석|스낵|김치|반찬|젓갈|면류|소스|조미료|베이커리|유제품|아이스크림|생수|음료|차류|커피|전통주|시리얼|오트밀/.test(path)) return 'processed_food';
  if (path.startsWith('식품')) return 'processed_food';
  if (path.startsWith('뷰티')) return 'beauty';
  if (path.startsWith('가전') || path.includes('디지털')) return 'electronics';
  if (path.startsWith('자동차')) return 'automotive';
  if (path.startsWith('반려')) return 'pet';
  if (path.startsWith('패션')) return 'fashion';
  if (path.startsWith('생활용품')) return 'household';
  if (path.startsWith('가구')) return 'furniture';
  if (path.startsWith('스포츠')) return 'sports';
  if (path.startsWith('주방용품')) return 'kitchen';
  if (path.startsWith('문구')) return 'office';
  if (path.startsWith('완구')) return 'toy';
  if (path.startsWith('도서')) return 'book';
  return 'other';
}

// ─── L1 → 동사 부조화 룰 ──────────────────────────────────
const VERB_MAP = {
  '식품':       { bad: ['입으', '신어', '익히', '설치', '연결', '배치'] },
  '뷰티':       { bad: ['드시', '먹', '입으', '신어', '익히'] },
  '생활용품':   { bad: ['드시', '먹', '입으', '신어', '익히'] },
  '가전':       { bad: ['드시', '먹', '입으', '신어', '익히'] },
  '디지털':     { bad: ['드시', '먹', '입으', '신어', '익히'] },
  '패션의류잡화': { bad: ['드시', '먹', '익히', '설치'] },
  '가구':       { bad: ['드시', '먹', '입으', '신어'] },
  '주방용품':   { bad: ['입으', '신어'] },
  '출산':       { bad: ['신어'] },
  '반려':       { bad: ['입으', '신어'] },
  '스포츠':     { bad: ['드시', '먹', '익히'] },
  '자동차용품': { bad: ['드시', '먹', '입으', '신어', '익히'] },
  '문구':       { bad: ['드시', '먹', '입으', '신어', '익히'] },
  '완구':       { bad: ['드시', '먹', '입으', '신어'] },
  '도서':       { bad: ['드시', '먹', '입으', '신어', '익히'] },
};
function findL1Match(top) {
  for (const k of Object.keys(VERB_MAP)) if (top.includes(k)) return k;
  return null;
}

// ─── Cross-cat 시그니처 토큰 ──────────────────────────────
const CROSS_TOKENS = {
  '식품_signature': ['김치', '한우', '삼겹살', '된장', '국수', '간식', '음료', '주스', '커피', '라면', '식빵', '베이커리'],
  '반려_signature': ['사료', '강아지', '고양이', '반려동물', '캣맘', '댕댕이'],
  '가전_signature': ['모니터', '노트북', '냉장고', '세탁기', '전자기기'],
  '패션_signature': ['치마', '스커트', '원피스', '코트', '셔츠', '러닝화', '구두', '운동화'],
  '뷰티_signature': ['세럼', '에센스', '립스틱', '파운데이션', '마스카라', '화장품'],
  '주방_signature': ['프라이팬', '인덕션', '논스틱'],
  '캠핑': ['캠핑족', '캠핑카', '오토캠핑'],
};
const OWN_SIG = {
  '식품': '식품_signature', '주방용품': '주방_signature',
  '반려': '반려_signature', '패션의류잡화': '패션_signature',
  '가전': '가전_signature', '디지털': '가전_signature',
  '뷰티': '뷰티_signature',
};

function matchWordBoundary(text, token) {
  let idx = 0; const hits = [];
  while ((idx = text.indexOf(token, idx)) >= 0) {
    const prev = idx > 0 ? text[idx - 1] : ' ';
    const isPrevHangul = /[가-힣]/.test(prev);
    if (!isPrevHangul) hits.push(idx);
    idx += token.length;
  }
  return hits.length;
}

function findCrossPollution(text, catL1, leaf, fullPath) {
  const hits = [];
  const leafLower = leaf.toLowerCase();
  const pathLower = (fullPath || '').toLowerCase();
  const ownSig = catL1 ? OWN_SIG[catL1] : null;
  for (const [sigKind, words] of Object.entries(CROSS_TOKENS)) {
    if (sigKind === ownSig) continue;
    for (const w of words) {
      if (matchWordBoundary(text, w) === 0) continue;
      if (leafLower.includes(w)) continue;
      if (pathLower.includes(w.toLowerCase())) continue;
      if (sigKind === '캠핑' && (catL1 === '스포츠' || catL1 === '자동차용품')) continue;
      if (sigKind === '식품_signature' && (catL1 === '식품' || catL1 === '주방용품')) continue;
      if (sigKind === '가전_signature' && (catL1 === '가전' || catL1 === '디지털')) continue;
      if (sigKind === '반려_signature' && catL1 === '반려') continue;
      if (sigKind === '패션_signature' && catL1 === '패션의류잡화') continue;
      if (sigKind === '뷰티_signature' && catL1 === '뷰티') continue;
      if (sigKind === '주방_signature' && (catL1 === '주방용품' || catL1 === '식품')) continue;
      hits.push({ kind: sigKind.replace('_signature', ''), token: w });
    }
  }
  return hits;
}

// ─── 헬스/보충제 토큰 ─────────────────────────────────────
const SUPPLEMENT_TOKENS = [
  '프로틴', '단백질보충', 'WPC', 'WPI', 'BCAA', '크레아틴', '카제인', '게이너',
  '근력강화', '근육성장', '근육합성', '운동회복',
  '코엔자임Q10', '유비퀴놀', '코큐텐',
  '밀크씨슬', '실리마린',
  '루테인', '지아잔틴',
  '글루코사민', '콘드로이친', 'MSM', '보스웰리아',
  '쏘팔메토', '오메가3', 'EPA', 'DHA', '크릴오일',
  '진세노사이드', '인삼사포닌', '프로폴리스',
  '비오틴', '판토텐산',
  '히알루론산', '레티놀', '엘라스틴',
  '실크프로틴', '아르간오일', '판테놀',
  '가르시니아', 'HCA', 'CLA',
  '스피루리나', '클로렐라',
];

function tokenIsSupplementLeak(group, token, catPath) {
  if (group === 'health_supplement') return false;
  if (group === 'beauty' && /히알루론산|레티놀|엘라스틴|판테놀|아르간오일|실크프로틴|콜라겐/.test(token)) return false;
  if (catPath.includes('뷰티>헤어') && /실크프로틴|아르간오일|판테놀/.test(token)) return false;
  const leaf = catPath.split('>').pop().toLowerCase();
  if (leaf.includes(token.toLowerCase())) return false;
  if (catPath.toLowerCase().includes(token.toLowerCase())) return false;
  return true;
}

function countTokenBoundary(text, token) {
  let idx = 0; let count = 0;
  const isAllAscii = /^[A-Z0-9]+$/.test(token);
  while ((idx = text.indexOf(token, idx)) >= 0) {
    const prev = idx > 0 ? text[idx - 1] : ' ';
    const next = idx + token.length < text.length ? text[idx + token.length] : ' ';
    const prevHangul = /[가-힣]/.test(prev);
    const prevWord = /[A-Za-z0-9]/.test(prev);
    const nextWord = /[A-Za-z0-9]/.test(next);
    const bad = isAllAscii ? (prevWord || nextWord) : prevHangul;
    if (!bad) count++;
    idx += token.length;
  }
  return count;
}

// ─── 톤 분류 ───────────────────────────────────────────────
const TONE_PATTERNS = {
  friendly: /(어요|아요|네요|예요|에요|군요|거예요|이에요|있어요|들어요|보여요|돼요|되네요)/g,
  formal:   /(합니다|입니다|됩니다|드립니다|있습니다|없습니다|아닙니다|시킵니다|만듭니다|받습니다|줍니다|제공합니다|준비합니다)/g,
  ad:       /(돋보여요|증명합니다|선물합니다|기준입니다|약속합니다|보장합니다)/g,
  hearsay:  /(평이 많아요|소문이 나는|이야기가 나옵니다|입소문|평가가 많습니다|반응이|후기가 (꾸준|이어|올라))/g,
};
function classifyTone(text) {
  const c = {};
  for (const [t, p] of Object.entries(TONE_PATTERNS)) {
    const m = text.match(p);
    c[t] = m ? m.length : 0;
  }
  return c;
}

// ─── 반복 문장/표현 ──────────────────────────────────────────
function splitSentences(text) {
  return text.split(/[.!?。…]+\s*|\n+/).map(s => s.trim()).filter(s => s.length >= 10);
}
function findRepeatedSentences(sentences) {
  const counts = new Map();
  for (const s of sentences) {
    const key = s.replace(/\s+/g, ' ').slice(0, 60);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dups = [];
  for (const [s, c] of counts) if (c >= 2) dups.push({ sentence: s, count: c });
  return dups;
}
function findRepeatedNgrams(text, n = 16, threshold = 4) {
  // 16자 n-gram을 4회 이상 반복 — 정말 동일한 긴 어구만 잡음.
  // (이전 8자/4회는 모든 한국어 텍스트에서 trigger되어 false positive 100% 발생)
  const compact = text.replace(/\s+/g, ' ').trim();
  const counts = new Map();
  for (let i = 0; i + n <= compact.length; i++) {
    const g = compact.slice(i, i + n);
    if (!/[가-힣]/.test(g)) continue;
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  const hits = [];
  for (const [g, c] of counts) if (c >= threshold) hits.push({ ngram: g, count: c });
  return hits.sort((a, b) => b.count - a.count).slice(0, 5);
}

// ─── 이상한 단어 / 잡음 / 깨진 글자 ────────────────────────
const WEIRD_PATTERNS = [
  { name: 'lonely_jamo',      regex: /(?<![가-힣])[ㄱ-ㅎㅏ-ㅣ]+(?![가-힣])/g },           // 자모 단독
  { name: 'tofu_glyph',       regex: /[\uFFFD]/g },                                       // U+FFFD replacement
  { name: 'control_char',     regex: /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g },     // 제어문자
  { name: 'unmatched_bracket',regex: /[\[\{\(](?![^\[\{\(\]\}\)]{0,80}[\]\}\)])/g },     // 닫히지 않은 괄호
  { name: 'placeholder_var',  regex: /\{[가-힣A-Za-z0-9_]+\}|\$\{[^}]+\}/g },             // 미치환 변수
  { name: 'triple_punct',     regex: /[!?.,]{4,}/g },                                     // 구두점 4개+
  { name: 'leak_template_tag',regex: /\<\<[가-힣A-Za-z_]+\>\>|<[가-힣A-Za-z_]+>/g },     // 템플릿 태그 잔존
];

function findWeirdWords(text) {
  const hits = [];
  for (const { name, regex } of WEIRD_PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      hits.push({ kind: name, examples: Array.from(new Set(matches)).slice(0, 3), count: matches.length });
    }
  }
  return hits;
}

// ─── SEO 디스플레이명 검증 ───────────────────────────────────
const BANNED_PROMO = ['무료배송', '당일발송', '특가', '할인', '세일', '사은품', '리뷰이벤트', '증정', '쿠폰', '적립', '이벤트'];
const BANNED_HYPE = ['최고', '최상', '최강', '최우수', '1위', '넘버원', 'NO.1', '완치', '100%', '효과만점', '치료', '의학적'];
const BANNED_REFMARK = ['상품상세참조', '상세페이지참조', '상페참조', '상세참조'];
const CELEBRITY = new Set(['이서진','정우성','전지현','손예진','공유','김연아','박서준','송중기','이민호','차은우','김수현','현빈','박보검','송혜교','유재석','이광수','김종국','강호동','이승기','임영웅','백종원','안성재','아이유','수지','제니','지수']);

// leaf 토큰 존재 검사 — 2글자+ 는 부분문자열, 1글자 한글 음절(낫·흙·팥·차·밤 등)은
// 독립 토큰(앞뒤가 한글/영숫자 아님)으로만 인정해 부분문자열 오탐("차"∈"차이")을 막는다.
function leafTokenInText(token, text) {
  if (!token) return false;
  if (token.length >= 2) return text.includes(token);
  if (/[가-힣]/.test(token)) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^가-힣A-Za-z0-9])${esc}([^가-힣A-Za-z0-9]|$)`).test(text);
  }
  return text.includes(token);
}

function validateSeo(name, cat) {
  const issues = [];
  const len = name.length;
  if (len > 100) issues.push('hardMaxExceeded');
  if (len < 20) issues.push('tooShort');
  if (len > 50) issues.push('overRecommended');

  const lower = name.toLowerCase();
  const first40 = name.slice(0, 40).toLowerCase();
  const lTokens = cat.leaf.split(/[\/·\s\(\)\[\],+&\-_]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
  const leafInAll = lTokens.some(t => leafTokenInText(t, lower));
  if (!leafInAll) issues.push('leafMissing');
  else if (!lTokens.some(t => leafTokenInText(t, first40))) issues.push('leafLateInTitle');

  const tokens = name.split(/[\s,·/\(\)\[\]+&_]+/).map(t => t.trim().toLowerCase()).filter(t => t.length >= 2);
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  let dup3 = 0;
  for (const [, c] of counts) if (c >= 3) dup3++;
  if (dup3 > 0) issues.push('keywordStuffing');

  for (const b of BANNED_PROMO) if (lower.includes(b.toLowerCase())) { issues.push('promoBanned'); break; }
  for (const b of BANNED_HYPE) if (lower.includes(b.toLowerCase())) { issues.push('hypeBanned'); break; }
  for (const b of BANNED_REFMARK) if (lower.includes(b.toLowerCase())) { issues.push('referenceMarker'); break; }
  for (const c of CELEBRITY) if (name.includes(c)) { issues.push('celebrityLeak'); break; }
  if (tokens.length < 3) issues.push('tooFewTokens');
  if (tokens.length > 10) issues.push('tooManyTokens');
  if (/[★☆●◆■◎※♥♡♬→←↑↓【】《》①②③④⑤]/u.test(name)) issues.push('specialChars');
  return issues;
}

// ─── 100 input 변형 ───────────────────────────────────────
const BRANDS = ['데일리','베스트','에코','스마트','리빙','메가','프리미엄','신선','국내','한국','내추럴','순수','정성','초이스','홈케어','오리진','컴포트','심플','비비드','클래식'];
const SELLERS = ['데일리홈','메가샵','베스트마켓','프리미엄스토어','한국유통','코리아셀러','굿라이프','스마트홈','에코프렌즈','리빙플러스','국민마켓','한국상회','오리진샵','심플마켓','홈케어플러스'];
const UNITS = ['100g','200g','500g','1kg','2kg','500ml','1L','30정','60정','90정','12개입','24개입','3입','5입','10입','대용량','중형','소형'];
const COLORS = ['블랙','화이트','레드','네이비','베이지','그레이','옐로우','블루','핑크','그린'];
const SPECS = ['XL','L','M','S','2XL','55사이즈','66사이즈','단품','세트','선물용'];
const NOISE = ['[정품]','무료배송','특가','★당일발송★','사은품증정','베스트셀러','리뷰이벤트','100%만족','효과만점','쿠폰','★','♥','【공식】'];
const CELEBRITY_NOISE = ['이서진 추천','백종원 픽','아이유 협찬','임영웅 광고'];
const CROSS_NOISE = ['프로틴 듬뿍','BCAA 함유','오메가3 풍부','강아지용','노트북호환','김치맛'];

function buildVariants(cat, ci) {
  const leafBase = cat.leaf.replace(/\/.+$/, '').trim();
  const v = [];
  // 1) 단순 leaf-only ×10
  for (let i = 0; i < 10; i++) {
    v.push({ name: i === 0 ? leafBase : `${BRANDS[i % BRANDS.length]} ${leafBase}`,
             brand: BRANDS[i % BRANDS.length], seller: SELLERS[(ci + i) % SELLERS.length] });
  }
  // 2) brand × spec ×20
  for (let i = 0; i < 20; i++) {
    const b = BRANDS[(ci + i) % BRANDS.length];
    const s = UNITS[i % UNITS.length];
    v.push({ name: `${b} ${leafBase} ${s}`, brand: b, seller: SELLERS[(ci + i + 1) % SELLERS.length] });
  }
  // 3) 색상/사이즈 ×20
  for (let i = 0; i < 20; i++) {
    const c = COLORS[i % COLORS.length], sp = SPECS[i % SPECS.length];
    const b = BRANDS[(ci + i + 2) % BRANDS.length];
    v.push({ name: `${b} ${leafBase} ${c} ${sp}`, brand: b, seller: SELLERS[(ci + i) % SELLERS.length] });
  }
  // 4) 셀러 SEO 오염 ×20
  for (let i = 0; i < 20; i++) {
    const n = NOISE[i % NOISE.length];
    const b = BRANDS[(ci + i + 3) % BRANDS.length];
    v.push({ name: `${n} ${b} ${leafBase} ${leafBase} ${NOISE[(i + 3) % NOISE.length]}`, brand: b, seller: SELLERS[(ci + i + 2) % SELLERS.length] });
  }
  // 5) 연예인/효능 과장 ×10
  for (let i = 0; i < 10; i++) {
    const cel = CELEBRITY_NOISE[i % CELEBRITY_NOISE.length];
    v.push({ name: `${cel} ${BRANDS[i % BRANDS.length]} ${leafBase} 효과만점 100% 보장`,
             brand: '프리미엄', seller: SELLERS[(ci + i + 4) % SELLERS.length] });
  }
  // 6) cross-cat 시드 ×10
  for (let i = 0; i < 10; i++) {
    const cn = CROSS_NOISE[i % CROSS_NOISE.length];
    v.push({ name: `${BRANDS[i] || '데일리'} ${leafBase} ${cn}`,
             brand: BRANDS[i] || '데일리', seller: SELLERS[(ci + i + 5) % SELLERS.length] });
  }
  // 7) 극단 길이 ×10 (긴 입력)
  for (let i = 0; i < 10; i++) {
    v.push({ name: `${BRANDS[i % BRANDS.length]} 프리미엄 최고급 ${leafBase} ${UNITS[i % UNITS.length]} ${COLORS[i % COLORS.length]} ${SPECS[i % SPECS.length]} 신상품 추천 ${leafBase} 인기상품`,
             brand: BRANDS[i % BRANDS.length], seller: SELLERS[(ci + i + 6) % SELLERS.length] });
  }
  return v.slice(0, VARIANTS);
}

// ─── 카운터/리포트 구조 ──────────────────────────────────
const counters = {
  total: 0,
  seoIssue: {},
  seoPass: 0,
  crossPollution: 0,
  supplementLeak: 0,
  identityCollapse: 0,
  verbMismatch: 0,
  toneMixed: 0,
  toneByDom: { friendly: 0, formal: 0, ad: 0, hearsay: 0, none: 0 },
  repeatedSentence: 0,
  repeatedNgram: 0,
  weirdWords: 0,
  weirdByKind: {},
  lengthTooShort: 0,   // <800 chars
  lengthTooLong: 0,    // >5000 chars
  paragraphsTooFew: 0, // <3
  paragraphsTooMany: 0,// >15
  crossTokenFreq: new Map(),
  supplementTokenFreq: new Map(),
  verbMismatchFreq: new Map(),
  repeatedSentenceFreq: new Map(),
  lengthBuckets: { '<500': 0, '500-800': 0, '800-1500': 0, '1500-2500': 0, '2500-4000': 0, '4000-5000': 0, '>5000': 0 },
};
const samples = {
  crossPollution: [], supplementLeak: [], identityCollapse: [],
  verbMismatch: [], toneMixed: [], repeatedSentence: [], weirdWords: [],
  lengthTooShort: [], lengthTooLong: [], seoFail: [],
};
const categoryStats = [];

function pushSample(arr, item, cap = 20) { if (arr.length < cap) arr.push(item); }
function bumpFreqMap(map, key, n = 1) { map.set(key, (map.get(key) || 0) + n); }

const startedAt = Date.now();
const shardTag = SHARD_COUNT > 1 ? `.shard${SHARD_INDEX}-of-${SHARD_COUNT}` : '';
const PROGRESS_LOG = `audit-100x-progress${shardTag}.log`;
const RESULT_JSON = `audit-100x-result${shardTag}.json`;
fs.writeFileSync(PROGRESS_LOG, `START ${new Date().toISOString()} | ${CATEGORIES.length} × ${VARIANTS}\n`);

function logp(m) {
  fs.writeFileSync(PROGRESS_LOG, `[${new Date().toISOString()}] ${m}\n`, { flag: 'a' });
  console.log(m);
}

// ─── 실행 ────────────────────────────────────────────
for (let ci = 0; ci < CATEGORIES.length; ci++) {
  const cat = CATEGORIES[ci];
  const variants = buildVariants(cat, ci);
  const top = cat.path.split('>')[0];
  const l1Key = findL1Match(top);
  const group = getCategoryGroup(cat.path);
  const leafLower = cat.leaf.toLowerCase();
  const leafTokensForCollapse = cat.leaf.split(/[\s/(),\[\]]+/).map(t => t.trim().toLowerCase()).filter(Boolean);

  const bucket = {
    code: cat.code, path: cat.path, leaf: cat.leaf, group,
    seoFail: 0, crossPollution: 0, supplementLeak: 0,
    identityCollapse: 0, verbMismatch: 0, toneMixed: 0,
    repeatedSentence: 0, repeatedNgram: 0, weirdWords: 0,
    lengthTooShort: 0, lengthTooLong: 0,
    topCrossTokens: {}, topSupplementTokens: {},
  };

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi];
    counters.total++;

    // ── SEO 디스플레이명 ──
    let dispName = '';
    try {
      dispName = generateDisplayName(v.name, v.brand, cat.path, v.seller, vi);
    } catch (e) {
      bumpFreqMap(counters.seoIssue, 'generationError', 1);
      counters.seoIssue.generationError = (counters.seoIssue.generationError || 0) + 1;
    }
    if (dispName) {
      const seoIssues = validateSeo(dispName, cat);
      const FAIL = new Set(['hardMaxExceeded','leafMissing','keywordStuffing','promoBanned','hypeBanned','referenceMarker','celebrityLeak','tooFewTokens','specialChars']);
      const failed = seoIssues.some(i => FAIL.has(i));
      if (!failed) counters.seoPass++;
      else { bucket.seoFail++; pushSample(samples.seoFail, { cat: cat.path, input: v.name, generated: dispName, issues: seoIssues }, 30); }
      for (const i of seoIssues) counters.seoIssue[i] = (counters.seoIssue[i] || 0) + 1;
    }

    // ── 본문 생성 ──
    let text = '';
    let paragraphs = [];
    try {
      const r = generatePersuasionContent(v.name, cat.path, v.seller, vi, [cat.leaf]);
      if (r && r.blocks) {
        paragraphs = contentBlocksToParagraphs(r.blocks, cat.path);
        text = paragraphs.join('\n');
      }
    } catch (e) { /* skip */ }
    // append review for extra signal
    try {
      const rv = generateRealReview(v.name, cat.path, `${v.seller}::r`, vi);
      if (rv && rv.paragraphs) text += '\n' + rv.paragraphs.join('\n');
    } catch (e) { /* skip */ }
    if (!text) continue;

    // ── 길이 분포 ──
    const L = text.length;
    if (L < 500) counters.lengthBuckets['<500']++;
    else if (L <= 800) counters.lengthBuckets['500-800']++;
    else if (L <= 1500) counters.lengthBuckets['800-1500']++;
    else if (L <= 2500) counters.lengthBuckets['1500-2500']++;
    else if (L <= 4000) counters.lengthBuckets['2500-4000']++;
    else if (L <= 5000) counters.lengthBuckets['4000-5000']++;
    else counters.lengthBuckets['>5000']++;
    if (L < 800) { counters.lengthTooShort++; bucket.lengthTooShort++;
      pushSample(samples.lengthTooShort, { cat: cat.path, len: L, snippet: text.slice(0, 200) }, 15); }
    if (L > 5000) { counters.lengthTooLong++; bucket.lengthTooLong++;
      pushSample(samples.lengthTooLong, { cat: cat.path, len: L, snippet: text.slice(0, 200) }, 15); }
    const pgCount = paragraphs.filter(p => p.trim().length >= 30).length;
    if (pgCount < 3) counters.paragraphsTooFew++;
    if (pgCount > 15) counters.paragraphsTooMany++;

    // ── 1) cross-cat ──
    const crossHits = findCrossPollution(text, l1Key, cat.leaf, cat.path);
    if (crossHits.length > 0) {
      counters.crossPollution++; bucket.crossPollution++;
      for (const h of crossHits) {
        bumpFreqMap(counters.crossTokenFreq, h.token);
        bucket.topCrossTokens[h.token] = (bucket.topCrossTokens[h.token] || 0) + 1;
      }
      pushSample(samples.crossPollution, { cat: cat.path, leaf: cat.leaf, input: v.name, crossHits, snippet: text.slice(0, 280) }, 30);
    }

    // ── 2) supplement leak ──
    const supplementHits = [];
    for (const tok of SUPPLEMENT_TOKENS) {
      if (!tokenIsSupplementLeak(group, tok, cat.path)) continue;
      const c = countTokenBoundary(text, tok);
      if (c > 0) supplementHits.push({ token: tok, count: c });
    }
    if (supplementHits.length > 0) {
      counters.supplementLeak++; bucket.supplementLeak++;
      for (const h of supplementHits) {
        bumpFreqMap(counters.supplementTokenFreq, h.token, h.count);
        bucket.topSupplementTokens[h.token] = (bucket.topSupplementTokens[h.token] || 0) + h.count;
      }
      pushSample(samples.supplementLeak, { cat: cat.path, leaf: cat.leaf, group, input: v.name, hits: supplementHits, snippet: text.slice(0, 280) }, 30);
    }

    // ── 3) identity collapse — leaf 토큰 본문 0회 ──
    const textLower = text.toLowerCase();
    const leafFound = leafTokensForCollapse.some(t => leafTokenInText(t, textLower));
    if (!leafFound) {
      counters.identityCollapse++; bucket.identityCollapse++;
      pushSample(samples.identityCollapse, { cat: cat.path, leaf: cat.leaf, input: v.name, snippet: text.slice(0, 280) }, 30);
    }

    // ── 4) verb mismatch ──
    if (l1Key && VERB_MAP[l1Key]) {
      const vbm = [];
      // leaf/path 가 bad 동사 형태를 포함하면(예: "원단용먹지"에 "먹"), 그 카테고리에서는 false positive — skip
      const pathLowerForVerb = cat.path.toLowerCase();
      for (const b of VERB_MAP[l1Key].bad) {
        if (pathLowerForVerb.includes(b)) continue;
        if (text.includes(b)) vbm.push(b);
      }
      if (vbm.length > 0) {
        counters.verbMismatch++; bucket.verbMismatch++;
        for (const x of vbm) bumpFreqMap(counters.verbMismatchFreq, x);
        pushSample(samples.verbMismatch, { cat: cat.path, leaf: cat.leaf, input: v.name, verbs: vbm, snippet: text.slice(0, 280) }, 30);
      }
    }

    // ── 5) tone ──
    const tones = classifyTone(text);
    const tonTotal = Object.values(tones).reduce((a, b) => a + b, 0);
    let dom = 'none', domCnt = 0;
    for (const [t, c] of Object.entries(tones)) if (c > domCnt) { domCnt = c; dom = t; }
    counters.toneByDom[dom]++;
    if (tonTotal >= 5 && domCnt / tonTotal < 0.6) {
      counters.toneMixed++; bucket.toneMixed++;
      pushSample(samples.toneMixed, { cat: cat.path, leaf: cat.leaf, tones, dominant: dom, snippet: text.slice(0, 280) }, 15);
    }

    // ── 6) repeated sentences ──
    const sentences = splitSentences(text);
    const dupSentences = findRepeatedSentences(sentences);
    if (dupSentences.length > 0) {
      counters.repeatedSentence++; bucket.repeatedSentence++;
      for (const ds of dupSentences) bumpFreqMap(counters.repeatedSentenceFreq, ds.sentence);
      pushSample(samples.repeatedSentence, { cat: cat.path, leaf: cat.leaf, input: v.name, dupSentences: dupSentences.slice(0, 3), snippet: text.slice(0, 280) }, 30);
    }
    // ── 7) repeated n-gram (긴 어구 반복) ──
    const dupNg = findRepeatedNgrams(text, 16, 4);
    if (dupNg.length > 0) {
      counters.repeatedNgram++; bucket.repeatedNgram++;
    }

    // ── 8) weird words ──
    const weird = findWeirdWords(text);
    if (weird.length > 0) {
      counters.weirdWords++; bucket.weirdWords++;
      for (const w of weird) counters.weirdByKind[w.kind] = (counters.weirdByKind[w.kind] || 0) + w.count;
      pushSample(samples.weirdWords, { cat: cat.path, leaf: cat.leaf, input: v.name, weird, snippet: text.slice(0, 280) }, 30);
    }
  }

  categoryStats.push(bucket);

  if ((ci + 1) % 200 === 0) {
    const sec = ((Date.now() - startedAt) / 1000).toFixed(0);
    const rate = ((ci + 1) / parseFloat(sec || '1')).toFixed(1);
    const eta = (((CATEGORIES.length - (ci + 1)) / parseFloat(rate || '1')) / 60).toFixed(1);
    logp(`[${ci+1}/${CATEGORIES.length}] ${((ci+1)/CATEGORIES.length*100).toFixed(1)}% | ${sec}s @ ${rate}cat/s | ETA ${eta}min | seoPass ${counters.seoPass}/${counters.total} (${(counters.seoPass/Math.max(1,counters.total)*100).toFixed(1)}%) | cross ${counters.crossPollution} supl ${counters.supplementLeak} idC ${counters.identityCollapse} verb ${counters.verbMismatch} tone ${counters.toneMixed} repS ${counters.repeatedSentence} weird ${counters.weirdWords}`);
  }
}

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
logp(`DONE in ${elapsedSec}s`);

const total = counters.total;
const pct = n => +(n / Math.max(1, total) * 100).toFixed(3);

categoryStats.sort((a, b) => {
  const score = c => c.crossPollution + c.supplementLeak + c.identityCollapse + c.verbMismatch + c.repeatedSentence + c.weirdWords + c.lengthTooShort + c.lengthTooLong;
  return score(b) - score(a);
});

const topCross = Array.from(counters.crossTokenFreq).sort((a, b) => b[1] - a[1]).slice(0, 50);
const topSupp = Array.from(counters.supplementTokenFreq).sort((a, b) => b[1] - a[1]).slice(0, 50);
const topVerb = Array.from(counters.verbMismatchFreq).sort((a, b) => b[1] - a[1]).slice(0, 50);
const topRepeated = Array.from(counters.repeatedSentenceFreq).sort((a, b) => b[1] - a[1]).slice(0, 50);

const report = {
  meta: { totalCategories: CATEGORIES.length, variantsPerCategory: VARIANTS, totalGenerated: total, elapsedSec: parseFloat(elapsedSec), finishedAt: new Date().toISOString(), shard: { index: SHARD_INDEX, count: SHARD_COUNT } },
  summary: {
    seoPass: counters.seoPass, seoPassPct: pct(counters.seoPass),
    crossPollution: counters.crossPollution, crossPollutionPct: pct(counters.crossPollution),
    supplementLeak: counters.supplementLeak, supplementLeakPct: pct(counters.supplementLeak),
    identityCollapse: counters.identityCollapse, identityCollapsePct: pct(counters.identityCollapse),
    verbMismatch: counters.verbMismatch, verbMismatchPct: pct(counters.verbMismatch),
    toneMixed: counters.toneMixed, toneMixedPct: pct(counters.toneMixed),
    repeatedSentence: counters.repeatedSentence, repeatedSentencePct: pct(counters.repeatedSentence),
    repeatedNgram: counters.repeatedNgram, repeatedNgramPct: pct(counters.repeatedNgram),
    weirdWords: counters.weirdWords, weirdWordsPct: pct(counters.weirdWords),
    lengthTooShort: counters.lengthTooShort, lengthTooShortPct: pct(counters.lengthTooShort),
    lengthTooLong: counters.lengthTooLong, lengthTooLongPct: pct(counters.lengthTooLong),
    paragraphsTooFew: counters.paragraphsTooFew, paragraphsTooMany: counters.paragraphsTooMany,
    toneByDominant: counters.toneByDom,
  },
  seoIssueBreakdown: Object.fromEntries(Object.entries(counters.seoIssue).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { count: v, pct: pct(v) }])),
  lengthDistribution: counters.lengthBuckets,
  weirdByKind: counters.weirdByKind,
  topCrossTokens: topCross.map(([t, c]) => ({ token: t, count: c })),
  topSupplementTokens: topSupp.map(([t, c]) => ({ token: t, count: c })),
  topVerbMismatch: topVerb.map(([v, c]) => ({ verb: v, count: c })),
  topRepeatedSentences: topRepeated.map(([s, c]) => ({ sentence: s, count: c })),
  worstCategories: categoryStats.slice(0, 50).map(b => ({
    code: b.code, path: b.path, leaf: b.leaf, group: b.group,
    cross: b.crossPollution, supl: b.supplementLeak, idCollapse: b.identityCollapse,
    verb: b.verbMismatch, tone: b.toneMixed, rep: b.repeatedSentence, weird: b.weirdWords,
    lenShort: b.lengthTooShort, lenLong: b.lengthTooLong,
    topCross: Object.entries(b.topCrossTokens).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topSupp: Object.entries(b.topSupplementTokens).sort((a, b) => b[1] - a[1]).slice(0, 5),
  })),
  samples,
};

fs.writeFileSync(RESULT_JSON, JSON.stringify(report, null, 2));
console.log(`\n결과 저장: ${RESULT_JSON} (${elapsedSec}s)`);
console.log(`총 ${total} | seoPass ${pct(counters.seoPass)}% | cross ${counters.crossPollution} (${pct(counters.crossPollution)}%) | supl ${counters.supplementLeak} | idC ${counters.identityCollapse} | verb ${counters.verbMismatch} | tone ${counters.toneMixed} | repSent ${counters.repeatedSentence} | weird ${counters.weirdWords} | lenShort ${counters.lengthTooShort} | lenLong ${counters.lengthTooLong}`);
