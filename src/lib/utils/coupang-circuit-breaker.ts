import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Coupang API circuit breaker
 *
 * 목적: IP 미등록 등 영구 차단 상태 셀러를 cron에서 무한 retry해 비용 폭증하는 문제 차단.
 *
 * 동작:
 *   - 403 IP 차단 응답 → 6시간 backoff (다음 cron 24회 skip)
 *   - 401 인증 실패 → 24시간 backoff (키 재발급 필요)
 *   - 기타 에러 → 1시간 backoff (일시 장애 가정)
 *   - 성공 호출 → 카운터 리셋 + 차단 해제
 */

const IP_BLOCK_PATTERNS = [
  'not allowed for this request',     // Coupang IP whitelist 표준 메시지
  'ip address',
  'forbidden',
];

const AUTH_FAIL_PATTERNS = [
  'invalid access key',
  'unauthorized',
  '401',
];

export type BlockReason = 'ip_blocked' | 'auth_failed' | 'transient' | null;

export function classifyError(message: string): BlockReason {
  const lower = message.toLowerCase();
  if (IP_BLOCK_PATTERNS.some((p) => lower.includes(p))) return 'ip_blocked';
  if (AUTH_FAIL_PATTERNS.some((p) => lower.includes(p))) return 'auth_failed';
  return 'transient';
}

const BACKOFF_HOURS: Record<Exclude<BlockReason, null>, number> = {
  ip_blocked: 6,
  auth_failed: 24,
  transient: 1,
};

const ERROR_LABEL: Record<Exclude<BlockReason, null>, string> = {
  ip_blocked: 'IP 미등록 — 쿠팡 Wing에 209.71.88.111 등록 필요',
  auth_failed: 'API 키 만료/오류 — 키 재발급 필요',
  transient: '일시 오류 — 1시간 후 자동 재시도',
};

/**
 * vendor 호출 실패 기록. cron 다음 실행 시 skip 대상이 됨.
 *
 * @param ptUserId - pt_users.id
 * @param errorMessage - 원본 에러 메시지 (분류용)
 */
export async function recordCoupangApiFailure(
  serviceClient: SupabaseClient,
  ptUserId: string,
  errorMessage: string,
): Promise<void> {
  const reason = classifyError(errorMessage);
  if (!reason) return;

  const backoffMs = BACKOFF_HOURS[reason] * 60 * 60 * 1000;
  const blockedUntil = new Date(Date.now() + backoffMs).toISOString();

  // 현재 카운트 조회 후 +1
  const { data: cur } = await serviceClient
    .from('pt_users')
    .select('coupang_api_error_count')
    .eq('id', ptUserId)
    .single();

  const newCount = ((cur?.coupang_api_error_count as number | undefined) || 0) + 1;

  await serviceClient
    .from('pt_users')
    .update({
      coupang_api_error_count: newCount,
      coupang_api_blocked_until: blockedUntil,
      coupang_api_last_error: `${ERROR_LABEL[reason]} (${errorMessage.slice(0, 200)})`.slice(0, 500),
    })
    .eq('id', ptUserId);
}

/**
 * vendor 호출 성공 기록. circuit breaker 해제.
 */
export async function clearCoupangApiBlock(
  serviceClient: SupabaseClient,
  ptUserId: string,
): Promise<void> {
  await serviceClient
    .from('pt_users')
    .update({
      coupang_api_error_count: 0,
      coupang_api_blocked_until: null,
      coupang_api_last_error: null,
    })
    .eq('id', ptUserId);
}

/**
 * cron 진입 시 호출 — 차단되지 않은 셀러 ID 집합 반환.
 * 사용법: query 결과를 이 함수로 필터링하면 차단 셀러 자동 제외.
 */
export async function filterUnblockedPtUserIds(
  serviceClient: SupabaseClient,
  ptUserIds: string[],
): Promise<Set<string>> {
  if (ptUserIds.length === 0) return new Set();
  const { data } = await serviceClient
    .from('pt_users')
    .select('id, coupang_api_blocked_until')
    .in('id', ptUserIds);

  const now = Date.now();
  const allowed = new Set<string>();
  for (const row of (data || []) as Array<{ id: string; coupang_api_blocked_until: string | null }>) {
    const blocked = row.coupang_api_blocked_until && new Date(row.coupang_api_blocked_until).getTime() > now;
    if (!blocked) allowed.add(row.id);
  }
  return allowed;
}
