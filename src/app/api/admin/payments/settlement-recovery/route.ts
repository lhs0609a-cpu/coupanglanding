import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * 정산 후처리 누락 복구 — settlement_completed_at IS NULL 인 유료 리포트에 대해
 * completeSettlement 를 재실행한다.
 *
 * 배경: payment_mark_success RPC 가 monthly_reports.payment_status='confirmed' 를 atomic
 * 으로 마킹했는데, 이전 completeSettlement 가드가 그 컬럼을 idempotent guard 로 사용해서
 * 항상 0건 매칭으로 후처리(revenue/trainer/세금계산서) 가 skip 되던 시스템급 버그가 있었음.
 * 마이그레이션 후에도 과거 누락분은 자동 보충되지 않으므로 본 엔드포인트로 수동 복구.
 *
 * GET  : 누락된 리포트 목록 조회 (read 권한)
 * POST : { reportIds?: string[], limit?: number } — 특정 ID 또는 전체(limit 만큼) 일괄 처리 (write 권한)
 *
 * 멱등성: completeSettlement 자체가 각 단계별 idempotent guard 를 가지므로 재호출 안전.
 *         Vercel 함수 타임아웃(60s) 고려하여 기본 limit=20.
 */

const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'read');
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      MAX_BATCH_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50),
    );

    const serviceClient = await createServiceClient();

    const { data: pending, error } = await serviceClient
      .from('monthly_reports')
      .select('id, pt_user_id, year_month, fee_payment_status, payment_status, total_with_vat, payment_confirmed_at, fee_paid_at')
      .is('settlement_completed_at', null)
      .eq('fee_payment_status', 'paid')
      .order('fee_paid_at', { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 사용자명 join
    const ptUserIds = [...new Set((pending || []).map((r) => r.pt_user_id))];
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, profiles:profile_id(full_name, email)')
      .in('id', ptUserIds);

    type PtUserRow = {
      id: string;
      profile_id: string;
      profiles: { full_name: string | null; email: string | null } | null;
    };
    const ptUserMap = new Map<string, { fullName: string | null; email: string | null }>();
    for (const pu of (ptUsers || []) as unknown as PtUserRow[]) {
      ptUserMap.set(pu.id, {
        fullName: pu.profiles?.full_name ?? null,
        email: pu.profiles?.email ?? null,
      });
    }

    return NextResponse.json({
      reports: (pending || []).map((r) => ({
        ...r,
        pt_user: ptUserMap.get(r.pt_user_id) || null,
      })),
      total: (pending || []).length,
      hasMore: (pending || []).length === limit,
    });
  } catch (err) {
    console.error('GET /api/admin/payments/settlement-recovery error:', err);
    void logSystemError({ source: 'admin/payments/settlement-recovery', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const guard = await requireAdminRole(supabase, user?.id, 'write');
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const reportIds: unknown = body.reportIds;
    const limitRaw: unknown = body.limit;

    const limit = Math.min(
      MAX_BATCH_LIMIT,
      Math.max(1, typeof limitRaw === 'number' ? Math.floor(limitRaw) : DEFAULT_BATCH_LIMIT),
    );

    const serviceClient = await createServiceClient();

    let targetReports: Array<Record<string, unknown>> = [];

    if (Array.isArray(reportIds) && reportIds.length > 0) {
      const validIds = reportIds.filter((x): x is string => typeof x === 'string').slice(0, MAX_BATCH_LIMIT);
      if (validIds.length === 0) {
        return NextResponse.json({ error: '유효한 reportIds 가 없습니다.' }, { status: 400 });
      }

      const { data, error } = await serviceClient
        .from('monthly_reports')
        .select('*')
        .in('id', validIds)
        .is('settlement_completed_at', null);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      targetReports = data || [];
    } else {
      const { data, error } = await serviceClient
        .from('monthly_reports')
        .select('*')
        .is('settlement_completed_at', null)
        .eq('fee_payment_status', 'paid')
        .order('fee_paid_at', { ascending: true })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      targetReports = data || [];
    }

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ reportId: string; message: string }> = [];

    for (const report of targetReports) {
      try {
        await completeSettlement(serviceClient, report as unknown as Parameters<typeof completeSettlement>[1]);
        succeeded++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ reportId: String(report.id), message });
      }
    }

    return NextResponse.json({
      processed: targetReports.length,
      succeeded,
      failed,
      errors,
    });
  } catch (err) {
    console.error('POST /api/admin/payments/settlement-recovery error:', err);
    void logSystemError({ source: 'admin/payments/settlement-recovery', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
