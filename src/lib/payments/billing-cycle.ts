/**
 * 청구 사이클 월 계산 — 단일 출처(single source of truth).
 *
 * 정책: **net-driven rolling**. 고정 오프셋(M-1/M-2)이 아니라, 각 유저의
 * "아직 청구 안 된 과거월 중 정산 net>0인 달"을 전부 청구한다.
 *   - net=0(정산 미확정/무매출)인 달은 건너뛰고, 다음 사이클에 net 확정되면 자동으로 주워진다.
 *   - 주문액(total_sales_orders, 반품 차감 전)은 절대 청구 근거로 쓰지 않는다(과다청구 방지).
 * 이렇게 하면 쿠팡 정산 지연과 무관하게 확정분만·누락 없이 청구된다.
 *
 * 실제 리포트 생성은 `ensureBillableReports`(billable-reports.ts)가 이 헬퍼로 후보월을 구해 수행.
 */
import { kstNow } from './billing-constants';
import { getFirstEligibleMonth, getNextMonth } from '@/lib/utils/settlement';

/** KST 기준 현재월에서 monthOffset 개월 이동한 'YYYY-MM' */
function kstYearMonthOffset(now: Date, monthOffset: number): string {
  const kst = kstNow(now);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + monthOffset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 청구 상한월 = 전월(M-1, KST). 당월(진행중)은 매출이 안 끝났으니 청구 안 함.
 * 관리자 화면의 "이번 청구 사이클(직전 마감월)" 헤드라인 표시에도 사용.
 */
export function getBillableThroughMonth(now: Date = new Date()): string {
  return kstYearMonthOffset(now, -1);
}

/**
 * net-driven rolling 청구 후보월 목록 = 등록 다음 달(getFirstEligibleMonth) ~ 전월(M-1).
 * 각 월은 호출부에서 net>0 & 리포트 미존재일 때만 실제 생성/청구한다.
 * (등록월 유예는 시작월이 등록 다음 달이라 자동 반영됨.)
 */
export function getBillableCandidateMonths(createdAt: string, now: Date = new Date()): string[] {
  if (!createdAt) return [];
  const first = getFirstEligibleMonth(createdAt); // 'YYYY-MM'
  const through = getBillableThroughMonth(now);   // 'YYYY-MM' (M-1)
  const out: string[] = [];
  let ym = first;
  // 문자열 'YYYY-MM' 사전식 비교. 안전장치로 최대 24개월.
  for (let i = 0; i < 24 && ym <= through; i++) {
    out.push(ym);
    ym = getNextMonth(ym);
  }
  return out;
}

/**
 * 이번 사이클 납부 마감일 = 당월+1 개월의 3일 23:59:59 KST → UTC ISO.
 * rolling 로 이번에 생성되는 모든 리포트(과거 backlog 포함)에 공통 적용 →
 * 오래 밀린 달도 즉시 연체·페널티 처리되지 않고 공정한 유예를 받는다.
 */
export function getCurrentCycleDeadlineISO(now: Date = new Date()): string {
  const kst = kstNow(now);
  // KST 23:59:59 = UTC 14:59:59. 당월(0-indexed)+1 의 3일. Date.UTC 가 월 오버플로 처리.
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 3, 14, 59, 59)).toISOString();
}
