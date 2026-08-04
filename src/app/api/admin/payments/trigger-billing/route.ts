import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { ensureBillableReports } from '@/lib/payments/billable-reports';
import { kstMonthStr } from '@/lib/payments/billing-constants';
import { createNotification } from '@/lib/utils/notifications';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/payments/trigger-billing
 * 관리자가 직접 직전 마감월 청구 사이클을 복구.
 *
 * 동작:
 *   1) 직전 마감월에 monthly_report 가 없는 PT생을 추리고,
 *      api_revenue_snapshots 의 매출 데이터로 즉시 보고서 생성 (광고비=0 가정).
 *   2) fee_payment_status='awaiting_payment' 로 즉시 청구 가능 상태 마킹.
 *   3) 알림 발송 — "광고비 입력 시 수수료 차감 가능 / 미입력 시 자동 청구" 안내.
 *
 * 결제 자체는 별도 cron(매월 3일) 또는 관리자가 수동 트리거 (다른 endpoint).
 * 이 endpoint 의 목적은 "monthly_reports 미생성으로 청구 자체가 안 되는 상황" 복구.
 *
 * 안전:
 *   - signed 계약 유무 무관 — 매출 데이터 있으면 모두 보고서 생성 (운영자 판단)
 *   - 이미 보고서 있으면 skip (UNIQUE 제약)
 *   - 매출 데이터 없으면 skip + 알림
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const overrideMonth: string | undefined = body.targetMonth;
    const requireSignedContract: boolean = body.requireSignedContract !== false; // 기본 true

    const serviceClient = await createServiceClient();
    const now = new Date();
    const currentMonth = kstMonthStr(now);

    let targetMonth: string;
    if (overrideMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(overrideMonth)) {
      targetMonth = overrideMonth;
    } else {
      const [cy, cm] = currentMonth.split('-').map(Number);
      const prevM = cm === 1 ? 12 : cm - 1;
      const prevY = cm === 1 ? cy - 1 : cy;
      targetMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;
    }

    // 대상 PT 사용자 조회 (signed 필터 여부에 따라 분기, 스키마 추론 안정성 위해 별도 쿼리)
    type PtRow = { id: string; profile_id: string; share_percentage: number | null };
    let ptUsers: PtRow[] | null = null;
    if (requireSignedContract) {
      const { data, error } = await serviceClient
        .from('pt_users')
        .select('id, profile_id, created_at, share_percentage, contracts!inner(status)')
        .neq('status', 'terminated')
        .eq('is_test_account', false)
        .eq('contracts.status', 'signed');
      if (error) throw error;
      ptUsers = (data || []).map((d) => ({
        id: d.id,
        profile_id: d.profile_id,
        share_percentage: d.share_percentage,
      }));
    } else {
      const { data, error } = await serviceClient
        .from('pt_users')
        .select('id, profile_id, created_at, share_percentage')
        .neq('status', 'terminated')
        .eq('is_test_account', false);
      if (error) throw error;
      ptUsers = (data || []) as PtRow[];
    }

    if (!ptUsers || ptUsers.length === 0) {
      return NextResponse.json({
        success: true,
        targetMonth,
        created: 0,
        message: requireSignedContract
          ? 'signed 계약 PT생이 없습니다. requireSignedContract=false 로 다시 호출하면 미서명자도 포함됩니다.'
          : '대상 PT 사용자 없음',
      });
    }

    let created = 0;
    let skippedExisting = 0;
    let skippedNoRevenue = 0;
    let errored = 0;
    const createdUsers: string[] = [];

    for (const pt of ptUsers) {
      try {
        // 이미 보고서 있으면 skip
        const { data: existing } = await serviceClient
          .from('monthly_reports')
          .select('id, fee_payment_status')
          .eq('pt_user_id', pt.id)
          .eq('year_month', targetMonth)
          .maybeSingle();

        if (existing) {
          // 이미 있는데 awaiting_review 면 awaiting_payment 로 승급
          if (existing.fee_payment_status === 'awaiting_review') {
            await serviceClient
              .from('monthly_reports')
              .update({
                fee_payment_status: 'awaiting_payment',
                payment_status: 'reviewed',
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            created++;
            createdUsers.push(pt.id);
          } else {
            skippedExisting++;
          }
          continue;
        }

        // 생성은 ensureBillableReports 단일 출처 — 정산 net(total_sales)만 청구 근거로 사용하고
        // (주문액 미사용=과다청구 방지), 등록월 유예·중복 skip 이 내장돼 있다.
        let ensured;
        try {
          ensured = await ensureBillableReports(serviceClient, {
            id: pt.id,
            created_at: pt.created_at as string,
            share_percentage: pt.share_percentage ?? null,
          });
        } catch (genErr) {
          errored++;
          console.error(`[trigger-billing] ${pt.id} 보고서 생성 실패:`, genErr instanceof Error ? genErr.message : genErr);
          continue;
        }

        if (ensured.created.length === 0) {
          if (ensured.skippedExisting.length > 0) skippedExisting++;
          else skippedNoRevenue++;
          continue;
        }

        const { data: newReport } = await serviceClient
          .from('monthly_reports')
          .select('reported_revenue')
          .eq('pt_user_id', pt.id)
          .eq('year_month', ensured.created[ensured.created.length - 1])
          .maybeSingle();
        const revenue = Number(newReport?.reported_revenue) || 0;

        created += ensured.created.length;
        createdUsers.push(pt.id);

        // 알림 발송
        await createNotification(serviceClient, {
          userId: pt.profile_id,
          type: 'fee_payment',
          title: `[관리자 트리거] ${targetMonth} 매출 보고서 생성 — 자동 청구 예정`,
          message: `${targetMonth} 매출(${revenue.toLocaleString()}원) 기반 수수료가 곧 자동 청구됩니다. 광고비 첨부자료(스크린샷)를 /my/ad-cost 에서 제출하시면 승인 후 수수료가 줄어듭니다.`,
          link: '/my/ad-cost',
        });
      } catch (err) {
        errored++;
        console.error(`[trigger-billing] ${pt.id} 처리 중 예외:`, err);
        void logSystemError({ source: 'admin/payments/trigger-billing', error: err }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      targetMonth,
      totalUsers: ptUsers.length,
      created,
      skippedExisting,
      skippedNoRevenue,
      errored,
      createdUserIds: createdUsers,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/trigger-billing error:', err);
    void logSystemError({ source: 'admin/payments/trigger-billing', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
