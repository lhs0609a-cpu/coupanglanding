import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/utils/notifications';

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

/**
 * 인증 실패 — **키를 다시 발급받아야 풀리는** 상태. 재시도로는 절대 안 풀린다.
 * ⚠️ 'revoked' / 'expired' 가 빠져 있었다(실측 2026-09-07). 쿠팡이 돌려주는
 *   "(403) Specified key is revoked." 와 "(401) Hmac key is expired." 중 앞엣것이
 *   어느 패턴에도 안 맞아 transient(1시간 뒤 재시도)로 떨어졌고, 그래서 셀러 한 명당
 *   오류가 31회·26회까지 쌓이도록 매시간 헛되이 두드렸다. 키가 폐기된 계정은
 *   1억 번을 불러도 같은 답이 온다 — 사람이 재발급해야 끝난다.
 */
const AUTH_FAIL_PATTERNS = [
  'invalid access key',
  'unauthorized',
  '401',
  'revoked',
  'expired',
  'invalid signature',
  'hmac',
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
    .select('coupang_api_error_count, coupang_api_last_error, profile_id')
    .eq('id', ptUserId)
    .single();

  const prev = cur as {
    coupang_api_error_count?: number;
    coupang_api_last_error?: string | null;
    profile_id?: string | null;
  } | null;
  const newCount = (prev?.coupang_api_error_count || 0) + 1;

  await serviceClient
    .from('pt_users')
    .update({
      coupang_api_error_count: newCount,
      coupang_api_blocked_until: blockedUntil,
      coupang_api_last_error: `${ERROR_LABEL[reason]} (${errorMessage.slice(0, 200)})`.slice(0, 500),
    })
    .eq('id', ptUserId);

  /**
   * 키를 다시 발급해야만 풀리는 상태면 **셀러 본인에게 알린다.**
   * ---------------------------------------------------------------------------
   * ★ 왜 필요한가(실측 2026-09-07): 키가 폐기된 셀러 둘의 매출이 7월부터 안 잡히고 있었는데,
   *   화면은 빈칸만 보여 주고 아무에게도 알리지 않았다. 셀러는 자기 매출이 안 잡히는 줄
   *   몰랐고, 관리자는 "왜 매출이 안 뜨지"에서 멈췄다. 재발급은 **셀러만 할 수 있는 일**이라
   *   본인에게 닿지 않으면 영원히 안 풀린다.
   * ★ 한 사건에 한 번만 보낸다. 이전 오류가 이미 같은 인증 실패면 보내지 않는다 —
   *   매시간 같은 알림이 쌓이면 아무도 안 읽는다. 성공하면 clearCoupangApiBlock 이
   *   last_error 를 지우므로, 다음에 또 끊기면 그때 다시 한 번 간다.
   * ★ 알림 실패가 차단 기록을 되돌리지는 않는다(위 update 는 이미 끝났다).
   */
  if (reason === 'auth_failed' && prev?.profile_id) {
    const alreadyNotified = (prev.coupang_api_last_error || '').includes(ERROR_LABEL.auth_failed);
    if (!alreadyNotified) {
      try {
        await createNotification(serviceClient, {
          userId: prev.profile_id,
          type: 'system',
          title: '쿠팡 API 키를 다시 발급해 주세요',
          message:
            '쿠팡에서 API 키가 더 이상 유효하지 않다고 응답하고 있어 매출 자동 수집이 멈췄습니다. '
            + '쿠팡 윙 → 판매자정보(추가판매정보)에서 OPEN API 키를 다시 발급받아 메가로드에 등록해 주세요. '
            + '등록하시면 자동으로 다시 수집됩니다.',
          link: '/my/settings',
        });
      } catch { /* 알림 실패가 차단 기록을 무르게 하지 않는다 */ }
    }
  }
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
