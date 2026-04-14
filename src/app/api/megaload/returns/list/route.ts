import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * GET /api/megaload/returns/list?status=RETURNS_UNCHECKED&limit=50
 * megaload_return_requests에서 반품 요청 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();

    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status'); // 'all' or receipt_status value
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);

    let query = serviceClient
      .from('megaload_return_requests')
      .select('*', { count: 'exact' })
      .eq('megaload_user_id', shUserId)
      // 전담택배는 쿠팡이 자동 수거하므로 UI에서 제외
      .or('return_delivery_type.is.null,return_delivery_type.neq.전담택배')
      .order('channel_created_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (statusParam && statusParam !== 'all') {
      query = query.eq('receipt_status', statusParam);
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 상태별 카운트 (탭 뱃지용)
    const { data: all } = await serviceClient
      .from('megaload_return_requests')
      .select('receipt_status, return_delivery_type')
      .eq('megaload_user_id', shUserId);

    const statusCounts: Record<string, number> = {};
    for (const row of all || []) {
      const rec = row as Record<string, unknown>;
      if (rec.return_delivery_type === '전담택배') continue;
      const s = (rec.receipt_status as string) || 'UNKNOWN';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      statusCounts,
    });
  } catch (err) {
    console.error('returns/list error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '목록 조회 실패' },
      { status: 500 },
    );
  }
}
