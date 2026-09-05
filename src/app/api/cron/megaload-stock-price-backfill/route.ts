import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { recordCoupangApiFailure, clearCoupangApiBlock } from '@/lib/utils/coupang-circuit-breaker';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 120;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * GET /api/cron/megaload-stock-price-backfill
 * 쿠팡 판매가 미조회 모니터(our_price_last IS NULL)를 채운다. 쿠팡 API 만 사용.
 *
 * 왜 분리했나 (2026-08-10 실측):
 *   원래 megaload-stock-monitor 크론의 Phase 1 이었는데, 같은 300초 예산을 네이버 조회
 *   Phase 2 와 나눠 썼다. Phase 1 이 30건 × 1초 + API 왕복으로 약 60초를 먼저 먹고,
 *   남은 240초로 Phase 2 가 22건만 처리한 뒤 maxDuration 에 잘렸다(설계 60건).
 *   성격이 다른 두 작업(쿠팡 API vs 네이버 크롤링)이 한 예산을 다투게 둘 이유가 없다.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();
  let priceBackfilled = 0;

  try {
    const { data: needPrice } = await supabase
      .from('sh_stock_monitors')
      .select('id, megaload_user_id, coupang_product_id, coupang_status')
      .is('our_price_last', null)
      .not('coupang_product_id', 'eq', '')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(60);

    if (!needPrice || needPrice.length === 0) {
      return NextResponse.json({ message: '백필 대상 없음', priceBackfilled: 0 });
    }

    // ── circuit breaker — 차단된 셀러의 megaload_user_id 미리 식별 ──
    const monitorMegaloadUserIds = Array.from(new Set(
      (needPrice as Array<{ megaload_user_id: string }>).map(m => m.megaload_user_id),
    ));
    const { data: shUsers } = await supabase
      .from('megaload_users')
      .select('id, profile_id')
      .in('id', monitorMegaloadUserIds);
    const profileIds = (shUsers || []).map(u => (u as Record<string, unknown>).profile_id as string).filter(Boolean);
    const { data: blockedPt } = await supabase
      .from('pt_users')
      .select('id, profile_id')
      .in('profile_id', profileIds)
      .gt('coupang_api_blocked_until', new Date().toISOString());
    const blockedProfileIds = new Set(
      (blockedPt || []).map(r => (r as Record<string, unknown>).profile_id as string),
    );
    const profileToPtId = new Map<string, string>();
    for (const r of (blockedPt || []) as Array<Record<string, unknown>>) {
      profileToPtId.set(r.profile_id as string, r.id as string);
    }
    const blockedMegaloadUserIds = new Set<string>();
    const megaloadToPtId = new Map<string, string>();
    for (const u of (shUsers || []) as Array<Record<string, unknown>>) {
      if (blockedProfileIds.has(u.profile_id as string)) blockedMegaloadUserIds.add(u.id as string);
    }
    if (blockedMegaloadUserIds.size > 0) {
      console.log(`[stock-price-backfill] ${blockedMegaloadUserIds.size}명 차단 셀러 skip`);
    }

    const unblockedProfileIds = profileIds.filter(p => !blockedProfileIds.has(p));
    if (unblockedProfileIds.length > 0) {
      const { data: activePt } = await supabase
        .from('pt_users')
        .select('id, profile_id')
        .in('profile_id', unblockedProfileIds);
      for (const r of (activePt || []) as Array<Record<string, unknown>>) {
        profileToPtId.set(r.profile_id as string, r.id as string);
      }
    }
    for (const u of (shUsers || []) as Array<Record<string, unknown>>) {
      const ptId = profileToPtId.get(u.profile_id as string);
      if (ptId) megaloadToPtId.set(u.id as string, ptId);
    }

    const adapterCache = new Map<string, CoupangAdapter>();
    const now = new Date().toISOString();

    for (const m of needPrice as { id: string; megaload_user_id: string; coupang_product_id: string; coupang_status: string }[]) {
      if (blockedMegaloadUserIds.has(m.megaload_user_id)) continue;

      try {
        let adapter = adapterCache.get(m.megaload_user_id);
        if (!adapter) {
          adapter = await getAuthenticatedAdapter(supabase, m.megaload_user_id, 'coupang') as CoupangAdapter;
          adapterCache.set(m.megaload_user_id, adapter);
        }

        const detail = await adapter.getProductDetail(m.coupang_product_id);
        if (detail) {
          const price = detail.items?.[0]?.salePrice ?? null;
          // ⚠️ last_checked_at 은 건드리지 않는다.
          //   이건 쿠팡 가격 조회일 뿐 원본(네이버) 품절 확인이 아니다. 예전 Phase 1 은 여기서
          //   last_checked_at 을 찍어, 소스를 한 번도 안 본 모니터를 "방금 확인함"으로 만들고
          //   next_check_at 스케줄러의 due 판정까지 흐렸다(품절을 놓치는 방향의 오류).
          const updates: Record<string, unknown> = { updated_at: now };
          if (price != null && price > 0) updates.our_price_last = price;
          // 승인상태(APPROVED 등)는 판매 on/off 와 무관 — coupang_status 는 덮어쓰지 않는다.
          // 상품 삭제만 비활성화 처리하고, 토글은 reconcile 크론이 담당.
          const sName = String(detail.statusName || '');
          const sEnum = String(detail.status || '').toUpperCase();
          if (sEnum === 'DELETED' || sName.includes('삭제')) {
            updates.is_active = false;
          }
          await supabase.from('sh_stock_monitors').update(updates).eq('id', m.id);
          priceBackfilled++;
        }
        const ptId = megaloadToPtId.get(m.megaload_user_id);
        if (ptId) await clearCoupangApiBlock(supabase, ptId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('429')) {
          console.log('[stock-price-backfill] 429 rate limit, stopping');
          break;
        }
        const ptId = megaloadToPtId.get(m.megaload_user_id);
        if (ptId) {
          await recordCoupangApiFailure(supabase, ptId, msg);
          blockedMegaloadUserIds.add(m.megaload_user_id);
        }
      }
      await sleep(1000); // 429 방지
    }
  } catch (err) {
    console.error('[stock-price-backfill] error:', err);
    void logSystemError({ source: 'cron/megaload-stock-price-backfill', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown', priceBackfilled }, { status: 500 });
  }

  console.log(`[stock-price-backfill] 완료: ${priceBackfilled}건`);
  return NextResponse.json({ message: '가격 백필 완료', priceBackfilled });
}
