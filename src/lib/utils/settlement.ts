/**
 * 정산 주기 관리 유틸리티
 * - 전월 매출을 익월 3일까지 보고
 * - 등록 월 유예 (등록 월 건너뜀)
 * - D-day 카운트다운
 */

export type SettlementStatus = 'not_eligible' | 'pending' | 'submitted' | 'completed' | 'overdue';

/** "2026-03" → "2026-02" */
export function getPreviousMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // month is 0-indexed, so m-1 is current, m-2 is previous
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-02" → "2026-03" */
export function getNextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m, 1); // m is already next month (0-indexed: m-1+1 = m)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 현재 3월 → "2026-02" (보고 대상 = 전월) */
export function getReportTargetMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return getPreviousMonth(`${year}-${month}`);
}

/** 1월15일 등록 → "2026-02" (등록 월 건너뜀, 첫 대상 = 등록 다음 달) */
export function getFirstEligibleMonth(createdAt: string): string {
  const d = new Date(createdAt);
  const regMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return getNextMonth(regMonth);
}

/** "2026-02" → 2026-03-03 (보고 마감일 = 다음달 3일) */
export function getSettlementDeadline(yearMonth: string): Date {
  const next = getNextMonth(yearMonth);
  const [y, m] = next.split('-').map(Number);
  // 익월 3일: m은 1-indexed, Date 생성자 month는 0-indexed
  return new Date(y, m - 1, 3, 23, 59, 59);
}

/** D-day 계산: 양수=남은일, 0=당일, 음수=지연 */
export function getSettlementDDay(yearMonth: string): number {
  const deadline = getSettlementDeadline(yearMonth);
  const now = new Date();
  // 날짜만 비교 (시간 제거)
  const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = deadlineDate.getTime() - todayDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** 해당 월이 정산 대상인지 확인 */
export function isEligibleForMonth(createdAt: string, yearMonth: string): boolean {
  const firstEligible = getFirstEligibleMonth(createdAt);
  // yearMonth >= firstEligible 이고, 미래 월이 아닌지 확인
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return yearMonth >= firstEligible && yearMonth < currentYM;
}

/** D-day 포맷: 15→"D-15", 0→"D-Day!", -2→"D+2 (지연)" */
export function formatDDay(dday: number): string {
  if (dday > 0) return `D-${dday}`;
  if (dday === 0) return 'D-Day!';
  return `D+${Math.abs(dday)} (지연)`;
}

/** D-day 색상 클래스 */
export function getDDayColorClass(dday: number): string {
  if (dday > 7) return 'text-green-600 bg-green-50';
  if (dday > 3) return 'text-yellow-600 bg-yellow-50';
  if (dday > 0) return 'text-orange-600 bg-orange-50';
  if (dday === 0) return 'text-red-600 bg-red-50';
  return 'text-red-800 bg-red-100'; // 지연
}

/** 정산 상태 판정 */
export function getSettlementStatus(
  createdAt: string,
  reportStatus: string | null,
  yearMonth: string,
): SettlementStatus {
  if (!isEligibleForMonth(createdAt, yearMonth)) return 'not_eligible';
  if (!reportStatus || reportStatus === 'pending' || reportStatus === 'rejected') {
    const dday = getSettlementDDay(yearMonth);
    return dday < 0 ? 'overdue' : 'pending';
  }
  if (reportStatus === 'confirmed') return 'completed';
  // submitted, reviewed, deposited → 처리 중
  return 'submitted';
}

/** 마감일 포맷: "2026.03.31" */
export function formatDeadline(yearMonth: string): string {
  const deadline = getSettlementDeadline(yearMonth);
  const y = deadline.getFullYear();
  const m = String(deadline.getMonth() + 1).padStart(2, '0');
  const d = String(deadline.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

// --- Feature 2: 관리자 정산 지연 상태 ---

export type AdminSettlementStatus =
  | 'not_applicable'  // 미제출 또는 이미 confirmed
  | 'on_time'         // 마감일 전, 처리 여유 있음
  | 'admin_pending'   // 마감일 지남, 아직 미확인 (≤graceDays)
  | 'admin_overdue';  // 마감일 graceDays+ 초과, 미확인

export function getAdminSettlementStatus(
  yearMonth: string,
  reportStatus: PaymentStatus | null,
  graceDays = 5,
): AdminSettlementStatus {
  // 미제출, 반려, 또는 이미 확인된 경우
  if (!reportStatus || reportStatus === 'pending' || reportStatus === 'rejected' || reportStatus === 'confirmed') {
    return 'not_applicable';
  }

  // submitted, reviewed, deposited → 관리자 처리 대기 상태
  const dday = getSettlementDDay(yearMonth);

  if (dday >= 0) return 'on_time';
  if (Math.abs(dday) <= graceDays) return 'admin_pending';
  return 'admin_overdue';
}

export type PaymentStatus = 'pending' | 'submitted' | 'reviewed' | 'deposited' | 'confirmed' | 'rejected';

// --- Feature 3: 첫 정산 합산 구간 ---

export interface SettlementPeriod {
  start: string;  // 'YYYY-MM-DD'
  end: string;    // 'YYYY-MM-DD'
  isInitial: boolean;
}

/** 정산 구간 계산 — 첫 대상월이면 등록일~말일, 이후는 1일~말일 */
export function getSettlementPeriod(createdAt: string, yearMonth: string): SettlementPeriod {
  const firstEligible = getFirstEligibleMonth(createdAt);
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  if (yearMonth === firstEligible) {
    const d = new Date(createdAt);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start, end, isInitial: true };
  }

  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end, isInitial: false };
}

/** "1/15 ~ 2/28" 포맷 */
export function formatSettlementPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
}
