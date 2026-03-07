import type { TrendDataPoint } from '@/lib/supabase/types';

export type PeriodOption = '1m' | '3m' | '6m' | '1y';

export interface PeriodConfig {
  label: string;
  months: number;
  periodType: 'day' | 'week' | 'month';
  cacheTTLHours: number;
}

export const PERIOD_OPTIONS: Record<PeriodOption, PeriodConfig> = {
  '1m': { label: '1개월', months: 1, periodType: 'day', cacheTTLHours: 1 },
  '3m': { label: '3개월', months: 3, periodType: 'week', cacheTTLHours: 6 },
  '6m': { label: '6개월', months: 6, periodType: 'week', cacheTTLHours: 6 },
  '1y': { label: '1년', months: 12, periodType: 'month', cacheTTLHours: 24 },
};

/**
 * 기간에 따른 시작/종료 날짜를 계산
 */
export function getDateRange(period: PeriodOption): { startDate: string; endDate: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // 어제까지 (DataLab은 당일 데이터 없음)

  const start = new Date(end);
  start.setMonth(start.getMonth() - PERIOD_OPTIONS[period].months);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * DataLab API에서 받은 raw 결과를 차트용 데이터포인트로 변환
 */
export function transformDatalabResponse(
  results: Array<{ period: string; ratio: number }>,
): TrendDataPoint[] {
  return results.map((item) => ({
    period: item.period,
    ratio: Math.round(item.ratio * 100) / 100,
  }));
}

/**
 * 날짜 문자열을 짧은 포맷으로 변환 (차트 X축 레이블용)
 */
export function formatChartDate(dateStr: string, periodType: 'day' | 'week' | 'month'): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (periodType === 'month') {
    return `${d.getFullYear()}.${String(month).padStart(2, '0')}`;
  }
  return `${month}/${day}`;
}

/**
 * 최대/최소 ratio 포인트 찾기
 */
export function findPeakAndTrough(points: TrendDataPoint[]): {
  peak: TrendDataPoint | null;
  trough: TrendDataPoint | null;
} {
  if (points.length === 0) return { peak: null, trough: null };

  let peak = points[0];
  let trough = points[0];

  for (const p of points) {
    if (p.ratio > peak.ratio) peak = p;
    if (p.ratio < trough.ratio) trough = p;
  }

  return { peak, trough };
}

/**
 * 트렌드 방향 계산 (최근 vs 이전 평균 비교)
 */
export function calculateTrendDirection(points: TrendDataPoint[]): 'up' | 'down' | 'stable' {
  if (points.length < 4) return 'stable';

  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);

  const avgFirst = firstHalf.reduce((s, p) => s + p.ratio, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, p) => s + p.ratio, 0) / secondHalf.length;

  const diff = ((avgSecond - avgFirst) / avgFirst) * 100;

  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}
