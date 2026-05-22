import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

interface QueueProduct {
  coupangProductId: string;
  productCode?: string;
  productName?: string;
}
interface Body {
  products: QueueProduct[];
}

const MAX = 500;

/**
 * 광고 자동등록 대기 큐에 상품을 넣는다(중복은 무시).
 * 입찰가/일예산은 계정 규칙(megaload_ad_rules) 기본값을 사용.
 * 워커는 rule.auto_register_enabled 이고 일일 상한 내에서만 큐를 처리한다.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = await createServiceClient();
    let muId: string;
    try {
      muId = await ensureMegaloadUser(supabase, service, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정 없음' }, { status: 404 });
    }

    const body = (await req.json()) as Body;
    const items = (Array.isArray(body.products) ? body.products : [])
      .filter((p) => p && typeof p.coupangProductId === 'string' && p.coupangProductId.trim())
      .slice(0, MAX);
    if (items.length === 0) {
      return NextResponse.json({ error: '유효한 coupangProductId가 없습니다.' }, { status: 400 });
    }

    // 규칙 기본값(초기 입찰가/일예산)
    const { data: rule } = await service
      .from('megaload_ad_rules')
      .select('register_initial_bid, register_daily_budget')
      .eq('megaload_user_id', muId)
      .eq('scope_type', 'account')
      .maybeSingle();
    const initialBid = (rule?.register_initial_bid as number | undefined) ?? 200;
    const dailyBudget = (rule?.register_daily_budget as number | undefined) ?? 5000;

    const rows = items.map((p) => ({
      megaload_user_id: muId,
      coupang_product_id: p.coupangProductId.trim(),
      product_code: p.productCode ?? null,
      product_name: p.productName ?? null,
      initial_bid: initialBid,
      daily_budget: dailyBudget,
      status: 'pending',
    }));

    // 중복(같은 상품) 무시 — UNIQUE(megaload_user_id, coupang_product_id)
    const { error } = await service
      .from('megaload_ad_register_queue')
      .upsert(rows, { onConflict: 'megaload_user_id,coupang_product_id', ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ error: `큐 등록 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ queued: rows.length });
  } catch (err) {
    void logSystemError({ source: 'megaload/ads/register-queue', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '큐 등록 실패' }, { status: 500 });
  }
}
