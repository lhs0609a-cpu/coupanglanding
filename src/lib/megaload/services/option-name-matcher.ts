/**
 * 옵션명 정규화 & 매칭 — 네이버 옵션명 ↔ 쿠팡 옵션명 매칭
 */

export interface OptionStockStatus {
  optionName: string;
  status: 'in_stock' | 'sold_out';
}

/** 옵션명 정규화: 공백/특수문자 제거, 소문자화 */
export function normalizeOptionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '');
}

/** 두 옵션 세트 매칭 (정규화 → 완전매칭 → 부분포함 폴백) */
export function matchOptions(
  naverOptions: OptionStockStatus[],
  coupangOptionNames: string[],
): Map<string, OptionStockStatus> {
  const result = new Map<string, OptionStockStatus>();
  const normalizedNaver = naverOptions.map(o => ({
    ...o,
    normalized: normalizeOptionName(o.optionName),
  }));

  for (const cpgName of coupangOptionNames) {
    const cpgNorm = normalizeOptionName(cpgName);

    // 1차: 완전매칭
    const exact = normalizedNaver.find(n => n.normalized === cpgNorm);
    if (exact) {
      result.set(cpgName, exact);
      continue;
    }

    // 2차: 부분포함 매칭
    const partial = normalizedNaver.find(
      n => cpgNorm.includes(n.normalized) || n.normalized.includes(cpgNorm),
    );
    if (partial) {
      result.set(cpgName, partial);
    }
  }

  return result;
}

export interface OptionChange {
  optionName: string;
  before: 'in_stock' | 'sold_out';
  after: 'in_stock' | 'sold_out';
}

/** 옵션별 상태 변경 감지 */
export function detectOptionChanges(
  before: OptionStockStatus[],
  after: OptionStockStatus[],
): OptionChange[] {
  const changes: OptionChange[] = [];
  const beforeMap = new Map(before.map(o => [normalizeOptionName(o.optionName), o]));

  for (const a of after) {
    const normName = normalizeOptionName(a.optionName);
    const b = beforeMap.get(normName);
    if (b && b.status !== a.status) {
      changes.push({ optionName: a.optionName, before: b.status, after: a.status });
    }
  }

  return changes;
}
