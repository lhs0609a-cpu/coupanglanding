import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { getReportCosts, calculateDeposit } from '@/lib/calculations/deposit';
import { calculateVatOnTop } from '@/lib/calculations/vat';
import { logActivity } from '@/lib/utils/activity-log';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/pt-users/[id]/share-percentage
 * body: { share_percentage: number }  (0~100)
 *
 * ⚠️ 슬러그는 반드시 형제 라우트(reset-password)와 같은 `[id]` 여야 한다.
 *    같은 경로 깊이에 `[id]` 와 `[ptUserId]` 가 섞이면 Next.js 가 라우트 트리 전체를
 *    못 읽고 죽는다("You cannot use different slug names for the same dynamic path").
 *    URL 은 슬러그 이름과 무관하므로 호출부는 그대로다.
 *
 * 관리자가 수수료율(순수익 비율)을 변경. 두 가지를 한 번에 처리:
 *   1) pt_users.share_percentage 저장
 *   2) 아직 결제되지 않은(fee_payment_status='awaiting_payment') 리포트의 청구액을
 *      저장된 매출·비용은 그대로 두고 새 %로 재계산 → 이번 달 자동결제/즉시결제에 즉시 반영.
 *
 * 재계산 범위 정책:
 *   - awaiting_payment 만 재계산. paid(결제완료)는 소급 변경 금지, overdue/suspended(연체·정지)는
 *     가산금이 얽혀 있어 건드리지 않는다.
 *   - 재계산 결과 청구액 0원(0% 또는 순이익≤0)이면 청구 사이클에서 제외(paid 처리)해
 *     "0원인데 락 걸림" 버그를 방지 (monthly-report-auto-create 의 nothingToBill 로직과 동일).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // 슬러그는 [id] 지만 의미는 PT생 id — 아래 로직 이름은 그대로 둔다.
    const { id: ptUserId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const val = Number((body as { share_percentage?: unknown }).share_percentage);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      return NextResponse.json({ error: '수수료율은 0~100 사이 숫자여야 합니다.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const serviceClient = await createServiceClient();

    // 대상 PT생 확인 + 이전 값(감사 로그용)
    const { data: ptUser, error: ptErr } = await serviceClient
      .from('pt_users')
      .select('id, share_percentage')
      .eq('id', ptUserId)
      .single();
    if (ptErr || !ptUser) {
      return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });
    }
    const prevPct = ptUser.share_percentage ?? 30;

    // 1) 수수료율 저장
    const { error: updErr } = await serviceClient
      .from('pt_users')
      .update({ share_percentage: val })
      .eq('id', ptUserId);
    if (updErr) {
      return NextResponse.json({ error: '저장 실패: ' + updErr.message }, { status: 500 });
    }

    // 2) 미납(awaiting_payment) 리포트 재계산 — 저장된 매출·비용 유지, %만 새로 적용
    const { data: reports } = await serviceClient
      .from('monthly_reports')
      .select(
        'id, year_month, reported_revenue, cost_product, cost_commission, cost_advertising, cost_returns, cost_shipping, cost_tax, total_with_vat',
      )
      .eq('pt_user_id', ptUserId)
      .eq('fee_payment_status', 'awaiting_payment');

    const recomputed: Array<{ yearMonth: string; before: number; after: number }> = [];
    const nowIso = new Date().toISOString();

    for (const r of reports || []) {
      const revenue = r.reported_revenue || 0;
      const costs = getReportCosts(r);
      const deposit = calculateDeposit(revenue, costs, val);
      const vat = calculateVatOnTop(deposit);
      const nothingToBill = vat.totalWithVat <= 0;

      const { error: rUpdErr } = await serviceClient
        .from('monthly_reports')
        .update({
          calculated_deposit: deposit,
          admin_deposit_amount: deposit,
          supply_amount: vat.supplyAmount,
          vat_amount: vat.vatAmount,
          total_with_vat: vat.totalWithVat,
          // 청구액 0원이면 청구 사이클에서 제외 (락 방지)
          ...(nothingToBill
            ? { fee_payment_status: 'paid', fee_paid_at: nowIso, fee_payment_deadline: null }
            : {}),
        })
        .eq('id', r.id);

      if (!rUpdErr) {
        recomputed.push({
          yearMonth: r.year_month,
          before: Number(r.total_with_vat) || 0,
          after: vat.totalWithVat,
        });
      }
    }

    // 감사 로그 (실패해도 본 작업은 성공 처리)
    await logActivity(serviceClient, {
      adminId: user!.id,
      action: 'update_settings',
      targetType: 'pt_user',
      targetId: ptUserId,
      details: {
        field: 'share_percentage',
        before: prevPct,
        after: val,
        recomputedReports: recomputed,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      share_percentage: val,
      recomputedCount: recomputed.length,
      recomputed,
    });
  } catch (err) {
    void logSystemError({ source: 'admin/pt-users/share-percentage', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
