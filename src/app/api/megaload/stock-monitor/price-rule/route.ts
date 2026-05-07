import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { PriceFollowRule } from '@/lib/supabase/types';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * PUT /api/megaload/stock-monitor/price-rule
 * body: { monitorId: string, rule: PriceFollowRule | null }
 * 단일 모니터의 가격 추종 규칙 설정/해제
 */
export async function PUT(request: NextRequest) {
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
    const { monitorId, rule } = body as { monitorId: string; rule: PriceFollowRule | null };

    if (!monitorId) {
      return NextResponse.json({ error: 'monitorId가 필요합니다.' }, { status: 400 });
    }

    // 소유권 확인 + 현재 상태 로드
    const { data: monitor, error: fetchErr } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, megaload_user_id, price_follow_rule, source_price_last, our_price_last')
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!monitor) return NextResponse.json({ error: '해당 모니터를 찾을 수 없습니다.' }, { status: 404 });

    let normalizedRule: PriceFollowRule | null = null;

    if (rule) {
      // 유효성 검사
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

      // fixed_margin + captured_margin 미제공 → 현재가 기준 자동 캡처
      if (normalizedRule.type === 'fixed_margin' && normalizedRule.captured_margin == null) {
        const rec = monitor as { our_price_last: number | null; source_price_last: number | null };
        if (rec.our_price_last != null && rec.source_price_last != null) {
          normalizedRule.captured_margin = rec.our_price_last - rec.source_price_last;
        }
      }
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await serviceClient
      .from('sh_stock_monitors')
      .update({ price_follow_rule: normalizedRule, updated_at: now })
      .eq('id', monitorId)
      .eq('megaload_user_id', shUserId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ success: true, rule: normalizedRule });
  } catch (err) {
    console.error('price-rule PUT error:', err);
    void logSystemError({ source: 'megaload/stock-monitor/price-rule', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
