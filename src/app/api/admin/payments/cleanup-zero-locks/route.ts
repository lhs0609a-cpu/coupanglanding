import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';

export const maxDuration = 60;

/**
 * GET /api/admin/payments/cleanup-zero-locks[?apply=true]
 *
 * 청구액 0원(수수료율 0% / 순이익≤0)인데 과거 로직으로 overdue/suspended 까지 올라가
 * 잘못 락(program_access_active=false) 걸린 케이스를 일회성 정리한다.
 *
 *  1) total_with_vat<=0 이면서 fee_payment_status ∈ {overdue, suspended} 인 리포트 → 'paid' 종결
 *  2) 그 사용자에게 '진짜 미납'(total_with_vat>0 & status ∈ {awaiting_payment,overdue,suspended})이
 *     하나도 없을 때만 program_access_active=true 로 복구 (다른 진짜 빚 있으면 락 유지)
 *
 * 기본은 dry-run(미적용, 영향 대상만 반환). ?apply=true 일 때만 실제 변경.
 * 멱등 — 여러 번 실행해도 안전.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'write');
  if (!guard.ok) return guard.response;

  const apply = req.nextUrl.searchParams.get('apply') === 'true';
  const svc = await createServiceClient();
  const nowIso = new Date().toISOString();

  // 1) 잘못 락/연체된 0원 리포트 조회
  const { data: zeroReports, error: zErr } = await svc
    .from('monthly_reports')
    .select('id, pt_user_id, year_month, total_with_vat, fee_payment_status')
    .lte('total_with_vat', 0)
    .in('fee_payment_status', ['overdue', 'suspended']);
  if (zErr) return NextResponse.json({ error: zErr.message }, { status: 500 });

  const reports = zeroReports || [];
  const affectedUserIds = [...new Set(reports.map((r) => r.pt_user_id))];

  // 2) 영향 사용자별로 '진짜 미납' 잔존 여부 판정
  const restoreUserIds: string[] = [];
  const keptLockedUserIds: string[] = [];
  for (const ptUserId of affectedUserIds) {
    const { data: genuineUnpaid } = await svc
      .from('monthly_reports')
      .select('id')
      .eq('pt_user_id', ptUserId)
      .gt('total_with_vat', 0)
      .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended'])
      .limit(1);
    if ((genuineUnpaid?.length ?? 0) === 0) restoreUserIds.push(ptUserId);
    else keptLockedUserIds.push(ptUserId);
  }

  // 현재 실제로 락(program_access_active=false) 걸린 사용자만 복구 대상으로 좁힘
  let restoreEligible: string[] = [];
  if (restoreUserIds.length > 0) {
    const { data: lockedUsers } = await svc
      .from('pt_users')
      .select('id, program_access_active')
      .in('id', restoreUserIds);
    restoreEligible = (lockedUsers || [])
      .filter((u) => u.program_access_active === false)
      .map((u) => u.id);
  }

  const summary = {
    dryRun: !apply,
    zeroReportsFound: reports.length,
    reportsResolved: reports.map((r) => ({ id: r.id, pt_user_id: r.pt_user_id, year_month: r.year_month, status: r.fee_payment_status })),
    accessRestoreCandidates: restoreEligible.length,
    accessRestoreUserIds: restoreEligible,
    keptLockedDueToRealDebt: keptLockedUserIds,
  };

  if (!apply) {
    return NextResponse.json({ ...summary, note: '미적용(dry-run). 실제 적용하려면 ?apply=true 로 다시 호출하세요.' });
  }

  // 3) 적용 — 리포트 종결
  if (reports.length > 0) {
    const { error: updErr } = await svc
      .from('monthly_reports')
      .update({ fee_payment_status: 'paid', fee_paid_at: nowIso })
      .in('id', reports.map((r) => r.id));
    if (updErr) return NextResponse.json({ error: `리포트 종결 실패: ${updErr.message}`, summary }, { status: 500 });
  }

  // 4) 적용 — 진짜 미납 없는 사용자만 접근 복구
  if (restoreEligible.length > 0) {
    const { error: accErr } = await svc
      .from('pt_users')
      .update({ program_access_active: true })
      .in('id', restoreEligible);
    if (accErr) return NextResponse.json({ error: `접근 복구 실패: ${accErr.message}`, summary }, { status: 500 });
  }

  return NextResponse.json({ ...summary, applied: true });
}
