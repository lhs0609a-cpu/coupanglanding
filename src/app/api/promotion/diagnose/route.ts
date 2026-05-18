import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

/** GET: 다운로드 쿠폰 누락 원인 진단 — instant/download 단계별 분포 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, coupang_vendor_id, coupang_wing_user_id, coupang_api_connected')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!ptUser) return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });

    const sc = await createServiceClient();

    const { data: cfg } = await sc
      .from('coupon_auto_sync_config')
      .select('instant_coupon_enabled, instant_coupon_id, download_coupon_enabled, download_coupon_id, download_coupon_policies, download_coupon_duration_days, contract_id')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    const policies = (cfg?.download_coupon_policies as unknown[] | null) || [];
    const configValidation = {
      wingUserIdSet: !!(ptUser.coupang_wing_user_id && (ptUser.coupang_wing_user_id as string).trim()),
      downloadEnabled: !!cfg?.download_coupon_enabled,
      contractIdSet: !!(cfg?.contract_id && String(cfg.contract_id).trim()),
      contractId: cfg?.contract_id || null,
      policiesCount: policies.length,
      policiesSample: policies[0] || null,
      durationDays: cfg?.download_coupon_duration_days || null,
    };

    const head = (q: ReturnType<typeof sc.from>) => q.select('*', { count: 'exact', head: true }).eq('pt_user_id', ptUser.id);

    const [
      total, instantApplied, downloadApplied,
      pending, processing, completed, failed, skipped,
      pendingNeedInstant, pendingNeedDownload,
      completedMissingDownload, failedWithDownloadErr,
    ] = await Promise.all([
      head(sc.from('product_coupon_tracking')),
      head(sc.from('product_coupon_tracking')).eq('instant_coupon_applied', true),
      head(sc.from('product_coupon_tracking')).eq('download_coupon_applied', true),
      head(sc.from('product_coupon_tracking')).eq('status', 'pending'),
      head(sc.from('product_coupon_tracking')).eq('status', 'processing'),
      head(sc.from('product_coupon_tracking')).eq('status', 'completed'),
      head(sc.from('product_coupon_tracking')).eq('status', 'failed'),
      head(sc.from('product_coupon_tracking')).eq('status', 'skipped'),
      head(sc.from('product_coupon_tracking')).eq('status', 'pending').or('instant_coupon_applied.is.null,instant_coupon_applied.eq.false'),
      head(sc.from('product_coupon_tracking')).eq('status', 'pending').eq('instant_coupon_applied', true).or('download_coupon_applied.is.null,download_coupon_applied.eq.false'),
      head(sc.from('product_coupon_tracking')).eq('status', 'completed').or('download_coupon_applied.is.null,download_coupon_applied.eq.false'),
      head(sc.from('product_coupon_tracking')).eq('status', 'failed').not('error_message', 'is', null),
    ]);

    const { data: recentDownloadFailures } = await sc
      .from('product_coupon_tracking')
      .select('id, seller_product_id, error_message, updated_at')
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'failed')
      .ilike('error_message', '%다운로드%')
      .order('updated_at', { ascending: false })
      .limit(10);

    // coupon_apply_log: 다운로드 시도의 실제 쿠팡 응답 (성공/실패 모두)
    const { data: recentDownloadLogs } = await sc
      .from('coupon_apply_log')
      .select('vendor_item_id, coupon_id, success, error_message, created_at')
      .eq('pt_user_id', ptUser.id)
      .eq('coupon_type', 'download')
      .order('created_at', { ascending: false })
      .limit(20);

    const downloadLogBuckets: Record<string, number> = {};
    (recentDownloadLogs || []).forEach((r) => {
      const row = r as { success: boolean; error_message: string | null };
      const key = row.success ? '__SUCCESS__' : (row.error_message || '__NULL_ERROR__').slice(0, 120);
      downloadLogBuckets[key] = (downloadLogBuckets[key] || 0) + 1;
    });

    const { data: errorPatternRows } = await sc
      .from('product_coupon_tracking')
      .select('error_message')
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'failed')
      .not('error_message', 'is', null)
      .limit(500);

    const errorBuckets: Record<string, number> = {};
    (errorPatternRows || []).forEach((r) => {
      const msg = (r as { error_message: string }).error_message || '';
      const key = msg.slice(0, 80);
      errorBuckets[key] = (errorBuckets[key] || 0) + 1;
    });
    const topErrors = Object.entries(errorBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([msg, count]) => ({ msg, count }));

    return NextResponse.json({
      counts: {
        total: total.count || 0,
        instantApplied: instantApplied.count || 0,
        downloadApplied: downloadApplied.count || 0,
        pending: pending.count || 0,
        processing: processing.count || 0,
        completed: completed.count || 0,
        failed: failed.count || 0,
        skipped: skipped.count || 0,
      },
      gaps: {
        pendingNeedInstant: pendingNeedInstant.count || 0,
        pendingNeedDownload: pendingNeedDownload.count || 0,
        completedMissingDownload: completedMissingDownload.count || 0,
        failedWithMessage: failedWithDownloadErr.count || 0,
      },
      topErrors,
      recentDownloadFailures: recentDownloadFailures || [],
      configValidation,
      downloadLogBuckets,
      recentDownloadLogs: (recentDownloadLogs || []).slice(0, 10),
    });
  } catch (err) {
    console.error('promotion diagnose error:', err);
    void logSystemError({ source: 'promotion/diagnose', error: err }).catch(() => {});
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
