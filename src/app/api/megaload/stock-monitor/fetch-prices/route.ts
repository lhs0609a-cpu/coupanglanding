import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * POST /api/megaload/stock-monitor/fetch-prices
 * 쿠팡 판매가 일괄 조회 — 2개 동시 + 500ms 딜레이 (429 방지)
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
    const batchSize = 20;

    let adapter: CoupangAdapter;
    try {
      adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang') as CoupangAdapter;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'API 인증 실패' }, { status: 400 });
    }

    let query = serviceClient
      .from('sh_stock_monitors')
      .select('id, coupang_product_id, coupang_status, our_price_last')
      .eq('megaload_user_id', shUserId)
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '')
      .order('id')
      .limit(batchSize);

    if (cursor) query = query.gt('id', cursor);

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

    // 2개씩 동시 처리 + 500ms 딜레이
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2);
      const results = await Promise.allSettled(
        pair.map(async (m) => {
          try {
            const detail = await adapter.getProductDetail(m.coupang_product_id);
            if (!detail) return null;
            const price = detail.items?.[0]?.salePrice ?? null;
            const status: 'active' | 'suspended' = detail.statusName === 'APPROVE' ? 'active' : 'suspended';
            const updates: Record<string, unknown> = { updated_at: now, last_checked_at: now };
            if (price != null && price > 0) updates.our_price_last = price;
            if (status !== m.coupang_status) updates.coupang_status = status;
            await serviceClient.from('sh_stock_monitors').update(updates).eq('id', m.id);
            return price;
          } catch (err) {
            if (err instanceof Error && err.message.includes('429')) throw err;
            return null;
          }
        })
      );

      for (const r of results) {
        if (r.status === 'rejected' && r.reason?.message?.includes('429')) {
          rateLimited = true;
          break;
        }
        if (r.status === 'fulfilled' && r.value != null) updated++;
        else errors++;
      }
      if (rateLimited) break;
      await sleep(500);
    }

    const { count: remaining } = await serviceClient
      .from('sh_stock_monitors')
      .select('id', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '');

    return NextResponse.json({
      updated,
      errors,
      remaining: remaining ?? 0,
      done: (remaining ?? 0) === 0,
      cursor: rows[rows.length - 1]?.id,
      rateLimited,
    });
  } catch (err) {
    console.error('fetch-prices error:', err);
    void logSystemError({ source: 'megaload/stock-monitor/fetch-prices', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
