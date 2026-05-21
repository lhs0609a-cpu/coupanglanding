// ============================================================
// v2 풀 리졸버 — 실데이터(네이버 자동완성 + 검색광고) 기반
//
// seo-keyword-pools-v2.json은 16,259 카테고리에 대해 네이버 자동완성/검색량
// 실데이터에서 추출한 검색 매칭 키워드 모음.
//
// 데이터 품질이 충분한 카테고리에 한해 v2 풀 사용,
// 그 외에는 기존 v1 풀(seo-keyword-pools.json)로 fallback.
//
// 데이터 품질 기준 (modifier ≥2 OR monthlyVolume>0 OR topRelated≥1):
//   - 풍부:   3,462개 (21.3%) — modifier ≥3 + 검색량 데이터
//   - 최소:   4,919개 (30.3%) — modifier ≥2
//   - 부족:   7,878개 (48.5%) — fallback to v1
// ============================================================

import v2Data from '../data/seo-keyword-pools-v2.json';

export interface V2Pool {
  leafBase: string;
  modifiers: string[];
  longTail: string[];
  synonyms: string[];
  banned: string[];
  monthlyVolume: number;
  topRelated: { kw: string; vol: number; comp: string }[];
  hasVolumeData: boolean;
  lengthMin: number;
  lengthMax: number;
}

const POOL_DATA = v2Data as unknown as Record<string, V2Pool>;

// ─── 검색 의도(비속성) 키워드 차단 ──────────────────────────
// v2 풀은 네이버 자동완성/검색광고 실데이터라 "오징어 데치기", "건오징어 가격",
// "건어물도매", "코스트코오징어", "홍삼정과먹는법" 같은 검색 질의가 modifier로 섞인다.
// 이들은 검색 키워드일 뿐 상품명 수식어가 아니므로(레시피/가격/유통점/효능/보관 등)
// v1 풀로 변환할 때 제거한다. 16,259 풀 중 2,243개에 잔존(modifier의 7.0%).
//
// 주의: 짧고 모호한 토큰("시세"→"시세이도", "칼로리"→"저칼로리")은 substring 매칭 시
//       오제거되므로 EXACT(정확 일치)와 SUB(명백한 복합어)를 분리한다.

// 정확 일치(소문자) — 단독 등장 시 비속성
const SEARCH_INTENT_EXACT = new Set<string>([
  '가격', '시세', '도매', '소매', '효능', '효과', '부작용', '보관', '금어기',
  '제철', '제철시기', '유통기한', '종류', '차이', '차이점', '손질', '데치기',
  '삶기', '굽기', '만들기', '레시피', '사용법', '먹는법', '먹는방법',
  '보관법', '보관방법', '손질법', '손질방법', '고르는법', '씻는법',
  '끓이는법', '삶는법', '찌는법', '볶는법', '굽는법', '데치는법', '조리법',
  '만드는법', '후기', '추천', '순위', '비교', '맛집', '맛없', '맛있게', '칼로리',
]);

// substring 차단 — 토큰에 포함되면 비속성(복합 검색질의/유통점명). 모두 3자+ 비모호.
const SEARCH_INTENT_SUBSTRING = [
  // 유통점/마켓 명
  '코스트코', '다이소', '이마트', '홈플러스', '롯데마트', '트레이더스',
  '노브랜드', '마켓컬리', '하나로마트', '백화점', '편의점', '아울렛', '면세점',
  // 레시피/조리법(복합) — "에프굽는법", "호박고구마삶는법" 등 leaf+조리법 복합 포함
  '만들기', '만드는법', '끓이는법', '삶는법', '찌는법', '데치는법', '볶는법',
  '굽는법', '졸이는법', '조리는법', '무치는법', '부치는법', '데우는법',
  '익히는법', '우리는법', '절이는법', '조리법', '레시피', '먹는법', '먹는방법',
  // 정보성 질의(복합)
  '보관법', '보관방법', '손질법', '손질방법', '고르는법', '씻는법',
  '효능', '부작용', '유통기한', '금어기', '도매',
  // how-to 동사 일반형 — "버리는법/읽는법/묶는법/떼는법/타는법…" 전부 검색질의.
  //   정상 명사("맞춤법/문법/헌법/민법")에는 "는법" 연쇄가 없어 오제거 안 됨.
  '는법',
  // 설치/폐기/관리 질의 (가구·가전·생활)
  '분리수거', '셀프시공', '시공법', '세척법', '청소법', '설치법', '조립법',
  '분해법', '장단점',
];

// 칼로리: "저칼로리/고칼로리/무칼로리"는 정상 다이어트 속성이므로 보존
const CALORIE_WHITELIST = new Set<string>(['저칼로리', '고칼로리', '무칼로리']);

/** 토큰이 검색 의도(비속성) 키워드인지 판정 */
function isSearchIntentToken(token: string): boolean {
  const t = token.toLowerCase().trim();
  if (!t) return false;
  if (SEARCH_INTENT_EXACT.has(t)) return true;
  if (t.includes('칼로리') && !CALORIE_WHITELIST.has(t)) return true;
  for (const s of SEARCH_INTENT_SUBSTRING) {
    if (t.includes(s)) return true;
  }
  return false;
}

/**
 * 카테고리 path → v2 풀 (데이터 품질 충분한 경우만).
 * 데이터 부족 시 null 반환 → 호출자가 v1 fallback.
 */
export function getV2Pool(categoryPath: string): V2Pool | null {
  const v = POOL_DATA[categoryPath];
  if (!v) return null;
  // 데이터 품질 검사
  const hasModifiers = (v.modifiers?.length || 0) >= 2;
  const hasVolume = (v.monthlyVolume || 0) > 0;
  const hasRelated = (v.topRelated?.length || 0) > 0;
  if (!hasModifiers && !hasVolume && !hasRelated) return null;
  return v;
}

/**
 * v2 풀을 v1 CategoryPool 형식으로 변환 (display-name-generator 호환).
 *
 * - features: modifiers (실데이터 형용사/속성)
 * - generic:  longTail + topRelated.kw (검색 매칭 토큰)
 * - ingredients: 비움 (v2는 성분 분리 안 함)
 *
 * 호출자는 기존 풀 사용처에 그대로 drop-in 가능.
 */
export function v2ToV1Pool(v2: V2Pool): {
  generic: string[];
  ingredients: string[];
  features: string[];
} {
  // 풀 자신의 banned + 전역 검색 의도 필터 — 둘 다 통과해야 채택
  // (이전 버그: v2.banned가 전혀 적용되지 않아 "가격" 등이 modifier로 누출됨)
  const bannedSet = new Set((v2.banned || []).map(b => b.toLowerCase().trim()));
  const isAllowed = (kw: string): boolean => {
    const lower = kw.toLowerCase().trim();
    if (!lower) return false;
    if (bannedSet.has(lower)) return false;
    if (isSearchIntentToken(kw)) return false;
    return true;
  };

  const longTailKws = (v2.longTail || []).map(s => s);
  const relatedKws = (v2.topRelated || []).map(r => r.kw);
  // longTail 우선, 그 다음 topRelated. 중복 제거 + 검색 의도/banned 제거
  const generic: string[] = [];
  const seen = new Set<string>();
  for (const kw of [...longTailKws, ...relatedKws]) {
    const lower = kw.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (!isAllowed(kw)) continue;
    generic.push(kw);
    if (generic.length >= 8) break;
  }

  return {
    generic,
    ingredients: [], // v2는 성분 분리 안 함
    features: (v2.modifiers || []).filter(isAllowed).slice(0, 10),
  };
}

/**
 * 카테고리 path → v2 데이터 풍부도.
 *  - 'rich': modifier ≥3 + 검색량 데이터 (풍부)
 *  - 'minimal': modifier ≥2 (최소 사용 가능)
 *  - 'fallback': 데이터 부족 → v1 사용 권장
 */
export function getDataQuality(categoryPath: string): 'rich' | 'minimal' | 'fallback' {
  const v = POOL_DATA[categoryPath];
  if (!v) return 'fallback';
  const modCount = v.modifiers?.length || 0;
  const hasVolume = (v.monthlyVolume || 0) > 0 || (v.topRelated?.length || 0) > 0;
  if (modCount >= 3 && hasVolume) return 'rich';
  if (modCount >= 2) return 'minimal';
  return 'fallback';
}
