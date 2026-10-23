/**
 * 쿠팡 실재 확인 — "장부에 있다"와 "쿠팡에 있다"는 다른 사실이다.
 * ---------------------------------------------------------------------------
 * 우리 DB(sh_products)는 등록에 성공한 **과거 사실**을 적는다. 셀러가 윙에서 상품을
 * 지워도 그 기록은 그대로 남는다. 그런데 중복 등록 방지가 이 기록만 보고 판단하면,
 * 지운 상품은 **그 계정에서 영영 다시 못 올린다**(실제 셀러 문의 2026-10-23).
 *
 * 그래서 "지워졌다"를 사실로 확정하는 책임을 이 파일에 모은다. 규칙 하나:
 *   ★ 전체 목록을 **끝까지** 받아오지 못했으면 아무것도 지웠다고 하지 않는다.
 *     한 페이지만 받고 "나머지는 없다"고 적으면 그게 바로 거짓 장부가 된다
 *     (키가 막힌 계정·레이트리밋·타임아웃에서 전부 삭제로 보일 수 있다).
 *
 * 판별 방법은 수동 뒤처리 스크립트(reconcile-bulk-registered.mjs)에서 검증된 것과 같다 —
 * 전체 상품 목록에 없으면 사라진 것이다. 상세조회(getProductDetail)는 실패와 부재를
 * 둘 다 null 로 돌려주므로 삭제 판정에 쓸 수 없다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoupangAdapter } from '../adapters/coupang.adapter';

/** 목록 페이지 상한 — 100개/page 기준 12,000개. 넘으면 '다 못 봤다'로 둔다. */
const MAX_PAGES = 120;
/** 잠깐 실패는 재시도한다 — 영구 오류(키 revoked 등)와 섞어 보면 삭제로 오판한다. */
const TRANSIENT = /\b(429|50\d)\b|rate|timeout|ETIMEDOUT|ECONNRESET|socket|Gateway|transient/i;

export interface LiveSweep {
  /** 쿠팡에 실재하는 sellerProductId 집합. complete=false 면 신뢰하지 말 것. */
  ids: Set<string>;
  /** 목록을 끝까지 받았는가. false 면 삭제 판정 금지. */
  complete: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 계정의 쿠팡 상품 전체 목록을 훑어 sellerProductId 를 모은다. */
export async function sweepLiveProductIds(
  adapter: CoupangAdapter,
  /** 페이지 상한·시간 예산. 등록 라우트처럼 함수 한도가 짧은 곳은 예산을 줘서 부른다. */
  opts: { maxPages?: number; timeBudgetMs?: number } = {},
): Promise<LiveSweep> {
  const { maxPages = MAX_PAGES, timeBudgetMs } = opts;
  const startedAt = Date.now();
  const ids = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    if (timeBudgetMs != null && page > 0 && Date.now() - startedAt > timeBudgetMs) {
      // 시간이 다 됐다 = 끝을 못 봤다. 여기서 삭제 판정을 하면 살아있는 상품을 지웠다고 적는다.
      return { ids, complete: false, error: `목록 조회 시간 예산(${Math.round(timeBudgetMs / 1000)}초) 초과` };
    }
    let res: { items: Record<string, unknown>[]; nextToken: string | null } | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await adapter.getProducts({ size: 100, nextToken: token });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!TRANSIENT.test(msg) || attempt === 2) break;
        await sleep(1500 * 2 ** attempt);
      }
    }
    if (lastErr || !res) {
      return { ids, complete: false, error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
    }
    for (const item of res.items) {
      const id = String(item.sellerProductId || item.productId || '');
      if (id) ids.add(id);
    }
    if (!res.nextToken || res.items.length === 0) return { ids, complete: true };
    token = res.nextToken;
  }
  // 상한에 걸렸다 = 끝을 못 봤다. 삭제 판정에 쓰면 안 된다.
  return { ids, complete: false, error: `상품이 ${maxPages * 100}개를 넘어 목록을 끝까지 보지 못했습니다.` };
}

export interface LedgerRow {
  /** sh_products.id */
  id: string;
  /** sh_products.coupang_product_id — 없으면 확인할 수 없으므로 건드리지 않는다. */
  coupangProductId: string | null;
}

/**
 * 살아있는 목록에 없는 기록을 'deleted' 로 표시한다. 표시한 채널상품번호를 돌려준다.
 *
 * `live` 는 **끝까지 받아온** 목록이어야 한다(sweepLiveProductIds().complete 확인은 호출자 책임).
 * sh_products.status 와 함께 catalog_registrations.deleted_at 도 적는다 — 장부 쪽은
 * status 를 바꿀 수 없어(CHECK 제약) 삭제 시점만 따로 적는 설계다.
 */
export async function markGoneProducts(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  live: Set<string>,
  rows: LedgerRow[],
): Promise<string[]> {
  const gone = rows.filter((r) => r.coupangProductId && !live.has(String(r.coupangProductId)));
  if (gone.length === 0) return [];

  const now = new Date().toISOString();
  const goneChannelIds = gone.map((r) => String(r.coupangProductId));

  for (let i = 0; i < gone.length; i += 100) {
    const chunk = gone.slice(i, i + 100);
    const ids = chunk.map((r) => r.id);
    const channelIds = chunk.map((r) => String(r.coupangProductId));
    try {
      await serviceClient
        .from('sh_products')
        .update({ status: 'deleted', updated_at: now })
        .eq('megaload_user_id', megaloadUserId)
        .in('id', ids);
      // 채널 리스팅도 같이 — 품절감시·복제 전파가 죽은 리스팅을 계속 들여다보지 않게.
      await serviceClient
        .from('sh_product_channels')
        .update({ status: 'deleted', updated_at: now })
        .eq('channel', 'coupang')
        .in('product_id', ids);
      await serviceClient
        .from('catalog_registrations')
        .update({ deleted_at: now })
        .eq('megaload_user_id', megaloadUserId)
        .is('deleted_at', null)
        .in('channel_product_id', channelIds);
    } catch (err) {
      console.error('[coupang-liveness] 삭제 표시 실패:', err instanceof Error ? err.message : err);
    }
  }
  console.log(`[coupang-liveness] ${megaloadUserId} — 쿠팡에 없는 기록 ${gone.length}건을 deleted 로 표시`);
  return goneChannelIds;
}
