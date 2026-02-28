/**
 * 한국 원화 포맷 (예: ₩1,234,567)
 */
export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}

/**
 * 숫자만 포맷 (예: 1,234,567)
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

/**
 * 원화 입력 파싱 (콤마 제거)
 */
export function parseKRW(value: string): number {
  return parseInt(value.replace(/[^\d-]/g, ''), 10) || 0;
}

/**
 * year_month 포맷 (예: "2026-02" → "2026년 2월")
 */
export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `${year}년 ${parseInt(month)}월`;
}

/**
 * 현재 year_month 반환 (예: "2026-02")
 */
export function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 퍼센트 포맷 (예: 30.00 → "30%")
 */
export function formatPercent(value: number): string {
  return `${value % 1 === 0 ? Math.floor(value) : value.toFixed(1)}%`;
}

/**
 * ISO 날짜 → 한국 날짜 (예: "2026-02-28T12:00:00" → "2026.02.28")
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}
