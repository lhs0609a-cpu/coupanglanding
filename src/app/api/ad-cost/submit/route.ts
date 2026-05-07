import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  validateAdCostAmount,
  getNextAttemptNo,
  getPreviousMonthYM,
} from '@/lib/payments/ad-cost';

export const maxDuration = 30;


/**
 * POST /api/ad-cost/submit
 * 광고비 제출 (직전 달, screenshot URL 동봉)
 *
 * Body: { yearMonth?: 'YYYY-MM' (default 직전 달), amount: number, screenshotUrl: string }
 *
 * 검증:
 *   1. 매출 200% 초과 → 거부
 *   2. 같은 월에 approved/missed/locked 있으면 거부
 *   3. pending 있으면 거부 (검토 대기 중)
 *   4. 이전 attempt 모두 rejected → attempt_no+1 로 신규 행 생성 (max 2)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 없음' }, { status: 404 });

    const body = await request.json();
    const yearMonth: string = body.yearMonth || getPreviousMonthYM();
    const amount = Number(body.amount);
    const screenshotUrl: string = body.screenshotUrl;

    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: '광고비 금액이 올바르지 않습니다' }, { status: 400 });
    }
    if (!screenshotUrl || typeof screenshotUrl !== 'string') {
      return NextResponse.json({ error: '광고비 스크린샷이 필요합니다' }, { status: 400 });
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      return NextResponse.json({ error: 'yearMonth 형식 오류 (YYYY-MM)' }, { status: 400 });
    }

    // 매출 조회 (api_revenue_snapshots 우선)
    const serviceClient = await createServiceClient();
    const { data: snap } = await serviceClient
      .from('api_revenue_snapshots')
      .select('total_sales')
      .eq('pt_user_id', ptUser.id)
      .eq('year_month', yearMonth)
      .maybeSingle();
    const monthlyRevenue = Number(snap?.total_sales) || 0;

    // 과대청구 가드
    const validation = validateAdCostAmount(amount, monthlyRevenue);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.reason, ratio: validation.ratio },
        { status: 400 },
      );
    }

    // 재제출 체크
    const attempt = await getNextAttemptNo(serviceClient, ptUser.id, yearMonth);
    if (!attempt.canSubmit) {
      return NextResponse.json({ error: attempt.reason || '제출할 수 없습니다' }, { status: 409 });
    }

    const { data: inserted, error: insErr } = await serviceClient
      .from('ad_cost_submissions')
      .insert({
        pt_user_id: ptUser.id,
        year_month: yearMonth,
        amount: Math.round(amount),
        screenshot_url: screenshotUrl,
        attempt_no: attempt.nextAttemptNo,
        status: 'pending',
      })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      submission: inserted,
      warning: validation.level === 'warn' ? validation.reason : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '제출 실패' },
      { status: 500 },
    );
  }
}
