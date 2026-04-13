import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * POST /api/megaload/stock-monitor/fetch-prices
 * 모든 모니터의 쿠팡 실제 판매가를 일괄 조회하여 our_price_last 업데이트
 * 쿠팡 API 429 방지: 1개씩 순차 처리 + 요청 간 1초 딜레이
 */
export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({}));
    const cursor = (body as Record<string, unknown>).cursor as string | undefined;
    const batchSize = 10; // 429 방지: 한 번에 10개만

    // 어댑터 인증
    let adapter: CoupangAdapter;
    try {
      adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang') as CoupangAdapter;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'API 인증 실패' }, { status: 400 });
    }

    // our_price_last가 NULL인 모니터만 조회 (cursor 이후)
    let query = serviceClient
      .from('sh_stock_monitors')
      .select('id, coupang_product_id, coupang_status, our_price_last')
      .eq('megaload_user_id', shUserId)
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '')
      .order('id')
      .limit(batchSize);

    if (cursor) {
      query = query.gt('id', cursor);
    }

    const { data: monitors, error: qErr } = await query;
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    const rows = (monitors || []) as { id: string; coupang_product_id: string; coupang_status: string; our_price_last: number | null }[];

    if (rows.length === 0) {
      return NextResponse.json({ updated: 0, remaining: 0, done: true });
    }

    const now = new Date().toISOString();
    let updated = 0;
    let errors = 0;
    let rateLimited = false;

    // 1개씩 순차 처리 + 1초 딜레이 (429 방지)
    for (const m of rows) {
      try {
        const detail = await adapter.getProductDetail(m.coupang_product_id);
        if (!detail) { errors++; continue; }

        const price = detail.items?.[0]?.salePrice ?? null;
        const status: 'active' | 'suspended' = detail.statusName === 'APPROVE' ? 'active' : 'suspended';

        const updates: Record<string, unknown> = {
          updated_at: now,
          last_checked_at: now,
        };
        if (price != null && price > 0) updates.our_price_last = price;
        if (status !== m.coupang_status) updates.coupang_status = status;

        await serviceClient.from('sh_stock_monitors').update(updates).eq('id', m.id);
        if (price != null && price > 0) updated++;
        else errors++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('429')) {
          rateLimited = true;
          break; // 429 발생 시 즉시 중단, 다음 호출에서 이어서 처리
        }
        errors++;
      }

      // 요청 간 1초 대기
      await sleep(1000);
    }

    // 남은 개수 확인
    const { count: remaining } = await serviceClient
      .from('sh_stock_monitors')
      .select('id', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '');

    const lastId = rows[rows.length - 1]?.id;

    return NextResponse.json({
      updated,
      errors,
      remaining: remaining ?? 0,
      done: (remaining ?? 0) === 0,
      cursor: lastId,
      rateLimited,
    });
  } catch (err) {
    console.error('fetch-prices error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
