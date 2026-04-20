// ============================================================
// 노출상품명(displayProductName) SEO 최적화 생성기 v4.4
//
// v4.4 변경사항:
//   - pool.generic 주입 완전 제거 — 원본 상품명 + 카테고리 경로만 사용
//   - 4000+ 소분류 카테고리에서 무관한 키워드 주입 원천 차단
//   - 패딩: 남은 descriptors → 카테고리 경로 → universalModifiers
//
// v4.3 변경사항:
//   - 도서/미디어 카테고리 TYPE 오분류 방지: 비상품 카테고리에서 synonym TYPE 매칭 스킵
//   - TYPE 동의어 확장 카테고리 관련성 검사: 카테고리 경로에 관련 키워드가 없으면 확장 안 함
//     (예: "라이트"→"조명" 확장이 도서/캠핑 카테고리에서 발생하지 않음)
//   - Pass 1 브랜드 누출 방지: 역매칭 시 브랜드명과 동일한 풀 키워드 스킵
//   - 오염 2,771→~0건, 브랜드 누출 102→0건 타겟
//
// v4.2 변경사항:
//   - 오염 방지 필터 개선: 기능성 수식어(보습/저자극/대용량) false positive 제거
//   - 카테고리 경로 allowlist: 경로에 포함된 단어는 오염으로 판정하지 않음
//   - 패딩 강화: universalModifiers 활용 + 카테고리 리프명 TYPE 자동 추가
//   - 서브워드 중복 방지: "IT 전문서" + "IT 모바일" → "IT" 2회 감지
//   - 평균 길이 39→46자 타겟 개선
//
// 리셀러 최적 전략 (브랜드 미포함 — 아이템위너 리스크 방지):
//   구조: [성분 2-3] [특징 2-3] [유형] [서술어 1-2] [카테고리KW 2] [원산지] [스펙]
//   - 브랜드 미포함 (리셀러 → IP 리스크)
//   - 핵심 키워드 모바일 40자 내 노출
//   - 타겟 45~60자 (검색 커버리지 ↔ 스터핑 균형)
//   - 동일 단어 최대 2회
//   - 홍보성/과장 수식어 금지
//
// Phase 1: 원본 상품명에서 토큰 추출 & 분류
//   - TYPE:  [바디워시]         ← 상품 유형
//   - INGR:  [알로에베라, 레몬]  ← 성분 (팩트)
//   - FEAT:  [유기농, 바이오]    ← 특징 (팩트)
//   - ORIG:  [이탈리아]         ← 원산지
//   - DESC:  [150년, 명품]      ← 서술어
//   - SPEC:  [500ml]           ← 스펙
//
// Phase 2: 구조적 배치 (고정 순서, 브랜드 제외)
//   [성분 2-3] → [특징 2-3] → [유형 1-2] → [서술어 1-2]
//   → [카테고리 키워드 2] → [원산지] → [스펙]
//
// 다양성: 시드 기반 서브셋 선택 (성분/특징/서술어/Generic)
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

export interface ClassifiedTokens {
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
const UNIVERSAL_MODIFIERS: string[] = seoData.universalModifiers || [];

// ─── 비상품 카테고리 (도서/미디어) ─────────────────────────
// 이 대분류에서는 상품명에 "에센스", "라이트", "크림" 등이 있어도
// 화장품/식품/가전 TYPE으로 분류하지 않는다 (동음이의어 방지).
const NON_PRODUCT_TOP = new Set(['도서', '도서/음반/DVD']);

// ─── 상수 ────────────────────────────────────────────────

// "개월분?" / "일분" / "주분" 은 반드시 "개" 보다 앞에 위치해야 부분매칭 방지.
// "개" 뒤에 "입|월|월분|년"이 오면 수량이 아닌 서술어("N개입", "N개월", "N개월분")이므로 제외.
// "kg/g" 앞에 숫자 소수점 허용 (2.74kg 같은 값 보존).
const SPEC_PATTERN = /\d+(?:\.\d+)?\s*(개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개(?!입|월|년)|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

const NOISE = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '추천', '인기', '베스트', '상품상세참조', '상세페이지참조', '상페참조',
  '참조', '상세참조', '페이지참조',
]);

// 광고 모델 / 연예인 / 인플루언서 이름 — 노출상품명에 포함 시 IP 리스크
const CELEBRITY_NAMES = new Set([
  // 건강기능식품·홈쇼핑 광고 모델
  '이서진', '정우성', '전지현', '손예진', '공유', '김연아', '박서준',
  '송중기', '이민호', '차은우', '김수현', '현빈', '박보검', '송혜교',
  '유재석', '이광수', '김종국', '하하', '강호동', '이승기', '임영웅',
  '장민호', '영탁', '이찬원', '김희선', '고현정', '김태희', '한가인',
  '전현무', '백종원', '안성재', '류수영', '정해인', '위너', '방탄소년단',
  '블랙핑크', '아이유', '수지', '설현', '아이린', '제니', '지수',
]);

/** 토큰 분할 전에 제거할 복합 구문 (공백 포함 패턴) */
const NOISE_PHRASES = /상세\s*페이지\s*참조|상품\s*상세\s*참조|상세\s*설명\s*참조|본문\s*참조|상페\s*참조|이미지\s*참조/gi;

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

// ─── 브랜드 누출 후처리 (n-gram 기반) ────────────────────

/**
 * 생성 완료된 노출상품명에서 브랜드 누출 토큰을 제거한다.
 *
 * classifyTokens + addToken의 2중 필터를 통과한 누출 케이스 방어:
 *   - 브랜드의 3자+ 연속 부분이 토큰에 포함된 경우 (ex: "한국씨엔에스팜" → "씨엔에스")
 *   - 브랜드 서브토큰이 descriptor로 빠져나온 경우
 *
 * 원산지(ORIGINS), 스펙(숫자), 1-2자 토큰은 false positive 방지로 스킵.
 */
function removeBrandLeaks(displayName: string, brand: string): string {
  if (!brand || brand.length < 2) return displayName;

  const brandLower = brand.toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
  if (brandLower.length < 2) return displayName;

  // 브랜드에서 3자 이상의 n-gram 추출
  const brandNgrams = new Set<string>();
  for (let len = 3; len <= brandLower.length; len++) {
    for (let i = 0; i <= brandLower.length - len; i++) {
      brandNgrams.add(brandLower.slice(i, i + len));
    }
  }
  // 브랜드 서브토큰 (공백/슬래시 기반 분할)
  for (const sub of brand.toLowerCase().split(/[\s\/·]+/).filter(s => s.length >= 2)) {
    brandNgrams.add(sub);
  }

  const tokens = displayName.split(/\s+/);
  const cleaned = tokens.filter(token => {
    // 1-2자, 숫자(스펙), 원산지는 스킵 (false positive 방지)
    if (token.length <= 2) return true;
    if (/^\d/.test(token)) return true;
    if (ORIGINS.has(token.toLowerCase()) || ORIGINS.has(token)) return true;

    const tokenLower = token.toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
    if (tokenLower.length < 3) return true;

    // 토큰이 브랜드 n-gram과 3자 이상 겹치면 누출로 판정
    for (const ng of brandNgrams) {
      if (ng.length >= 3 && tokenLower.includes(ng)) return false;
      if (ng.length >= 3 && ng.includes(tokenLower)) return false;
    }
    return true;
  });

  return cleaned.join(' ');
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
  // "상세페이지 참조" 등 복합 구문 제거 (토큰 분할 전)
  let cleaned = name.replace(NOISE_PHRASES, ' ');
  // 괄호 내용 제거
  cleaned = cleaned.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  // 특수문자 제거 (한글/영문/숫자만 유지)
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  const seen = new Set<string>();
  return cleaned
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => {
      if (w.length < 2) return false;
      // 단위 없는 순수 숫자 토큰 차단 — "793", "2024" 같은 의미 불명 잔여물 제거
      //   (단위가 붙은 스펙은 extractSpecs에서 이미 분리됨)
      if (/^\d+$/.test(w)) return false;
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
export function classifyTokens(
  originalName: string,
  categoryPath: string,
  brand: string,
): ClassifiedTokens {
  const { specs, cleaned } = extractSpecs(originalName);
  const tokens = tokenize(cleaned);
  const brandLower = brand.toLowerCase();
  // 브랜드명을 서브토큰으로도 분해 (예: "안국건강" → ["안국건강"], "LG생활건강" → ["lg생활건강", "lg", "생활건강"])
  const brandSubTokens = new Set<string>();
  if (brandLower.length >= 2) {
    brandSubTokens.add(brandLower);
    // 공백/특수문자로 분리된 서브토큰
    for (const sub of brandLower.split(/[\s\/·]+/).filter(s => s.length >= 2)) {
      brandSubTokens.add(sub);
    }
  }

  // v4.3: 비상품 카테고리 판별 (도서/미디어 → synonym TYPE 매칭 스킵)
  const topCategory = categoryPath.split('>')[0]?.trim() || '';
  const isNonProductCategory = NON_PRODUCT_TOP.has(topCategory);

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
    // v4.3+: 브랜드명/서브토큰과 동일한 풀 키워드 스킵
    if (brandSubTokens.has(termLower)) continue;
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
    // v4.3+: 브랜드명/서브토큰과 동일한 풀 키워드 스킵
    if (brandSubTokens.has(termLower)) continue;
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
    // v4.3: 비상품 카테고리(도서)에서는 synonym TYPE 매칭 스킵
    //   "에센스 영문법" → "에센스"를 화장품 TYPE으로 오분류하지 않음
    //   "라이트 노벨" → "라이트"를 조명 TYPE으로 오분류하지 않음
    if (!isNonProductCategory) {
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
    }

    // 브랜드 필터 (양방향 + 서브토큰)
    if (brandSubTokens.has(lower) || brandLower.includes(lower) ||
        lower.includes(brandLower) ||
        (brandLower.length >= 2 && lower.startsWith(brandLower) && lower.length <= brandLower.length + 3)) continue;

    // 연예인/모델명 필터 — IP 리스크 방지
    if (CELEBRITY_NAMES.has(token)) continue;

    // 성분 매칭 (풀 사전 기반) — 브랜드 제외 후 실행
    if (ingredientSet.has(lower)) {
      result.ingredients.push(token);
      classified.add(lower);
      continue;
    }

    // 특징 매칭 (풀 사전 기반) — 브랜드 제외 후 실행
    if (featureSet.has(lower)) {
      result.features.push(token);
      classified.add(lower);
      continue;
    }

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

export function findBestPool(categoryPath: string): CategoryPool {
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

  // 각 세그먼트를 generic으로 활용
  for (const seg of segments) {
    if (seg.length >= 2) generic.push(seg);
  }

  // synonymGroup 동의어 추가 제거 — 오분류 위험
  return { generic, ingredients: [], features: [] };
}

// ─── Phase 2: 구조적 배치 도우미 ────────────────────────

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

// ─── Phase 3: 구조적 SEO 배치 ──────────────────────────

const TARGET_MIN_CHARS = 50;
const TARGET_MAX_CHARS = 70;
const HARD_MAX_CHARS = 100;

/**
 * 쿠팡 SEO 최적화 노출상품명 생성 v4.1
 *
 * 리셀러 최적 전략:
 *   [성분 2-3] [특징 2-3] [상품유형] [서술어 1-2] [카테고리키워드 2] [원산지] [스펙]
 *
 * - 브랜드 미포함 (리셀러 → 아이템위너 리스크 방지)
 * - 성분/특징: 원본에서 추출한 것만 (허위 정보 방지)
 * - 카테고리 키워드 2개로 검색 커버리지 확보
 * - 타겟 45~60자 (너무 짧으면 검색 노출 ↓, 너무 길면 스터핑)
 * - 동일 단어 최대 2회, 홍보성 수식어 미사용
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

  // Phase 2: 구조적 SEO 배치 (브랜드 제외)
  const parts: string[] = [];
  const usedWords = new Set<string>();
  // 서브워드 중복 방지: "IT 전문서" + "IT 모바일" → "IT" 중복 감지
  const usedSubWords = new Map<string, number>();

  // 브랜드 서브토큰 세트 (classifyTokens와 동일 로직)
  const brandLowerGen = brand.toLowerCase();
  const brandSubTokensGen = new Set<string>();
  if (brandLowerGen.length >= 2) {
    brandSubTokensGen.add(brandLowerGen);
    for (const sub of brandLowerGen.split(/[\s\/·]+/).filter(s => s.length >= 2)) {
      brandSubTokensGen.add(sub);
    }
  }

  const addToken = (word: string): boolean => {
    const lower = word.toLowerCase();
    if (usedWords.has(lower)) return false;
    // 2차 방어: 브랜드/연예인이 descriptor로 빠져나온 경우 차단
    if (brandSubTokensGen.has(lower) || brandLowerGen.includes(lower) || lower.includes(brandLowerGen)) return false;
    if (CELEBRITY_NAMES.has(word)) return false;
    // 서브워드 중복 체크: 개별 단어가 이미 사용되었으면 스킵
    const subWords = lower.split(/[\/\s]+/).filter(w => w.length >= 2);
    for (const sw of subWords) {
      if ((usedSubWords.get(sw) || 0) >= 1) return false;
      // 한글 부분문자열 중복 감지: "캡슐"이 있으면 "캡슐에"도 중복
      for (const [existing] of usedSubWords) {
        if (existing.length >= 2 && sw.length >= 2) {
          if (sw.includes(existing) || existing.includes(sw)) return false;
        }
      }
    }
    usedWords.add(lower);
    for (const sw of subWords) {
      usedSubWords.set(sw, (usedSubWords.get(sw) || 0) + 1);
    }
    parts.push(word);
    return true;
  };

  // ① 핵심 성분 (INGREDIENTS) — 원본에서 추출, 최대 3개
  const ingrToUse = selectSubset(classified.ingredients, 3, rng);
  for (const ingr of ingrToUse) {
    addToken(ingr);
  }

  // ② 핵심 특징 (FEATURES) — 원본에서 추출, 최대 3개
  const featToUse = selectSubset(classified.features, 3, rng);
  for (const feat of featToUse) {
    addToken(feat);
  }

  // ③ 상품 유형 (TYPE) — 메인 키워드 + 동의어 1개
  const categoryPathLower = categoryPath.toLowerCase();
  for (const t of classified.type.slice(0, 2)) {
    addToken(t);
    // TYPE 동의어 추가 (검색 커버리지 확장: 크림→페이스크림 등)
    // v4.3: 카테고리 관련성 검사 — 카테고리 경로에 그룹키나 타입이 없으면 확장 스킵
    //   "라이트" TYPE → "조명" 그룹 → 카테고리 "캠핑>랜턴"에 "조명" 없음 → 확장 안 함
    //   "크림" TYPE → "크림" 그룹 → 카테고리 "뷰티>스킨>크림"에 "크림" 있음 → 확장 함
    for (const [groupKey, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === t.toLowerCase())) {
        const groupKeyLower = groupKey.toLowerCase();
        const tLower = t.toLowerCase();
        // 카테고리 경로에 그룹키 또는 타입 토큰이 포함되어야 확장
        if (!categoryPathLower.includes(groupKeyLower) && !categoryPathLower.includes(tLower)) {
          break; // 관련 없는 카테고리 → synonym 확장 스킵
        }
        const others = synonyms.filter(s => s.toLowerCase() !== tLower && !usedWords.has(s.toLowerCase()));
        if (others.length > 0) {
          addToken(others[Math.floor(rng() * others.length)]);
        }
        break;
      }
    }
  }

  // ④ 서술어 (DESCRIPTORS) — 최대 2개
  if (classified.descriptors.length > 0) {
    const descToUse = selectSubset(classified.descriptors, 2, rng);
    for (const d of descToUse) {
      addToken(d);
    }
  }

  // ⑤b 카테고리 리프명 → TYPE 자동 추가 (TYPE 토큰이 없을 때)
  // 16,259 카테고리 중 73%가 synonymGroup에 없어서 TYPE 누락 → 리프명으로 보완
  if (classified.type.length === 0) {
    const leafName = categoryPath.split('>').pop()?.trim() || '';
    if (leafName.length >= 2) {
      addToken(leafName);
    }
  }

  // ⑥ 원산지 (ORIGIN) — 최대 1개
  for (const orig of classified.origin.slice(0, 1)) {
    addToken(orig);
  }

  // ── 45~60자 타겟 맞추기 (스펙 추가 전) ─────────────────

  // 스펙은 별도 보관 → 패딩 후 맨 뒤에 붙임 (서브워드 중복도 검사)
  const specTokens: string[] = [];
  for (const s of classified.specs.slice(0, 3)) {
    const lower = s.toLowerCase();
    if (usedWords.has(lower)) continue;
    // 서브워드 중복 체크 (addToken과 동일 로직)
    const subs = lower.split(/[\/\s]+/).filter(w => w.length >= 2);
    let overlap = false;
    for (const sw of subs) {
      if ((usedSubWords.get(sw) || 0) >= 1) { overlap = true; break; }
      for (const [existing] of usedSubWords) {
        if (existing.length >= 2 && sw.length >= 2) {
          if (sw.includes(existing) || existing.includes(sw)) { overlap = true; break; }
        }
      }
      if (overlap) break;
    }
    if (overlap) continue;
    usedWords.add(lower);
    for (const sw of subs) usedSubWords.set(sw, (usedSubWords.get(sw) || 0) + 1);
    specTokens.push(s);
  }

  // 스펙 포함 예상 길이 계산
  const specStr = specTokens.join(' ');
  const specLen = specStr.length > 0 ? specStr.length + 1 : 0; // +1 for space

  const targetWithoutSpec = TARGET_MIN_CHARS - specLen;

  // 45자 미만이면 패딩 (남은 descriptors → 경로세그먼트 → universalModifiers)
  if (parts.join(' ').length < targetWithoutSpec) {
    // 패딩 소스 1: 원본 상품명의 남은 descriptors (가장 관련성 높음)
    const remainingDesc = classified.descriptors.filter(d => !usedWords.has(d.toLowerCase()));
    for (const d of remainingDesc) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(d);
    }
  }

  if (parts.join(' ').length < targetWithoutSpec) {
    // 패딩 소스 2: 카테고리 경로 세그먼트
    const catSegments = categoryPath.split('>').map(s => s.trim()).filter(s => s.length >= 2);
    for (const seg of catSegments) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(seg);
    }
  }

  if (parts.join(' ').length < targetWithoutSpec) {
    // 패딩 소스 3: universalModifiers — SEO 검색 커버리지 확장
    const availableMods = UNIVERSAL_MODIFIERS.filter(m => !usedWords.has(m.toLowerCase()));
    const modPicks = selectSubset(availableMods, 4, rng);
    for (const m of modPicks) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(m);
    }
  }

  // ⑦ 스펙 — 맨 뒤 고정
  parts.push(...specTokens);

  let result = parts.join(' ');

  // 70자 초과면 뒤에서부터 축약 (스펙은 유지)
  if (result.length > HARD_MAX_CHARS) {
    const trimmed: string[] = [];
    let len = 0;
    for (const w of parts) {
      if (len + w.length + (len > 0 ? 1 : 0) > HARD_MAX_CHARS) break;
      trimmed.push(w);
      len += w.length + (len > 0 ? 1 : 0);
    }
    result = trimmed.join(' ');
  }

  // 브랜드 누출 후처리 안전망 — n-gram 기반 부분 음절 매칭
  result = removeBrandLeaks(result, brand);

  // 규제 금지어 후처리
  const { cleanedText } = checkCompliance(result, { removeErrors: true, categoryContext: categoryPath });
  result = cleanedText || result;

  // fallback: 생성 실패 시 원본 사용 — 노이즈 구문은 반드시 제거
  if (!result) {
    result = originalName
      .replace(NOISE_PHRASES, ' ')
      .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ')
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !NOISE.has(w.toLowerCase()))
      .join(' ')
      .slice(0, HARD_MAX_CHARS);
  }

  return result || originalName.slice(0, HARD_MAX_CHARS);
}

/**
 * 노출상품명의 꼬리 spec을 추출된 구매옵션 값으로 재동기화한다.
 *
 * 문제: display name은 원본 상품명의 literal 토큰("60캡슐, 2개", "2.74kg")을 그대로 꼬리에 붙이지만,
 *       실제 쿠팡에 전송되는 옵션 값은 option-extractor가 정규화/통합한 값("60정, 1개", "2740g, 1개")이라
 *       노출상품명과 옵션값이 불일치하는 경우가 발생한다.
 *
 * 해결: 노출상품명 꼬리의 spec 토큰을 제거하고 옵션 값 기반 canonical spec string으로 대체한다.
 *
 * @param displayName — generateDisplayName 결과
 * @param buyOptions — extractOptionsEnhanced().buyOptions (정제된 옵션값)
 */
export function syncDisplayNameWithOptions(
  displayName: string,
  buyOptions: { name: string; value: string; unit?: string }[],
): string {
  if (!displayName || buyOptions.length === 0) return displayName;

  // 꼬리에서 SPEC 토큰 제거 (공백·콤마 포함)
  // "프로틴 2kg, 1개" → "프로틴"
  // 한글 콤마 decimal(2,74kg)도 포함하도록 콤마 허용
  const stripRegex = /(?:\s|,)*(?:\d+(?:[.,]\d+)?\s*(?:개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개(?!입|월|년)|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)[,\s]*)+$/i;
  let stripped = displayName.replace(stripRegex, '').trim();
  // 추가: 방금 제거된 spec 앞에 "2,", "3, " 같은 낙오 조각(한글 콤마 decimal 잔여)이 있으면 제거
  stripped = stripped.replace(/[,\s]*\d{1,3}\s*,?\s*$/, '').trim();

  // canonical spec 빌드 — choose1 우선(용량/중량/캡슐/정), 그 다음 수량
  const parts: string[] = [];
  const specPriority = ['용량', '캡슐', '정', '중량'];
  for (const key of specPriority) {
    const opt = buyOptions.find(o => {
      const n = o.name.replace(/\s+/g, '');
      return n.includes(key);
    });
    if (opt && opt.value) {
      parts.push(`${opt.value}${opt.unit || ''}`);
      break;
    }
  }
  const countOpt = buyOptions.find(o => o.name.replace(/\s+/g, '') === '수량' || o.name.replace(/\s+/g, '') === '총수량');
  if (countOpt && countOpt.value) {
    parts.push(`${countOpt.value}${countOpt.unit || '개'}`);
  }

  if (parts.length === 0) return stripped || displayName;

  const canonicalSpec = parts.join(', ');
  const result = stripped ? `${stripped} ${canonicalSpec}` : canonicalSpec;

  // HARD_MAX_CHARS(70) 초과 시 자르기
  return result.length > 70 ? result.slice(0, 70) : result;
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
