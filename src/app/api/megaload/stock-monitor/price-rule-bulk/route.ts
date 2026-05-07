import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { PriceFollowRule } from '@/lib/supabase/types';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * POST /api/megaload/stock-monitor/price-rule-bulk
 * body: { monitorIds: string[], rule: PriceFollowRule | null }
 * 여러 모니터에 일괄로 동일 규칙 적용 (최대 200건)
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
    const { monitorIds, rule } = body as { monitorIds: string[]; rule: PriceFollowRule | null };

    if (!Array.isArray(monitorIds) || monitorIds.length === 0) {
      return NextResponse.json({ error: 'monitorIds 배열이 필요합니다.' }, { status: 400 });
    }
    if (monitorIds.length > 200) {
      return NextResponse.json({ error: '한 번에 최대 200건까지 일괄 적용 가능합니다.' }, { status: 400 });
    }

    let normalizedRule: PriceFollowRule | null = null;
    if (rule) {
      const validTypes = ['exact', 'markup_amount', 'markup_percent', 'fixed_margin'] as const;
      const validModes = ['auto', 'manual_approval'] as const;
      if (!validTypes.includes(rule.type)) {
        return NextResponse.json({ error: `유효하지 않은 type: ${rule.type}` }, { status: 400 });
      }
      if (!validModes.includes(rule.mode)) {
        return NextResponse.json({ error: `유효하지 않은 mode: ${rule.mode}` }, { status: 400 });
      }
      if (rule.type === 'markup_amount' && typeof rule.amount !== 'number') {
        return NextResponse.json({ error: 'markup_amount에는 amount가 필요합니다.' }, { status: 400 });
      }
      if (rule.type === 'markup_percent' && typeof rule.percent !== 'number') {
        return NextResponse.json({ error: 'markup_percent에는 percent가 필요합니다.' }, { status: 400 });
      }

      normalizedRule = {
        enabled: rule.enabled === true,
        mode: rule.mode,
        type: rule.type,
        ...(rule.amount != null && { amount: Number(rule.amount) }),
        ...(rule.percent != null && { percent: Number(rule.percent) }),
        ...(rule.captured_margin != null && { captured_margin: Number(rule.captured_margin) }),
        ...(rule.min_price != null && { min_price: Number(rule.min_price) }),
        ...(rule.max_price != null && { max_price: Number(rule.max_price) }),
        ...(rule.min_change_pct != null && { min_change_pct: Number(rule.min_change_pct) }),
        ...(rule.max_change_pct != null && { max_change_pct: Number(rule.max_change_pct) }),
        ...(rule.follow_down != null && { follow_down: !!rule.follow_down }),
        ...(rule.cooldown_minutes != null && { cooldown_minutes: Number(rule.cooldown_minutes) }),
      };
    }

    const now = new Date().toISOString();
    const { error: updateErr, count } = await serviceClient
      .from('sh_stock_monitors')
      .update({ price_follow_rule: normalizedRule, updated_at: now }, { count: 'exact' })
      .in('id', monitorIds)
      .eq('megaload_user_id', shUserId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true, updated: count ?? 0, rule: normalizedRule });
  } catch (err) {
    console.error('price-rule-bulk POST error:', err);
    void logSystemError({ source: 'megaload/stock-monitor/price-rule-bulk', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
