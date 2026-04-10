import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * GET /api/megaload/stock-monitor
 * 사용자 모니터 목록 + 통계 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();

    // megaload_user_id 조회 (자동 프로비저닝 포함)
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // 필터 파라미터
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // in_stock, sold_out, error, all
    const pendingOnly = searchParams.get('pendingOnly') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // 모니터 목록 조회
    let query = serviceClient
      .from('sh_stock_monitors')
      .select(`
        id, product_id, coupang_product_id, source_url,
        source_status, coupang_status, option_statuses,
        is_active, check_interval_minutes,
        last_checked_at, last_changed_at, last_action_at,
        consecutive_errors, created_at,
        price_follow_rule, source_price_last, our_price_last,
        price_last_updated_at, price_last_applied_at, pending_price_change,
        sh_products!inner(product_name, display_name, brand)
      `, { count: 'exact' })
      .eq('megaload_user_id', shUserId)
      .order('last_checked_at', { ascending: false, nullsFirst: true });

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'error') {
        query = query.gte('consecutive_errors', 1);
      } else {
        query = query.eq('source_status', statusFilter);
      }
    }

    if (pendingOnly) {
      query = query.not('pending_price_change', 'is', null);
    }

    const { data: monitors, count, error: queryErr } = await query
      .range(offset, offset + limit - 1);

    if (queryErr) {
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    // 통계 집계 (전체)
    const { data: allMonitors } = await serviceClient
      .from('sh_stock_monitors')
      .select('source_status, coupang_status, consecutive_errors, is_active, pending_price_change')
      .eq('megaload_user_id', shUserId);

    const stats = {
      total: allMonitors?.length || 0,
      inStock: 0,
      soldOut: 0,
      removed: 0,
      suspended: 0,
      error: 0,
      inactive: 0,
      pendingApprovalCount: 0,
    };

    for (const m of allMonitors || []) {
      const rec = m as Record<string, unknown>;
      if (rec.pending_price_change) stats.pendingApprovalCount++;
      if (!rec.is_active) { stats.inactive++; continue; }
      switch (rec.source_status) {
        case 'in_stock': stats.inStock++; break;
        case 'sold_out': stats.soldOut++; break;
        case 'removed': stats.removed++; break;
      }
      if (rec.coupang_status === 'suspended') stats.suspended++;
      if ((rec.consecutive_errors as number) > 0) stats.error++;
    }

    // 최근 이력 조회 (최신 30건)
    const { data: recentLogs } = await serviceClient
      .from('sh_stock_monitor_logs')
      .select('id, monitor_id, event_type, source_status_before, source_status_after, coupang_status_before, coupang_status_after, option_name, action_taken, action_success, error_message, source_price_before, source_price_after, our_price_before, our_price_after, price_skip_reason, created_at')
      .eq('megaload_user_id', shUserId)
      .order('created_at', { ascending: false })
      .limit(30);

    return NextResponse.json({
      monitors: monitors || [],
      stats,
      recentLogs: recentLogs || [],
      pagination: { page, limit, total: count || 0 },
    });

  } catch (err) {
    console.error('stock-monitor GET error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * POST /api/megaload/stock-monitor
 * 수동 모니터 등록/업데이트
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { productId, coupangProductId, sourceUrl, isActive } = body as {
      productId: string;
      coupangProductId: string;
      sourceUrl: string;
      isActive?: boolean;
    };

    if (!productId || !sourceUrl) {
      return NextResponse.json({ error: 'productId와 sourceUrl이 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('sh_stock_monitors')
      .upsert({
        megaload_user_id: shUserId,
        product_id: productId,
        coupang_product_id: coupangProductId || '',
        source_url: sourceUrl,
        is_active: isActive ?? true,
      }, { onConflict: 'megaload_user_id,product_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ monitor: data });

  } catch (err) {
    console.error('stock-monitor POST error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/megaload/stock-monitor
 * 모니터 비활성화
 */
export async function DELETE(request: NextRequest) {
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
    const monitorId = searchParams.get('id');

    if (!monitorId) {
      return NextResponse.json({ error: 'id 파라미터가 필요합니다.' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('sh_stock_monitors')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('stock-monitor DELETE error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
