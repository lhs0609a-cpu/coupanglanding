/**
 * 품절 모니터링 재조회 스케줄 — 단일 출처.
 * ---------------------------------------------------------------------------
 * 조회 경로가 둘(도우미 앱 → /api/megaload/desktop/results, 서버 크론 → stock-monitor-engine)인데
 * 예전엔 도우미 경로만 next_check_at 을 배정하고 서버 경로는 last_checked_at 만 갱신했다.
 * 두 스케줄러가 서로 다른 기준으로 도니 같은 상품이 경로에 따라 전혀 다른 주기를 받았다.
 * → 여기 한 곳에서만 주기를 정하고 양쪽이 같이 쓴다.
 *
 * ⚠️ 아래 상수는 "이상적인 감시 주기"가 아니라 "실제 조회 용량에 맞춘 예산 배분"이다.
 *   2026-08-10 프로덕션 실측:
 *     - 활성 모니터 18,605건, 전 경로 합계 처리량 약 8,500건/일
 *     - 구 티어(in_stock 12h / error 1.5h / unknown 2h)가 요구하는 양은 약 60,000건/일 = 7배 초과
 *   초과 구독 상태의 due 큐에서는 "가장 짧은 주기"가 큐를 독식한다. 그래서 실제로는
 *   error+unknown 이 보유 44% 로 용량의 67% 를 먹고, in_stock 은 48% 보유에 27%,
 *   재입고 감시가 필요한 sold_out 은 390건에 하루 64회(=6일 주기)만 받았다.
 *
 *   고정 주기를 실패에 주는 한 이 쏠림은 반드시 재발한다 → 실패는 지수 백오프로 뒤로 민다.
 */

/** 실패 누적 단계별 재조회 간격(분). index = check_backoff_level. */
export const BACKOFF_MINUTES = [360, 360, 1440, 4320, 10080, 43200]; // 6h · 6h · 24h · 72h · 7d · 30d
export const MAX_BACKOFF_LEVEL = BACKOFF_MINUTES.length - 1;

/** 정상 상태별 기본 주기(분). */
const TIER_MINUTES = {
  /** 가격추종 켜진 상품 — 가격 변동을 따라가야 하므로 짧게. */
  in_stock_price_follow: 180, // 3h
  /**
   * 일반 판매중. 12h → 48h.
   *
   * 8,944건이라 12h 면 이것만으로 17,888건/일이 되어 감당이 안 된다. 48h 로 두면 4,472건/일.
   * "하루 안에 전부 볼 필요는 없다"(사용자 확정)는 전제에서 나온 값이다 — 판매중 상품이
   * 갑자기 품절될 확률보다, 큐가 밀려 **아무것도 제때 못 보는** 쪽이 훨씬 큰 손해였다.
   * 실측 당시 in_stock 실효 주기는 67.8시간이었으므로 48h 는 현실 대비 개선이다.
   */
  in_stock: 2880, // 48h
  /**
   * 품절 — 여기만큼은 짧게 간다.
   * 재입고 감지는 곧 매출이고, 390건뿐이라 6h 로 둬도 하루 1,560건이면 충분히 싸다.
   * 반대로 "품절인데 우리는 판매중"은 오버셀이라 돈이 아니라 사고로 이어진다.
   */
  sold_out: 360, // 6h
  /** 원본이 내려간 상품 — 되살아날 일이 드물다. 24h → 72h. */
  removed: 4320, // 72h
} as const;

export type ScheduleStatus = 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error' | string;

/**
 * 실패면 백오프 단계를 한 칸 올리고, 성공하면 0 으로 되돌린다.
 *
 * consecutive_errors 와 분리한 이유: 저쪽은 transient/infra 를 일부러 세지 않는다
 * (IP·인프라 문제로 모니터가 영구 비활성화되는 사고를 막으려고). 그래서 조회 주기 계산에는
 * 쓸 수 없었고 — 실측상 error 6,280건 전부 consecutive_errors=0 이었다 — 결과적으로
 * "영구히 실패하는 상품이 영구히 최우선"이 됐다. 이 카운터는 오직 조회 주기용이라
 * transient 도 센다. 대신 성공 한 번이면 즉시 0 으로 리셋되므로 IP 회복 시 바로 정상 복귀한다.
 */
export function nextBackoffLevel(status: ScheduleStatus, currentLevel: number | null | undefined): number {
  if (status === 'error' || status === 'unknown') {
    return Math.min((currentLevel || 0) + 1, MAX_BACKOFF_LEVEL);
  }
  return 0;
}

/**
 * 다음 조회 시각(ISO). ±25% full-jitter 로 "정확히 N시간마다" 패턴을 깨 봇 탐지를 완화한다
 * (결정론적 주기는 그 자체로 탐지 신호가 된다).
 */
export function computeNextCheckAt(
  status: ScheduleStatus,
  priceFollowEnabled: boolean,
  backoffLevel: number,
): string {
  let minutes: number;
  switch (status) {
    case 'in_stock':
      minutes = priceFollowEnabled ? TIER_MINUTES.in_stock_price_follow : TIER_MINUTES.in_stock;
      break;
    case 'sold_out': minutes = TIER_MINUTES.sold_out; break;
    case 'removed':  minutes = TIER_MINUTES.removed; break;
    case 'unknown':
    case 'error':
      minutes = BACKOFF_MINUTES[Math.min(Math.max(backoffLevel, 1), MAX_BACKOFF_LEVEL)];
      break;
    default: minutes = TIER_MINUTES.in_stock;
  }
  const jittered = minutes * (0.75 + Math.random() * 0.5);
  return new Date(Date.now() + jittered * 60_000).toISOString();
}

/**
 * 스케줄 관련 update 필드를 한 번에 만든다 — 두 경로가 같은 컬럼 집합을 쓰도록 강제.
 */
export function scheduleUpdateFields(
  status: ScheduleStatus,
  priceFollowEnabled: boolean,
  currentLevel: number | null | undefined,
): { check_backoff_level: number; next_check_at: string } {
  const level = nextBackoffLevel(status, currentLevel);
  return {
    check_backoff_level: level,
    next_check_at: computeNextCheckAt(status, priceFollowEnabled, level),
  };
}
