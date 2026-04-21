import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 결제/정산 파이프라인에서 "조용히 삼키면 안 되는" 오류를 DB 에 기록.
 * 관리자 대시보드에서 주기적으로 확인 → 수동 복구할 수 있게 한다.
 */
export async function logSettlementError(
  serviceClient: SupabaseClient,
  params: {
    stage: string;
    monthlyReportId?: string | null;
    ptUserId?: string | null;
    error: unknown;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  const errObj = params.error as { code?: string; message?: string; stack?: string };
  try {
    await serviceClient.from('payment_settlement_errors').insert({
      monthly_report_id: params.monthlyReportId ?? null,
      pt_user_id: params.ptUserId ?? null,
      stage: params.stage,
      error_code: errObj?.code ?? null,
      error_message: errObj?.message ?? String(params.error).slice(0, 500),
      detail: {
        ...(params.detail || {}),
        stack: errObj?.stack?.slice(0, 2000),
      },
    });
  } catch (logErr) {
    // 로그 기록도 실패하면 최후 수단으로 콘솔
    console.error('[settlement-errors] insert failed:', logErr, 'original:', params);
  }
}
