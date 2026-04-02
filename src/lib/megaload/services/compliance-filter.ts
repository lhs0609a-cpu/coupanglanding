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

  let cleaned = text;
  const violations: ComplianceViolation[] = [];

  for (const cat of FORBIDDEN_CATEGORIES) {
    for (const term of cat.terms) {
      // 생활용품 카테고리에서 항균/살균 허용
      if (isHousehold && HOUSEHOLD_ALLOWED.includes(term.label)) {
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
