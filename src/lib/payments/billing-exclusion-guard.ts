import type { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * 결제 제외 활성 PT생인지 단일 체크.
 * billing_excluded_until 이 오늘 이후(D-Day 포함)면 true.
 *
 * 호출자: 락/연체 마킹/접근 정지 같은 "PT생에게 불리한 작업"을 하기 전 가드.
 * 결제 제외는 관리자 정책이라 자동 시스템이 그걸 덮어쓰면 안 된다.
 */
export async function isBillingExcluded(
  serviceClient: ServiceClient,
  ptUserId: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from('pt_users')
    .select('billing_excluded_until')
    .eq('id', ptUserId)
    .maybeSingle();
  if (!data) return false;
  const row = data as { billing_excluded_until?: string | null };
  if (!row.billing_excluded_until) return false;
  const today = new Date().toISOString().slice(0, 10);
  return row.billing_excluded_until >= today;
}

/**
 * 결제 제외 활성 PT생 ID 집합을 한 번에 조회.
 * fee-payment-check 같은 배치 cron 에서 "한 번 가져와서 모든 보고서 필터링" 패턴에 사용.
 */
export async function getBillingExcludedPtUserIds(
  serviceClient: ServiceClient,
): Promise<Set<string>> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await serviceClient
    .from('pt_users')
    .select('id')
    .not('billing_excluded_until', 'is', null)
    .gte('billing_excluded_until', today);
  const set = new Set<string>();
  for (const row of (data || []) as Array<{ id: string }>) set.add(row.id);
  return set;
}
