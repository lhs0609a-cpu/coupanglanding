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
  const { removeErrors = true, categoryContext } = options;
  const isHousehold = isHouseholdCategory(categoryContext);
  const isNonHealth = isNonHealthCategory(categoryContext);
  const isFashion = isFashionCategory(categoryContext);

  let cleaned = text;
  const violations: ComplianceViolation[] = [];

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

      // RegExp는 stateful(lastIndex) → 매번 새 인스턴스 생성
      const regex = new RegExp(term.pattern.source, term.pattern.flags);

      if (regex.test(cleaned)) {
        violations.push({
          label: term.label,
          severity: term.severity,
          category: term.category,
        });

        if (removeErrors && term.severity === 'error') {
          const removeRegex = new RegExp(term.pattern.source, term.pattern.flags);
          const replacement = SAFE_REPLACEMENTS[term.label] || '';
          cleaned = cleaned.replace(removeRegex, replacement);
        }
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
