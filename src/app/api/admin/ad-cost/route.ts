import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';
import { AD_COST_WARN_RATIO } from '@/lib/payments/ad-cost';

export const maxDuration = 30;


/**
 * GET /api/admin/ad-cost
 *
 * Query: ?status=pending|approved|rejected|missed|locked|all (default: pending)
 *        ?yearMonth=YYYY-MM (optional filter)
 *
 * 응답에 매출 대비 비율(ratio) + 과대청구 flag(isOverThreshold) 동봉.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const guard = await requireAdminRole(supabase, user?.id, 'read');
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const yearMonth = url.searchParams.get('yearMonth') || null;

  const serviceClient = await createServiceClient();
  let query = serviceClient
    .from('ad_cost_submissions')
    .select('*, pt_user:pt_users(id, profile_id, profile:profiles(email, full_name))')
    .order('submitted_at', { ascending: false })
    .limit(200);

  if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (yearMonth) {
    query = query.eq('year_month', yearMonth);
  }

  const { data: submissions, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 각 제출에 대해 매출 비율 계산
  const ptUserIds = Array.from(new Set((submissions || []).map((s) => s.pt_user_id)));
  const yearMonths = Array.from(new Set((submissions || []).map((s) => s.year_month)));

  const { data: snaps } = await serviceClient
    .from('api_revenue_snapshots')
    .select('pt_user_id, year_month, total_sales')
    .in('pt_user_id', ptUserIds.length > 0 ? ptUserIds : ['00000000-0000-0000-0000-000000000000'])
    .in('year_month', yearMonths.length > 0 ? yearMonths : ['1900-01']);

  const snapMap = new Map<string, number>();
  for (const s of snaps || []) {
    snapMap.set(`${s.pt_user_id}::${s.year_month}`, Number(s.total_sales) || 0);
  }

  const enriched = (submissions || []).map((s) => {
    const revenue = snapMap.get(`${s.pt_user_id}::${s.year_month}`) || 0;
    const ratio = revenue > 0 ? Number(s.amount) / revenue : null;
    return {
      ...s,
      monthly_revenue: revenue,
      ratio,
      is_over_threshold: ratio !== null && ratio >= AD_COST_WARN_RATIO,
    };
  });

  return NextResponse.json({ submissions: enriched });
}
