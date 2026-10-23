import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { markGoneProducts } from '@/lib/megaload/services/coupang-liveness';

// 전체 상품을 끝까지 훑어야 "쿠팡에서 사라진 상품"을 판별할 수 있다 — 30s 로는 100개도 못 넘겼다.
export const maxDuration = 300;


/** 제조사/법인명 패턴 — brand 필드에 제조사가 들어온 경우 감지 */
const MANUFACTURER_RE = /주식회사|법인|제조|산업|공업|식품공장|팜$|팜\s|코퍼레이션|엔터프라이즈|인터내셔널|홀딩스|그룹$|\(주\)|\(유\)|co\.,?\s*ltd|inc\.|corp\./i;

/**
 * 쿠팡 API brand가 제조사명이면 상품명에서 실제 브랜드를 추출한다.
 * 상품명 형식: "브랜드명 상품설명 ..." → 첫 번째 토큰이 브랜드
 */
function extractBrand(apiBrand: string, productName: string): { brand: string; manufacturer: string } {
  const trimmed = apiBrand.trim();

  // API brand가 비어있거나 제조사명 패턴이면 → 상품명에서 추출
  if (!trimmed || MANUFACTURER_RE.test(trimmed)) {
    const firstToken = productName.trim().split(/\s+/)[0] || '';
    // 첫 토큰이 유효한 브랜드명인지 (숫자만이거나 특수문자 덩어리가 아닌지)
    const isBrand = firstToken.length >= 2 && !/^\d+$/.test(firstToken) && !/^[^\w가-힣]+$/.test(firstToken);
    return {
      brand: isBrand ? firstToken : trimmed,
      manufacturer: trimmed,
    };
  }

  return { brand: trimmed, manufacturer: '' };
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // sync job 생성
    const { data: job } = await serviceClient
      .from('sh_sync_jobs')
      .insert({ megaload_user_id: shUserId, channel: 'coupang', job_type: 'product_sync', status: 'running' })
      .select()
      .single();
    const jobId = (job as Record<string, unknown>)?.id as string;

    try {
      // 목록 커서(nextToken)는 쿠팡 어댑터에만 있는 인자라 구체 타입으로 받는다.
      const adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;

      let page = 1;
      let totalSynced = 0;
      let monitorCreated = 0;
      let hasMore = true;
      /**
       * ⚠️ 예전엔 `page` 를 넘겼는데 어댑터는 그 값을 쓰지 않는다(쿠팡 목록 API 는 nextToken 커서식).
       *    그래서 **같은 1페이지를 계속 다시 받아** 100개 이상인 계정은 함수 한도까지 헛돌았다.
       *    커서를 넘겨 받아야 끝까지 간다.
       */
      let nextToken: string | undefined;
      /** 이번 훑기에서 쿠팡에 실재함을 확인한 상품들. 끝까지 봤을 때만 삭제 판정에 쓴다. */
      const seenIds = new Set<string>();
      /** 목록을 끝까지 받았는가 — 중간에 끊겼으면 아무것도 지웠다고 하지 않는다. */
      let sweepComplete = false;
      const MAX_PAGES = 120;

      while (hasMore) {
        // status 필터 없이 전체 상품 조회 (중지/검수중 포함)
        const result = await adapter.getProducts({ size: 100, nextToken });
        const items = result.items;
        console.log(`[sync-coupang] page=${page}, fetched=${items.length} items, nextToken=${result.nextToken ?? '(끝)'}`);

        if (items.length === 0) {
          hasMore = false;
          sweepComplete = true;
          break;
        }

        for (const item of items) {
          const coupangProductId = String(item.sellerProductId || item.productId || '');
          // 아래 upsert 가 실패해도 "쿠팡에 있다"는 사실은 변하지 않는다 — 먼저 적는다.
          if (coupangProductId) seenIds.add(coupangProductId);
          const productName = String(item.sellerProductName || item.productName || '');

          // 브랜드 vs 제조사 분리
          const { brand, manufacturer } = extractBrand(
            String(item.brand || ''),
            productName,
          );

          // 1. sh_products upsert — UUID 반환 받기
          //    category_id(UUID 타입)에 문자열 넣으면 실패하므로 raw_data에만 보관
          const { data: upsertedProduct, error: productErr } = await serviceClient
            .from('sh_products')
            .upsert({
              megaload_user_id: shUserId,
              coupang_product_id: coupangProductId,
              product_name: productName,
              display_name: productName,
              brand,
              manufacturer,
              status: 'active',
              raw_data: item,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'megaload_user_id,coupang_product_id' })
            .select('id, source_url')
            .single();

          if (productErr || !upsertedProduct) {
            console.warn(`[sync-coupang] sh_products upsert failed for ${coupangProductId}:`, productErr?.message);
            continue;
          }

          const savedId = (upsertedProduct as Record<string, unknown>).id as string;
          const existingProductSourceUrl = ((upsertedProduct as Record<string, unknown>).source_url as string | null) || '';

          // 2. sh_product_channels upsert — 쿠팡 채널 매핑
          try {
            await serviceClient.from('sh_product_channels').upsert({
              product_id: savedId,
              channel: 'coupang',
              channel_product_id: coupangProductId,
              status: 'active',
              last_synced_at: new Date().toISOString(),
            }, { onConflict: 'product_id,channel' });
          } catch (chErr) {
            console.warn(`[sync-coupang] sh_product_channels upsert failed for ${savedId}:`, chErr);
          }

          // 3. sh_product_options — 올바른 product_id(UUID) 사용
          const sellerProductItems = (item.sellerProductItemList || item.items || []) as Record<string, unknown>[];
          for (const opt of sellerProductItems) {
            const optionId = String(opt.vendorItemId || opt.itemId || '');
            const sku = String(opt.externalVendorSku || opt.sellerItemCode || optionId);
            try {
              await serviceClient.from('sh_product_options').upsert({
                product_id: savedId,
                option_name: String(opt.itemName || opt.optionName || '기본'),
                sku,
                barcode: String(opt.barcode || ''),
                sale_price: Number(opt.salePrice || opt.originalPrice || 0),
                cost_price: Number(opt.supplyPrice || 0),
                raw_data: opt,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'product_id,sku' });
            } catch {
              // onConflict 미일치 시 insert fallback
              try {
                await serviceClient.from('sh_product_options').insert({
                  product_id: savedId,
                  option_name: String(opt.itemName || opt.optionName || '기본'),
                  sku,
                  barcode: String(opt.barcode || ''),
                  sale_price: Number(opt.salePrice || opt.originalPrice || 0),
                  cost_price: Number(opt.supplyPrice || 0),
                  raw_data: opt,
                });
              } catch { /* 옵션 저장 실패 — 비핵심, 계속 진행 */ }
            }
          }

          // 4. sh_stock_monitors 자동 등록/갱신
          //    핵심: 기존 모니터의 source_url / source_status / consecutive_errors는 절대 건드리지 않음
          //    (bulk-register로 이미 설정된 네이버 URL을 쿠팡 동기화가 덮어쓰면 안 됨)
          const firstOpt = sellerProductItems[0];
          const ourPrice = firstOpt
            ? Number(firstOpt.salePrice || firstOpt.originalPrice || 0)
            : 0;
          const itemStatus = String(item.statusName || item.status || '').toUpperCase();
          const ACTIVE_STATUSES = new Set(['APPROVE', 'PARTIAL_APPROVAL', 'WAITING_FOR_APPROVAL', 'REGISTRATION']);
          const coupangStatus: 'active' | 'suspended' = ACTIVE_STATUSES.has(itemStatus) ? 'active' : 'suspended';
          try {
            const { data: existingMonitor } = await serviceClient
              .from('sh_stock_monitors')
              .select('id')
              .eq('megaload_user_id', shUserId)
              .eq('product_id', savedId)
              .maybeSingle();

            if (existingMonitor) {
              // 기존 모니터: 쿠팡 측 필드만 갱신
              await serviceClient.from('sh_stock_monitors').update({
                coupang_product_id: coupangProductId,
                coupang_status: coupangStatus,
                ...(ourPrice > 0 && { our_price_last: ourPrice }),
                updated_at: new Date().toISOString(),
              }).eq('id', (existingMonitor as Record<string, unknown>).id as string);
            } else {
              // 신규 모니터: sh_products에 이미 URL이 있으면 승계
              await serviceClient.from('sh_stock_monitors').insert({
                megaload_user_id: shUserId,
                product_id: savedId,
                coupang_product_id: coupangProductId,
                source_url: existingProductSourceUrl,
                source_status: 'unknown',
                coupang_status: coupangStatus,
                is_active: true,
                consecutive_errors: 0,
                ...(ourPrice > 0 && { our_price_last: ourPrice }),
              });
              monitorCreated++;
            }
          } catch (monErr) {
            console.warn(`[sync-coupang] monitor upsert failed for ${savedId}:`, monErr);
          }

          totalSynced++;
        }

        page++;
        nextToken = result.nextToken ?? undefined;
        if (!nextToken) { hasMore = false; sweepComplete = true; }
        else if (page > MAX_PAGES) { hasMore = false; console.warn(`[sync-coupang] 페이지 상한(${MAX_PAGES}) 도달 — 삭제 판별 생략`); }
      }

      /**
       * 쿠팡에서 사라진 상품을 DB 에도 반영한다.
       * -----------------------------------------------------------------------
       * 이게 없으면 셀러가 윙에서 지운 상품이 우리 DB 에선 영원히 active 로 남아,
       * 검수 화면에 "이미 올림" 으로 뜨고 재등록이 막힌다(셀러 문의 2026-10-23).
       * 목록을 끝까지 받았을 때만 판단한다 — 중간에 끊긴 목록으로 지웠다고 적으면 거짓 장부가 된다.
       */
      let markedDeleted = 0;
      if (sweepComplete) {
        const ledger: { id: string; coupangProductId: string | null }[] = [];
        for (let from = 0; ; from += 1000) {
          const { data: rows } = await serviceClient
            .from('sh_products')
            .select('id, coupang_product_id')
            .eq('megaload_user_id', shUserId)
            .neq('status', 'deleted')
            .not('coupang_product_id', 'is', null)
            .range(from, from + 999);
          const batch = (rows || []) as { id: string; coupang_product_id: string | null }[];
          ledger.push(...batch.map((r) => ({ id: r.id, coupangProductId: r.coupang_product_id })));
          if (batch.length < 1000) break;
        }
        markedDeleted = (await markGoneProducts(serviceClient, shUserId, seenIds, ledger)).length;
      }

      // job 완료
      if (jobId) {
        await serviceClient
          .from('sh_sync_jobs')
          .update({ status: 'completed', result: { synced: totalSynced, monitorCreated, markedDeleted, sweepComplete }, completed_at: new Date().toISOString() })
          .eq('id', jobId);
      }

      return NextResponse.json({ success: true, synced: totalSynced, monitorCreated, markedDeleted, sweepComplete });
    } catch (err) {
      if (jobId) {
        await serviceClient
          .from('sh_sync_jobs')
          .update({ status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' })
          .eq('id', jobId);
      }
      throw err;
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '동기화 실패' }, { status: 500 });
  }
}
