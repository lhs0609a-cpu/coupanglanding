// ============================================================
// 노출상품명(displayProductName) SEO 최적화 생성기 v3
//
// 핵심 원리: "추출 → 분류 → 안전 확장"
//
// Phase 1: 원본 상품명에서 토큰 추출 & 분류
//   - TYPE:  [바디워시]         ← 상품 유형
//   - INGR:  [알로에베라, 레몬]  ← 성분 (팩트)
//   - FEAT:  [유기농, 바이오]    ← 특징 (팩트)
//   - ORIG:  [이탈리아]         ← 원산지
//   - DESC:  [150년, 명품]      ← 서술어
//   - SPEC:  [500ml]           ← 스펙
//
// Phase 2: 안전 확장 규칙
//   - Generic (카테고리 수준): 항상 추가 가능 ✅
//   - TYPE 동의어: 바디워시→샤워젤 ✅
//   - INGR/FEAT 동의어: 원본 매칭된 것만 ✅
//   - INGR/FEAT 신규 추가: ❌ 절대 안 됨!
//
// Phase 3: 다양성 확보 (6가지 전략)
//   1. 토큰 순서 변형
//   2. 안전 동의어 치환 (TYPE/FEAT만)
//   3. 복합어 생성
//   4. 부분 선택 (토큰 풀에서 서브셋)
//   5. Generic 회전
//   6. 스펙 위치 변형
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import seoData from '../data/seo-keyword-pools.json';
import { checkCompliance } from './compliance-filter';

// ─── 타입 ────────────────────────────────────────────────

interface CategoryPool {
  generic: string[];
  ingredients: string[];
  features: string[];
}

interface ClassifiedTokens {
  type: string[];       // 상품 유형 (바디워시, 크림 등)
  ingredients: string[];// 성분 — 원본에서 추출
  features: string[];   // 특징 — 원본에서 추출
  origin: string[];     // 원산지
  descriptors: string[];// 서술어 (150년, 명품 등)
  specs: string[];      // 스펙 (500ml, 1개 등)
}

// ─── 데이터 로드 ─────────────────────────────────────────

const CATEGORY_POOLS: Record<string, CategoryPool> = seoData.categoryPools;
const SYNONYM_GROUPS: Record<string, string[]> = seoData.synonymGroups;
const UNIVERSAL_MODIFIERS: string[] = (seoData as Record<string, unknown>).universalModifiers as string[] || [];

// ─── 상수 ────────────────────────────────────────────────

// "개월분?" / "일분" / "주분" 은 반드시 "개" 보다 앞에 위치해야 부분매칭 방지
const SPEC_PATTERN = /\d+\s*(개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

const NOISE = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '추천', '인기', '베스트', '상품상세참조',
]);

// 원산지 키워드 (해외 + 국내 주요 산지)
const ORIGINS = new Set([
  // 해외
  '한국', '국내', '국산', '미국', '일본', '중국', '독일', '프랑스', '이탈리아',
  '영국', '호주', '뉴질랜드', '스위스', '캐나다', '네덜란드', '스페인', '덴마크',
  '노르웨이', '스웨덴', '핀란드', '벨기에', '오스트리아', '인도', '태국', '베트남',
  '칠레', '페루', '멕시코', '필리핀', '에콰도르',
  // 국내 광역
  '경북', '경남', '충북', '충남', '전북', '전남', '강원', '경기', '제주',
  // 국내 주요 농산물 산지 (과일/채소/쌀)
  '청송', '영주', '영덕', '봉화', '영양', '안동', '상주', '김천', '경산', '의성',
  '성주', '밀양', '거창', '합천', '산청', '하동',
  '나주', '해남', '영암', '담양', '순천', '보성', '고흥', '무안',
  '충주', '음성', '진천', '괴산', '보은', '영동', '금산',
  '예산', '서산', '당진', '부여', '공주', '논산', '청양',
  '이천', '여주', '양평', '평택', '안성', '화성',
  '횡성', '홍천', '정선', '평창', '춘천', '양양', '속초',
  '익산', '정읍', '남원', '김제', '완주', '고창', '부안',
  '서귀포',
  // 수산물 산지
  '통영', '거제', '남해', '여수', '완도', '진도', '목포', '태안', '서천', '보령',
  '포항', '울진', '영덕', '울릉', '속초', '강릉', '동해', '삼척', '제주',
]);

/**
 * 원본 텍스트에서 풀 키워드가 독립적으로 존재하는지 확인.
 * 단순 .includes()와 달리, 매칭 전후 문자가 동일 스크립트(한글-한글, 라틴-라틴)로
 * 이어지면 다른 단어의 일부일 수 있으므로 거부한다.
 * 예: "오리지널" 안의 "오리" → 한글-한글 연속 → 거부
 * 예: "비타민C 크림" 안의 "비타민C" → C 뒤 공백 → 허용
 */
function matchesWholeUnit(text: string, term: string): boolean {
  const isHangul = (c: string) => c >= '\uAC00' && c <= '\uD7AF';
  const isLatin = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  const isDigit = (c: string) => c >= '0' && c <= '9';

  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(term, searchFrom);
    if (idx < 0) return false;

    const endIdx = idx + term.length;
    let ok = true;

    // 앞 문자 검사: 같은 스크립트로 연속이면 단어 중간 → 거부
    if (idx > 0) {
      const prev = text[idx - 1];
      const first = term[0];
      if ((isHangul(prev) && isHangul(first)) || (isLatin(prev) && isLatin(first)) || (isDigit(prev) && isDigit(first))) {
        ok = false;
      }
    }

    // 뒤 문자 검사: 같은 스크립트로 연속이면 단어 중간 → 거부
    if (ok && endIdx < text.length) {
      const next = text[endIdx];
      const last = term[term.length - 1];
      if ((isHangul(next) && isHangul(last)) || (isLatin(next) && isLatin(last)) || (isDigit(next) && isDigit(last))) {
        ok = false;
      }
    }

    if (ok) return true;
    searchFrom = idx + 1;
  }
}

// ─── Phase 1: 토큰 추출 & 분류 ──────────────────────────

function extractSpecs(name: string): { specs: string[]; cleaned: string } {
  const specs: string[] = [];
  const specSeen = new Set<string>();
  const matches = name.match(SPEC_PATTERN);
  if (matches) {
    for (const s of matches) {
      const trimmed = s.trim();
      const key = trimmed.toLowerCase();
      if (!specSeen.has(key)) { specSeen.add(key); specs.push(trimmed); }
    }
  }
  const cleaned = name.replace(SPEC_PATTERN, ' ');

  // 수량이 원본에 없으면 추가하지 않음 — 잘못된 수량은 오등록보다 위험
  return { specs: specs.slice(0, 4), cleaned };
}

function tokenize(name: string): string[] {
  // 괄호 내용 제거
  let cleaned = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  // 특수문자 제거 (한글/영문/숫자만 유지)
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  const seen = new Set<string>();
  return cleaned
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => {
      if (w.length < 2) return false;
      const lower = w.toLowerCase();
      if (NOISE.has(lower)) return false;
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
}

/**
 * 원본 상품명의 토큰을 카테고리별 사전과 교차 매칭하여 분류.
 * 카테고리 풀의 ingredients/features에 있고 원본에도 있어야 해당 분류로 들어감.
 */
function classifyTokens(
  originalName: string,
  categoryPath: string,
  brand: string,
): ClassifiedTokens {
  const { specs, cleaned } = extractSpecs(originalName);
  const tokens = tokenize(cleaned);
  const brandLower = brand.toLowerCase();

  // 카테고리 풀 찾기
  const pool = findBestPool(categoryPath);

  // 분류용 세트 빌드 (소문자)
  const ingredientSet = new Set(pool.ingredients.map(s => s.toLowerCase()));
  const featureSet = new Set(pool.features.map(s => s.toLowerCase()));

  // 각 풀의 모든 항목에 대해 "포함 매칭"도 수행 (부분 일치)
  const allIngredientTerms = pool.ingredients;
  const allFeatureTerms = pool.features;

  const result: ClassifiedTokens = {
    type: [],
    ingredients: [],
    features: [],
    origin: [],
    descriptors: [],
    specs,
  };

  const classified = new Set<string>();
  const originalLower = originalName.toLowerCase();

  // Pass 1: 원본에서 풀 키워드 역매칭 (풀의 긴 키워드가 원본에 포함되어 있는지)
  // 긴 키워드 우선 매칭 — "비타민C"가 "비타민"보다 먼저 매칭되어야 함
  const sortedIngredients = [...allIngredientTerms].sort((a, b) => b.length - a.length);
  const sortedFeatures = [...allFeatureTerms].sort((a, b) => b.length - a.length);

  for (const term of sortedIngredients) {
    const termLower = term.toLowerCase();
    if (classified.has(termLower)) continue;
    if (!matchesWholeUnit(originalLower, termLower)) continue;
    // 이미 매칭된 더 긴 키워드의 substring인지 확인 (예: "비타민" ⊂ "비타민C")
    let isSubOfMatched = false;
    for (const existing of classified) {
      if (existing.length > termLower.length && existing.includes(termLower)) {
        isSubOfMatched = true; break;
      }
    }
    if (isSubOfMatched) continue;
    result.ingredients.push(term);
    classified.add(termLower);
  }
  for (const term of sortedFeatures) {
    const termLower = term.toLowerCase();
    if (classified.has(termLower)) continue;
    if (!matchesWholeUnit(originalLower, termLower)) continue;
    let isSubOfMatched = false;
    for (const existing of classified) {
      if (existing.length > termLower.length && existing.includes(termLower)) {
        isSubOfMatched = true; break;
      }
    }
    if (isSubOfMatched) continue;
    result.features.push(term);
    classified.add(termLower);
  }

  // Pass 2: 토큰별 분류
  // (원산지/TYPE/FEATURE를 브랜드 체크보다 우선 — "청송농협" 브랜드 때문에 "청송"이 스킵되는 문제 방지)
  for (const token of tokens) {
    const lower = token.toLowerCase();

    // 이미 분류된 토큰 스킵
    if (classified.has(lower)) continue;

    // 원산지 (브랜드보다 우선 — "청송농협" 브랜드여도 "청송"은 원산지로 분류)
    if (ORIGINS.has(lower) || ORIGINS.has(token)) {
      result.origin.push(token);
      classified.add(lower);
      continue;
    }

    // 동의어 그룹에서 TYPE 판별 (브랜드보다 우선 — "사과"가 브랜드 부분 매칭으로 스킵되는 것 방지)
    let isType = false;
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === lower)) {
        result.type.push(token);
        classified.add(lower);
        isType = true;
        break;
      }
    }
    if (isType) continue;

    // 성분 매칭 (풀 사전 기반)
    if (ingredientSet.has(lower)) {
      result.ingredients.push(token);
      classified.add(lower);
      continue;
    }

    // 특징 매칭 (풀 사전 기반)
    if (featureSet.has(lower)) {
      result.features.push(token);
      classified.add(lower);
      continue;
    }

    // 브랜드명 제외 (위의 원산지/TYPE/성분/특징에 해당 안 하는 경우에만)
    if (lower === brandLower || brandLower.includes(lower)) continue;

    // 그 외 → 서술어
    result.descriptors.push(token);
    classified.add(lower);
  }

  // Pass 3a: 원산지 + TYPE/FEATURE 복합어 분해 ("청송사과" → "청송" origin + "사과" type)
  const descriptorsCopy = [...result.descriptors];
  for (const desc of descriptorsCopy) {
    const descLower = desc.toLowerCase();
    for (const origin of ORIGINS) {
      if (descLower.startsWith(origin) && descLower.length > origin.length) {
        const remainder = desc.slice(origin.length);
        const remainderLower = remainder.toLowerCase();
        let foundType = false;
        for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
          if (synonyms.some(s => s.toLowerCase() === remainderLower)) {
            if (!classified.has(origin)) { result.origin.push(origin); classified.add(origin); }
            if (!classified.has(remainderLower)) { result.type.push(remainder); classified.add(remainderLower); }
            const idx = result.descriptors.indexOf(desc);
            if (idx >= 0) result.descriptors.splice(idx, 1);
            foundType = true;
            break;
          }
        }
        if (foundType) break;
        if (featureSet.has(remainderLower)) {
          if (!classified.has(origin)) { result.origin.push(origin); classified.add(origin); }
          if (!classified.has(remainderLower)) { result.features.push(remainder); classified.add(remainderLower); }
          const idx = result.descriptors.indexOf(desc);
          if (idx >= 0) result.descriptors.splice(idx, 1);
          break;
        }
      }
    }
  }

  // Pass 3b: FEATURE/INGREDIENT + TYPE 복합어 분해 ("보습크림" → "보습" feat + "크림" type)
  const descriptorsCopy2 = [...result.descriptors];
  for (const desc of descriptorsCopy2) {
    const descLower = desc.toLowerCase();
    let found = false;
    // 가능한 분할점을 순회하며 접미사가 TYPE 동의어인지 확인
    for (let splitAt = 1; splitAt < descLower.length && !found; splitAt++) {
      const suffix = descLower.slice(splitAt);
      const prefix = descLower.slice(0, splitAt);
      // 접미사가 synonymGroup에 있는지 확인
      for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
        if (synonyms.some(s => s.toLowerCase() === suffix)) {
          // 접두사가 feature 또는 ingredient인지 확인
          if (featureSet.has(prefix) || ingredientSet.has(prefix)) {
            const prefixOriginal = desc.slice(0, splitAt);
            const suffixOriginal = desc.slice(splitAt);
            if (featureSet.has(prefix) && !classified.has(prefix)) {
              result.features.push(prefixOriginal); classified.add(prefix);
            } else if (ingredientSet.has(prefix) && !classified.has(prefix)) {
              result.ingredients.push(prefixOriginal); classified.add(prefix);
            }
            if (!classified.has(suffix)) {
              result.type.push(suffixOriginal); classified.add(suffix);
            }
            const idx = result.descriptors.indexOf(desc);
            if (idx >= 0) result.descriptors.splice(idx, 1);
            found = true;
            break;
          }
        }
      }
    }
  }

  return result;
}

// ─── 카테고리 풀 매칭 (세그먼트 기반) ─────────────────────

function findBestPool(categoryPath: string): CategoryPool {
  if (CATEGORY_POOLS[categoryPath]) return CATEGORY_POOLS[categoryPath];

  const segments = categoryPath.split('>').map(s => s.trim());

  let bestKey = '';
  let bestScore = 0;
  for (const key of Object.keys(CATEGORY_POOLS)) {
    const keySegments = key.split('>').map(s => s.trim());
    let matchCount = 0;
    for (let i = 0; i < Math.min(segments.length, keySegments.length); i++) {
      if (segments[i] === keySegments[i]) matchCount++;
      else break;
    }
    if (matchCount > bestScore || (matchCount === bestScore && key.length > bestKey.length)) {
      bestScore = matchCount;
      bestKey = key;
    }
  }

  if (bestScore >= 2 && bestKey) return CATEGORY_POOLS[bestKey];

  // 1레벨만 일치: 같은 대분류의 모든 풀 합침
  if (bestScore >= 1) {
    const merged: CategoryPool = { generic: [], ingredients: [], features: [] };
    const seen = { generic: new Set<string>(), ingredients: new Set<string>(), features: new Set<string>() };
    for (const key of Object.keys(CATEGORY_POOLS)) {
      if (key.split('>')[0].trim() === segments[0]) {
        const pool = CATEGORY_POOLS[key];
        for (const g of pool.generic) {
          if (!seen.generic.has(g.toLowerCase())) { seen.generic.add(g.toLowerCase()); merged.generic.push(g); }
        }
        for (const i of pool.ingredients) {
          if (!seen.ingredients.has(i.toLowerCase())) { seen.ingredients.add(i.toLowerCase()); merged.ingredients.push(i); }
        }
        for (const f of pool.features) {
          if (!seen.features.has(f.toLowerCase())) { seen.features.add(f.toLowerCase()); merged.features.push(f); }
        }
      }
    }
    if (merged.generic.length > 0) return merged;
  }

  // 매칭 실패 → 카테고리 경로에서 자동 키워드 생성
  return generatePoolFromPath(segments);
}

/** 카테고리 풀에 없는 4000+ 소분류를 커버: 경로 세그먼트에서 키워드 자동 생성 */
function generatePoolFromPath(segments: string[]): CategoryPool {
  const generic: string[] = [];
  const features: string[] = [];

  // 각 세그먼트를 generic으로 활용
  for (const seg of segments) {
    if (seg.length >= 2) generic.push(seg);
  }

  // 리프 노드에서 synonymGroups 매칭하여 동의어 추가
  const leaf = segments[segments.length - 1] || '';
  const leafLower = leaf.toLowerCase();
  for (const [key, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    const keyLower = key.toLowerCase();
    if (leafLower.includes(keyLower) || keyLower.includes(leafLower)) {
      for (const s of synonyms.slice(0, 5)) {
        if (!generic.includes(s)) generic.push(s);
      }
    }
  }

  // universalModifiers에서 보강
  for (const m of UNIVERSAL_MODIFIERS.slice(0, 15)) {
    if (!generic.includes(m)) features.push(m);
  }

  return { generic, ingredients: [], features };
}

// ─── Phase 2: 안전 확장 ─────────────────────────────────

/** 동의어 중 원본과 다른 것 반환 (TYPE/FEAT에만 사용) */
function getSynonym(word: string, rng: () => number): string {
  for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    if (synonyms.some(s => s.toLowerCase() === word.toLowerCase())) {
      const others = synonyms.filter(s => s.toLowerCase() !== word.toLowerCase());
      if (others.length > 0) {
        return others[Math.floor(rng() * others.length)];
      }
    }
  }
  return word;
}

/** 셀러별 서브셋 선택 (Fisher-Yates) */
function selectSubset<T>(items: T[], count: number, rng: () => number): T[] {
  if (items.length <= count) return [...items];
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/** Fisher-Yates 셔플 (in-place) */
function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─── Phase 3: 조합 생성 ────────────────────────────────

/**
 * 쿠팡 SEO 최적화 노출상품명 생성 v3
 *
 * 핵심 변경:
 * - 원본 상품명에서 토큰을 추출하고 분류
 * - 원본에 없는 성분/특징은 절대 추가 안 함
 * - Generic (카테고리 수준) 키워드만 자유롭게 추가
 * - 다양성: 순서/동의어/복합어/부분선택/Generic회전/스펙위치
 */
export function generateDisplayName(
  originalName: string,
  brand: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): string {
  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);

  // Phase 1: 토큰 추출 & 분류
  const classified = classifyTokens(originalName, categoryPath, brand);

  // Phase 2: 안전 확장
  const usedWords = new Set<string>();
  const allWords: string[] = [];

  // (a) TYPE: 동의어로 치환 (원본 유형 → 다른 유형명)
  for (const t of classified.type) {
    const synonym = getSynonym(t, rng);
    if (!usedWords.has(synonym.toLowerCase())) {
      allWords.push(synonym);
      usedWords.add(synonym.toLowerCase());
    }
  }

  // (b) INGREDIENTS: 원본 매칭된 성분만 (동의어 확장 1개씩)
  for (const ingr of classified.ingredients) {
    if (!usedWords.has(ingr.toLowerCase())) {
      allWords.push(ingr);
      usedWords.add(ingr.toLowerCase());
    }
    const ingrSynonym = getSynonym(ingr, rng);
    if (ingrSynonym.toLowerCase() !== ingr.toLowerCase() && !usedWords.has(ingrSynonym.toLowerCase())) {
      allWords.push(ingrSynonym);
      usedWords.add(ingrSynonym.toLowerCase());
    }
  }

  // (c) FEATURES: 원본 매칭된 특징만 (동의어 확장)
  for (const feat of classified.features) {
    if (!usedWords.has(feat.toLowerCase())) {
      allWords.push(feat);
      usedWords.add(feat.toLowerCase());
    }
    const featSynonym = getSynonym(feat, rng);
    if (featSynonym.toLowerCase() !== feat.toLowerCase() && !usedWords.has(featSynonym.toLowerCase())) {
      allWords.push(featSynonym);
      usedWords.add(featSynonym.toLowerCase());
    }
  }

  // (d) ORIGIN: 원산지 그대로
  for (const orig of classified.origin) {
    if (!usedWords.has(orig.toLowerCase())) {
      allWords.push(orig);
      usedWords.add(orig.toLowerCase());
    }
  }

  // (e) DESCRIPTORS: 서술어 일부 포함 (최대 3개)
  const selectedDesc = selectSubset(classified.descriptors, 3, rng);
  for (const desc of selectedDesc) {
    if (!usedWords.has(desc.toLowerCase())) {
      allWords.push(desc);
      usedWords.add(desc.toLowerCase());
    }
  }

  // (f) GENERIC: 카테고리 수준 키워드에서 3~5개 회전 선택 (항상 안전)
  const pool = findBestPool(categoryPath);
  {
    const genericCount = 3 + Math.floor(rng() * 3); // 3~5개
    const availableGeneric = pool.generic.filter(g => !usedWords.has(g.toLowerCase()));
    const selectedGeneric = selectSubset(availableGeneric, genericCount, rng);
    for (const g of selectedGeneric) {
      allWords.push(g);
      usedWords.add(g.toLowerCase());
    }
  }

  // (g) 복합어 생성: TYPE + INGR, FEAT + TYPE 등 (1~2개)
  if (classified.type.length > 0 && classified.ingredients.length > 0) {
    const compoundCount = 1 + Math.floor(rng() * 2); // 1~2개
    for (let i = 0; i < compoundCount; i++) {
      const t = classified.type[Math.floor(rng() * classified.type.length)];
      const ingr = classified.ingredients[Math.floor(rng() * classified.ingredients.length)];
      const compound = rng() < 0.5 ? `${ingr}${t}` : `${t}${ingr}`;
      if (!usedWords.has(compound.toLowerCase()) && compound.length <= 12) {
        allWords.push(compound);
        usedWords.add(compound.toLowerCase());
      }
    }
  }

  // (h) Universal modifiers: 2~4개 추가 — 쿠팡 SEO 다양성 확보
  if (UNIVERSAL_MODIFIERS.length > 0) {
    const modCount = 2 + Math.floor(rng() * 3); // 2~4개
    const availableMods = UNIVERSAL_MODIFIERS.filter(m => !usedWords.has(m.toLowerCase()));
    const selectedMods = selectSubset(availableMods, modCount, rng);
    for (const m of selectedMods) {
      allWords.push(m);
      usedWords.add(m.toLowerCase());
    }
  }

  // Phase 3: 중복 제거 & 셔플
  const unique: string[] = [];
  const seenFinal = new Set<string>();
  for (const w of allWords) {
    const l = w.toLowerCase();
    if (!seenFinal.has(l)) {
      seenFinal.add(l);
      unique.push(w);
    }
  }

  // 전체 셔플
  shuffle(unique, rng);

  // 스펙은 항상 맨 뒤에 배치
  const specTokens = classified.specs.filter(s => !seenFinal.has(s.toLowerCase()));
  unique.push(...specTokens);

  // 최소 단어수 보장: 6개 미만이면 Generic 추가 보충
  if (unique.length < 6) {
    const remaining = pool.generic.filter(g => !usedWords.has(g.toLowerCase()));
    const extra = selectSubset(remaining, 6 - unique.length, rng);
    for (const g of extra) {
      unique.push(g);
    }
  }

  // 100자 제한
  let result = unique.join(' ');
  if (result.length > 100) {
    const trimmed: string[] = [];
    let len = 0;
    for (const w of unique) {
      if (len + w.length + (len > 0 ? 1 : 0) > 100) break;
      trimmed.push(w);
      len += w.length + (len > 0 ? 1 : 0);
    }
    result = trimmed.join(' ');
  }

  // 규제 금지어 후처리
  const { cleanedText } = checkCompliance(result, { removeErrors: true, categoryContext: categoryPath });
  result = cleanedText || result;

  return result || originalName.slice(0, 100);
}

/**
 * 배치 노출상품명 생성
 */
export function generateDisplayNameBatch(
  products: { originalName: string; brand: string; categoryPath: string }[],
  sellerSeed: string,
): string[] {
  return products.map((p, i) => generateDisplayName(p.originalName, p.brand, p.categoryPath, sellerSeed, i));
}
