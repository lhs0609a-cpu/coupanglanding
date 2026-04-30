// ============================================================
// 상품명 규제 준수 필터링 서비스
//
// checkCompliance()  — 텍스트 검사 + 자동 제거(error) + 위반 목록 반환
// containsForbiddenTerm() — 빠른 금지어 포함 여부 체크
// ============================================================

import {
  FORBIDDEN_CATEGORIES,
  isHouseholdCategory,
  type ForbiddenSeverity,
} from '../data/forbidden-terms';

export interface ComplianceViolation {
  label: string;
  severity: ForbiddenSeverity;
  category: string;
}

export interface ComplianceResult {
  cleanedText: string;
  violations: ComplianceViolation[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

interface ComplianceOptions {
  /** true면 error 위반 자동 제거 (기본 true) */
  removeErrors?: boolean;
  /** 카테고리 경로 (생활용품 항균/살균 false positive 방지) */
  categoryContext?: string;
  /** 카테고리 safe words (leaf 키워드 등) — 이 단어들의 부분문자열 forbidden 매칭은 무시 */
  categorySafeWords?: Set<string>;
}

// 생활용품에서 허용되는 단어
const HOUSEHOLD_ALLOWED = ['항균', '살균'];

// 도서/완구 카테고리에서 비적용되는 법규 (책 제목/장난감 카테고리는 의약/건강 효능 표시 아님)
//   예: 도서>건강 취미>고혈압 — "고혈압" 책 토픽일 뿐 효능 광고 아님
//       도서>예술치료 — "치료" 학문분야명, 효능 광고 아님
const NON_HEALTH_TOP_CATEGORIES = new Set(['도서', '도서/음반/DVD', '완구/취미', '문구/사무', '문구/오피스']);
const HEALTH_LAW_CATEGORIES = new Set(['건기식법', '화장품법', '식품표시광고법', '약사법', '의료기기법']);

// 패션 카테고리에서 "베스트(조끼)" 등 고유 명사로 쓰이는 단어 — 광고성 아님
const FASHION_ALLOWED = ['베스트']; // 의류 카테고리에서 vest = 조끼 의미
const FASHION_TOP_CATEGORIES = new Set(['패션의류잡화', '패션잡화', '명품']);

function isNonHealthCategory(categoryContext?: string): boolean {
  if (!categoryContext) return false;
  const top = categoryContext.split('>')[0]?.trim() || '';
  return NON_HEALTH_TOP_CATEGORIES.has(top);
}

function isFashionCategory(categoryContext?: string): boolean {
  if (!categoryContext) return false;
  const top = categoryContext.split('>')[0]?.trim() || '';
  return FASHION_TOP_CATEGORIES.has(top);
}

// 금지어 → 안전한 대체어 (단순 삭제 대신 문맥 유지)
const SAFE_REPLACEMENTS: Record<string, string> = {
  '최고': '좋은',
  '완벽': '꼼꼼한',
  '놀라운': '인상적인',
  '폭발적': '빠른',
  '베스트': '인기',
  '처방': '포뮬러',
  '즉효': '빠른',
  '충격': '놀랄만한',
};

/**
 * 텍스트의 규제 위반 검사 및 자동 정리
 */
export function checkCompliance(
  text: string,
  options: ComplianceOptions = {},
): ComplianceResult {
  const { removeErrors = true, categoryContext, categorySafeWords } = options;
  const isHousehold = isHouseholdCategory(categoryContext);
  const isNonHealth = isNonHealthCategory(categoryContext);
  const isFashion = isFashionCategory(categoryContext);

  let cleaned = text;
  const violations: ComplianceViolation[] = [];

  // safe word의 부분문자열로 매칭된 forbidden term 식별 (label 기준)
  //   예: leaf="세일즈"면 "세일" 매칭 → 카테고리 명칭 분쇄 → skip
  //   예: leaf="강조점"이면 "강조" 매칭 skip
  const isSubstringOfSafeWord = (label: string): boolean => {
    if (!categorySafeWords || categorySafeWords.size === 0) return false;
    const lower = label.toLowerCase();
    if (lower.length < 1) return false;
    for (const safe of categorySafeWords) {
      if (safe.length > lower.length && safe.includes(lower)) return true;
    }
    return false;
  };

  // 매칭된 substring 자체가 safe word와 정확히 일치 — 카테고리 leaf 토큰 보호
  //   예: 카테고리 "모니터 벽걸이 암" → safe={"모니터","벽걸이","암"}
  //       forbidden 패턴 /암/ 매칭 → matched="암" → safe word와 일치 → 보호
  const isMatchSafeLeaf = (matched: string): boolean => {
    if (!categorySafeWords || categorySafeWords.size === 0) return false;
    return categorySafeWords.has(matched.toLowerCase());
  };

  // 매치 위치를 감싸는 공백 단위 토큰이 safe word에 속하는지 — 부분 매칭(prefix/substring) 보호
  //   예: 텍스트 "암워머 남아 ..." 에서 /암/ 매칭 위치 0
  //       enclosing 토큰="암워머" → safe={"암워머",...} → 보호
  const isMatchInSafeToken = (matchIndex: number, matchLength: number, fullText: string): boolean => {
    if (!categorySafeWords || categorySafeWords.size === 0) return false;
    const before = fullText.slice(0, matchIndex);
    const lastSpace = before.lastIndexOf(' ');
    const tokenStart = lastSpace + 1;
    const afterIdx = matchIndex + matchLength;
    const tail = fullText.slice(afterIdx);
    const nextSpaceRel = tail.indexOf(' ');
    const tokenEnd = nextSpaceRel < 0 ? fullText.length : afterIdx + nextSpaceRel;
    const enclosing = fullText.slice(tokenStart, tokenEnd).toLowerCase();
    if (!enclosing) return false;
    return categorySafeWords.has(enclosing);
  };

  for (const cat of FORBIDDEN_CATEGORIES) {
    // 도서/완구/문구 등 비-건강 대분류는 건강·의약 관련 법규 비적용
    //   예: "도서>건강 취미>고혈압"의 "고혈압" — 책 토픽일 뿐 약효 표시 아님
    //   예: "도서>예술>예술치료"의 "치료" — 학문 분야명일 뿐 효능 표시 아님
    if (isNonHealth && HEALTH_LAW_CATEGORIES.has(cat.name)) {
      continue;
    }
    for (const term of cat.terms) {
      // 생활용품 카테고리에서 항균/살균 허용
      if (isHousehold && HOUSEHOLD_ALLOWED.includes(term.label)) {
        continue;
      }
      // 패션 카테고리에서 "베스트"는 조끼(vest)의 의미로 허용
      if (isFashion && FASHION_ALLOWED.includes(term.label)) {
        continue;
      }
      // 카테고리 leaf safe word의 부분문자열인 forbidden term은 스킵
      // (leaf="세일즈"면 "세일" 매칭으로 leaf가 분쇄되어 "즈" 잔여물 발생 → 차단)
      if (isSubstringOfSafeWord(term.label)) {
        continue;
      }

      // RegExp는 stateful(lastIndex) → 매번 새 인스턴스 생성
      const regex = new RegExp(term.pattern.source, term.pattern.flags);

      // 모든 매치 추출 — safe word/safe 토큰 매치는 보호 대상
      const allMatches = Array.from(cleaned.matchAll(regex));
      if (allMatches.length === 0) continue;

      // 매치별 안전 여부 판정
      const isSafeMatch = (m: RegExpMatchArray): boolean => {
        const matched = m[0];
        const idx = m.index ?? 0;
        return isMatchSafeLeaf(matched) || isMatchInSafeToken(idx, matched.length, cleaned);
      };

      // 모두 safe면 카테고리 leaf 보호 → 위반 기록 안 함
      const realViolationMatches = allMatches.filter(m => !isSafeMatch(m));
      if (realViolationMatches.length === 0) continue;

      violations.push({
        label: term.label,
        severity: term.severity,
        category: term.category,
      });

      if (removeErrors && term.severity === 'error') {
        const replacement = SAFE_REPLACEMENTS[term.label] || '';
        // safe 매치는 임시 마커로 치환 → strip → 마커 복원
        // 위치 기반 판정 필요하므로 replace callback에서 직접 매치 인덱스 활용
        const safeMatches: string[] = [];
        const protectedText = cleaned.replace(regex, (m: string, ...args: unknown[]) => {
          // RegExp.prototype[@@replace] 콜백: 마지막 두 인자 전 인덱스
          // 단순 g 플래그 정규식: args = [offset, fullString]
          const offset = typeof args[args.length - 2] === 'number'
            ? (args[args.length - 2] as number)
            : (args[0] as number);
          const safe = isMatchSafeLeaf(m) || isMatchInSafeToken(offset, m.length, cleaned);
          if (safe) {
            const idx = safeMatches.length;
            safeMatches.push(m);
            return `\uE000${idx}\uE001`;
          }
          return replacement;
        });
        cleaned = protectedText.replace(/\uE000(\d+)\uE001/g, (_, idx) => safeMatches[Number(idx)] ?? '');
      }
    }
  }

  // 정리: 다중 공백 → 단일, 앞뒤 공백 제거
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    cleanedText: cleaned,
    violations,
    hasErrors: violations.some((v) => v.severity === 'error'),
    hasWarnings: violations.some((v) => v.severity === 'warning'),
  };
}

/**
 * 금지어 포함 여부 빠른 체크 (SEO 풀 정리용)
 */
export function containsForbiddenTerm(text: string): boolean {
  for (const cat of FORBIDDEN_CATEGORIES) {
    for (const term of cat.terms) {
      if (term.severity !== 'error') continue;
      const regex = new RegExp(term.pattern.source, term.pattern.flags);
      if (regex.test(text)) return true;
    }
  }
  return false;
}
