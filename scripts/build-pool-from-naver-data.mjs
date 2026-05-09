/**
 * build-pool-from-naver-data.mjs v2
 *
 * naver-autocomplete.json + naver-search-volume.json → 카테고리별 SEO 풀.
 *
 * v2 개선사항:
 *   - 자동완성 키워드를 "leaf 토큰 + modifier"로 분해 → modifier만 추출
 *   - 인플루언서/연예인 차단 (한글 2~3자 단독 prefix)
 *   - 브랜드명 차단 (영문/외래어 prefix + 한글)
 *   - 정보형 키워드 차단 ("뜻/방법/원인/효과/의미/차이/란")
 *   - 검색량 가중치 (들어온 데이터에 한해 monthlyVolume 정렬)
 *
 * 출력: src/lib/megaload/data/seo-keyword-pools-v2.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const COUPANG_DETAILS_PATH = join(DATA_DIR, 'coupang-cat-details.json');
const AUTOCOMPLETE_PATH = join(DATA_DIR, 'naver-autocomplete.json');
const VOLUME_PATH = join(DATA_DIR, 'naver-search-volume.json');
const OUTPUT_PATH = join(DATA_DIR, 'seo-keyword-pools-v2.json');

// 정보형 어미/접미사 — 검색 의도가 정보 조회 (구매 X)
const INFO_SUFFIX_PATTERNS = [
  /뜻$/, /란$/, /이란$/, /의미$/, /방법$/, /원인$/, /효과$/, /차이$/,
  /후기$/, /비교$/, /분석$/, /순위$/, /vs$/, /vs\s/, /와\s/, /과\s/,
];

// 정보형 영문 패턴
const INFO_ENG_PATTERNS = [
  /\bin\s+to\b/i, /\bwith\s+to\b/i, /\bvs\b/i, /\bof\s/i,
  /\bin\s+/i, /\ban\s+/i,
];

// 알려진 한국 K-pop/연예인/인플루언서 (확장 — 베스트셀러 광고 모델 위주)
const CELEBRITY_PREFIX = new Set([
  '정유미', '한혜진', '김혜수', '전지현', '아이유', '수지', '제니', '지수',
  '정해인', '박서준', '송중기', '이민호', '차은우', '김수현', '현빈', '박보검',
  '백종원', '안성재', '이영자', '유재석', '강호동', '이승기', '임영웅',
  '김희선', '고현정', '김태희', '한가인', '전현무', '박은빈', '김고은',
  '이서진', '정우성', '손예진', '공유', '김연아',
]);

// 알려진 브랜드 prefix (화장품/가전/패션 위주)
const BRAND_PREFIX = new Set([
  // 화장품
  '클라랑스', '클라란스', '겔랑', '에스티로더', '랑콤', '라프레리', '시슬리',
  '키엘', '바비브라운', 'ckd', 'lg생활건강', 'amh', '닥터자르트', '이니스프리',
  '설화수', '후', '오휘', '헤라', '아이오페', '라네즈', '미샤', '에뛰드',
  // 가전
  '삼성', 'lg', '애플', 'apple', 'samsung', '소니', 'sony', '다이슨',
  '필립스', '파나소닉', '쿠쿠', '쿠첸', '위닉스', '신일', '쿠진아트',
  // 패션
  '나이키', 'nike', '아디다스', 'adidas', '뉴발란스', '컨버스', '반스',
  '뉴에라', '챔피언', '르까프', '데상트', '휠라', 'fila',
  '아식스', 'asics', '리복', 'reebok', '푸마', 'puma', '언더아머',
  'k2', '코오롱스포츠', '디스커버리', '노스페이스', '컬럼비아', 'columbia',
  '폴로', 'polo', '라코스테', 'lacoste', '타미힐피거', 'tommy',
  '자라', 'zara', 'h&m', '유니클로', 'uniqlo', '에잇세컨즈',
  // 명품
  '구찌', 'gucci', '루이비통', 'louis', '샤넬', 'chanel', '에르메스',
  '프라다', 'prada', '디올', 'dior', '버버리', 'burberry',
  // 액세서리
  '맥세이프', 'magsafe', '갤럭시', 'galaxy', '아이폰', 'iphone',
  '에어팟', 'airpods',
  // 식품
  '하림', '풀무원', '오뚜기', '농심', 'cj', '대상', '동원', '롯데',
]);

// SEO 가치 있는 일반 modifier — keep
const KEEP_MODIFIERS = new Set([
  '추천', '인기', '베스트', '신상', '신상품', '최신', '한정',
  '프리미엄', '고급', '대용량', '소용량', '미니', '대형', '소형',
  '국내산', '국산', '수입', '정품', '정식수입',
  '여성용', '남성용', '아동용', '유아용', '시니어용',
  '가정용', '업소용', '사무용', '차량용', '캠핑용', '여행용', '학생용',
  '고속', '저소음', '경량', '대용량', '소형',
  '무선', '유선', '자동', '수동',
  '봄', '여름', '가을', '겨울', '사계절',
  '오리지널', '오가닉', '유기농', '천연', '비건',
]);

// 자체적으로 차단할 generic 토큰
const BLOCK_TOKENS = new Set([
  // 정보 검색 의도 (KEEP_MODIFIERS와 충돌하지 않도록 별도)
  '뜻', '란', '의미', '방법', '원인', '효과', '차이', '후기', '비교',
  '효능', '부작용', '과다복용', '복용법', '사용법', '보관법', '주의사항',
  '단점', '장점', '결점', '위험', '위험성', '실험', '실험결과',
  '추천법', '먹는법', '쓰는법', '고르는법', '선택법',
  '만드는법', '만들기', '끓이는법', '내리는법', '추출법', '레시피', '조리법',
  '제조법', '담그는법', '말리는법', '관리법',
  '리뷰', '내돈내산', '사용기',
  // 너무 generic / 카테고리 불명
  '제품', '상품', '판매', '구매', '쇼핑', '음식', '음료', '액체',
  '종류', '분류', '가격대', '매장', '아이템',
  // 광고/마케팅 노이즈
  '특가', '할인', '세일', '쿠폰', '증정', '사은품', '무료배송',
  '직구', '직배송', '해외배송',
  // 모호한 단어
  '것', '거', '걸', '걸로', '거로', '따라', '안', '나', '너',
  // 인구통계 정보형 (특정 카테고리 외 generic으로 차단)
  '임산부', '임신', '수유', '아이', '어른', '노인',
  // 영문 stopwords
  'in', 'to', 'of', 'an', 'a', 'the', 'and', 'or', 'for', 'on',
  'is', 'be', 'as', 'by', 'with', 'from', 'at', 'this', 'that',
  'vs', 'so', 'if', 'no', 'not', 'all', 'how', 'what', 'why',
  'when', 'where', 'who', 'which', 'more', 'most', 'less',
]);

const MARKETING_NOISE = [
  '가격', '할인', '특가', '증정', '사은품', '리뷰이벤트', '쿠폰',
  '무료배송', '당일발송', '빠른배송', '오늘출발', '최저가',
];

function pathToTokens(categoryPath) {
  const segs = categoryPath.split('>').map(s => s.trim()).filter(Boolean);
  const tokens = new Set();
  for (const seg of segs) {
    if (seg.length >= 1) tokens.add(seg.toLowerCase());
    for (const part of seg.split(/[\/·\s\(\)\[\],+&\-_'']+/)) {
      const t = part.trim().toLowerCase();
      if (t.length >= 1 && !/^\d+$/.test(t)) tokens.add(t);
    }
  }
  return tokens;
}

function leafBaseToken(leaf) {
  const splits = leaf
    .split(/[\/·\(\)\[\],+&\-_'']+/)
    .map(s => s.trim())
    .filter(s => s.length >= 1 && !/^\d+$/.test(s));
  return (splits[0] || leaf).toLowerCase();
}

/**
 * 자동완성 키워드를 토큰화. 공백 + 슬래시 + 콤마 분리.
 */
function tokenize(keyword) {
  return keyword
    .split(/[\s,\/·]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 1);
}

/**
 * 토큰이 인플루언서/연예인 이름인지 판정.
 * - 사전 매칭 우선
 * - 한글 2~3자 단독 토큰 (성+이름 조합)은 의심스럽지만 false positive 위험
 *   → 사전 매칭만 사용
 */
function isCelebrity(token) {
  return CELEBRITY_PREFIX.has(token.toLowerCase());
}

/**
 * 토큰이 브랜드명인지 판정.
 */
function isBrand(token) {
  return BRAND_PREFIX.has(token.toLowerCase());
}

/**
 * 토큰이 정보형 키워드인지 판정.
 */
function isInfoQuery(token) {
  if (BLOCK_TOKENS.has(token.toLowerCase())) return true;
  if (INFO_SUFFIX_PATTERNS.some(p => p.test(token))) return true;
  if (INFO_ENG_PATTERNS.some(p => p.test(token))) return true;
  return false;
}

/**
 * 자동완성 키워드에서 leaf 토큰 제외하고 modifier만 추출.
 * 검증 로직: 인플루언서/브랜드/정보형 차단.
 *
 * ★ 1~2자 leaf("롤","무","상","칡") strict 모드:
 *   modifier가 path/leaf와 무관한 generic이면 차단.
 *   "롤" leaf의 자동완성 → "펨코","전적검색","티어" 같은 게임 키워드 누출 방지.
 */
function extractModifiers(keyword, leafLower, pathTokens) {
  const tokens = tokenize(keyword);
  const modifiers = [];
  const isShortLeaf = leafLower.length <= 2;

  for (const token of tokens) {
    const tLower = token.toLowerCase();
    // leaf base와 정확/포함 매칭이면 skip (이미 알고 있는 토큰)
    if (tLower === leafLower) continue;
    if (tLower.includes(leafLower) && tLower.length <= leafLower.length + 2) continue;

    // path 토큰과 동일하면 skip
    if (pathTokens.has(tLower)) continue;

    // 차단 검증
    if (isCelebrity(token)) continue;
    if (isBrand(token)) continue;
    if (isInfoQuery(token)) continue;

    // 너무 짧거나 (1자) 순수 숫자 skip
    if (tLower.length < 2) continue;
    if (/^\d+$/.test(tLower)) continue;

    // 영문 단독 토큰 — 길이 4자 이상이면 브랜드 가능성 → skip (보수적)
    if (/^[a-zA-Z]+$/.test(token) && token.length >= 4) continue;

    // ★ 1~2자 leaf strict 모드 — path 매칭 또는 generic keep modifier만 통과
    if (isShortLeaf) {
      const isPathRelated = [...pathTokens].some(
        pt => pt.length >= 3 && (tLower.includes(pt) || pt.includes(tLower)),
      );
      const isUniversalKeep = KEEP_MODIFIERS.has(tLower);
      if (!isPathRelated && !isUniversalKeep) continue;
    }

    modifiers.push(token);
  }

  return modifiers;
}

/**
 * 키워드가 카테고리에 적합한지 판정.
 * - leaf 또는 path 토큰 1개+ 매칭 필수
 *
 * 1~2자 leaf("상","면","탐","칡","A")는 substring 매칭하면 동음이의어 폭주
 *   ("상" → "상무초밥","온누리상품권","상영중인영화" 통과) → word-boundary 매칭만 허용.
 * path 토큰도 generic 2자(가구/주방 등)는 substring 매칭 허용하되 1자는 word-boundary.
 */
function isRelevantToCategory(keyword, leafLower, pathTokens) {
  const kLower = keyword.toLowerCase();
  if (kLower.length < 2) return false;
  if (/^\d+$/.test(kLower)) return false;

  // 1~2자 leaf — word-boundary 매칭만 (동음이의어 차단)
  if (leafLower.length <= 2) {
    const ktokens = kLower.split(/[\s,\/·]+/).map(t => t.trim()).filter(Boolean);
    // word-level 정확 매칭
    if (ktokens.includes(leafLower)) return true;
    // path 토큰 ≥3자 substring 매칭 허용 (긴 토큰은 동음이의어 위험 적음)
    for (const t of pathTokens) {
      if (t.length >= 3 && (kLower.includes(t) || t.includes(kLower))) return true;
    }
    return false;
  }

  // 일반: 3자+ leaf는 substring 매칭
  if (kLower.includes(leafLower)) return true;
  for (const t of pathTokens) {
    if (t.length >= 3 && (kLower.includes(t) || t.includes(kLower))) return true;
  }
  return false;
}

function deriveSynonyms(leafBase, allKeywords) {
  const variants = new Set();
  if (leafBase.length < 3) return [];

  for (const k of allKeywords) {
    const kLower = k.toLowerCase();
    const noSpace = kLower.replace(/\s+/g, '');
    // 정보형 차단
    if (isInfoQuery(k)) continue;
    if (noSpace === leafBase && kLower !== leafBase) variants.add(k);
    // 영/한 변형: "에어프라이어" ↔ "AirFryer"
    const baseAlpha = leafBase.replace(/[^a-z]/g, '');
    const kAlpha = kLower.replace(/[^a-z]/g, '');
    if (baseAlpha.length >= 3 && baseAlpha === kAlpha && kLower !== leafBase) variants.add(k);
  }
  return [...variants].slice(0, 5);
}

function main() {
  console.log('📁 데이터 로드...');
  const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
  const autocomplete = existsSync(AUTOCOMPLETE_PATH) ? JSON.parse(readFileSync(AUTOCOMPLETE_PATH, 'utf8')) : {};
  const volume = existsSync(VOLUME_PATH) ? JSON.parse(readFileSync(VOLUME_PATH, 'utf8')) : {};

  const allCats = [];
  for (const [, v] of Object.entries(coupangDetails)) {
    if (v && v.p) {
      const segs = v.p.split('>');
      allCats.push({ path: v.p, leaf: segs[segs.length - 1] });
    }
  }
  console.log(`총 카테고리: ${allCats.length}`);
  console.log(`자동완성: ${Object.keys(autocomplete).length}개`);
  console.log(`검색량: ${Object.keys(volume).length}개`);

  const v2Pools = {};
  let withRichData = 0;
  let withMinimalData = 0;
  let fallbackOnly = 0;

  for (const { path, leaf } of allCats) {
    const pathTokens = pathToTokens(path);
    const leafLower = leafBaseToken(leaf);

    const acData = autocomplete[path];
    const volData = volume[path];

    // 1. 자동완성에서 카테고리 적합한 키워드 → modifier 추출
    const acSuggestions = (acData?.suggestions && Array.isArray(acData.suggestions)) ? acData.suggestions : [];
    const relevantAc = acSuggestions.filter(s => isRelevantToCategory(s, leafLower, pathTokens));

    const modifierSet = new Set();
    for (const k of relevantAc) {
      const mods = extractModifiers(k, leafLower, pathTokens);
      for (const m of mods) modifierSet.add(m.toLowerCase());
    }
    const modifiers = [...modifierSet].slice(0, 12);

    // 2. 검색량 데이터에서 연관 키워드 (검색량 ≥ 100, 카테고리 적합)
    const volRelated = (volData?.related && Array.isArray(volData.related)) ? volData.related : [];
    const relevantVol = volRelated
      .filter(r => r.kw && isRelevantToCategory(r.kw, leafLower, pathTokens))
      .filter(r => (r.pc || 0) + (r.mobile || 0) >= 100)
      .sort((a, b) => (b.pc + b.mobile) - (a.pc + a.mobile));

    // 검색량 키워드에서도 modifier 추출
    const volModifierSet = new Set();
    const longTailSet = new Set();
    for (const r of relevantVol) {
      const mods = extractModifiers(r.kw, leafLower, pathTokens);
      for (const m of mods) volModifierSet.add(m.toLowerCase());
      // 검색량 ≥ 1000 + 길이 ≥ 4 → long-tail
      if ((r.pc + r.mobile) >= 1000 && r.kw.length >= 4 && r.kw.length <= 20) {
        longTailSet.add(r.kw);
      }
    }

    // 3. modifier merge — 자동완성 + 검색량
    const mergedModSet = new Set([...modifierSet, ...volModifierSet]);
    const mergedModifiers = [...mergedModSet].slice(0, 10);

    // 4. synonyms — leaf 변형
    const allKws = [...relevantAc, ...relevantVol.map(r => r.kw)];
    const synonyms = deriveSynonyms(leafLower, allKws);

    // 5. longTail — 검색량 가중 정렬
    const longTail = [...longTailSet].slice(0, 6);

    // 6. monthlyVolume + topRelated
    const monthlyVolume = volData?.totalMonthly || 0;
    const topRelated = relevantVol.slice(0, 5).map(r => ({
      kw: r.kw, vol: r.pc + r.mobile, comp: r.compIdx,
    }));

    // 7. 데이터 품질 분류
    if (mergedModifiers.length >= 3 && (monthlyVolume > 0 || topRelated.length > 0)) {
      withRichData++;
    } else if (mergedModifiers.length >= 2) {
      withMinimalData++;
    } else {
      fallbackOnly++;
    }

    v2Pools[path] = {
      leafBase: leafLower,
      modifiers: mergedModifiers,
      longTail,
      synonyms,
      banned: [...MARKETING_NOISE],
      monthlyVolume,
      topRelated,
      hasVolumeData: !!volData && !volData.error,
      lengthMin: 40,
      lengthMax: 60,
    };
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(v2Pools));
  console.log(`\n✅ 완료`);
  console.log(`   풍부 데이터 (modifier ≥3 + volume): ${withRichData}개 (${(withRichData/allCats.length*100).toFixed(1)}%)`);
  console.log(`   최소 데이터 (modifier ≥2):          ${withMinimalData}개 (${(withMinimalData/allCats.length*100).toFixed(1)}%)`);
  console.log(`   fallback only:                     ${fallbackOnly}개 (${(fallbackOnly/allCats.length*100).toFixed(1)}%)`);
  console.log(`   출력: ${OUTPUT_PATH}`);
}

main();
