import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';

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

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });

    const serviceClient = await createServiceClient();
    const shUserId = (shUser as Record<string, unknown>).id as string;

    // sync job 생성
    const { data: job } = await serviceClient
      .from('sh_sync_jobs')
      .insert({ megaload_user_id: shUserId, channel: 'coupang', job_type: 'product_sync', status: 'running' })
      .select()
      .single();
    const jobId = (job as Record<string, unknown>)?.id as string;

    try {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');

      let page = 1;
      let totalSynced = 0;
      let monitorCreated = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await adapter.getProducts({ page, size: 100, status: 'APPROVE' });
        const items = result.items;

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const coupangProductId = String(item.sellerProductId || item.productId || '');
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
            .select('id')
            .single();

          if (productErr || !upsertedProduct) {
            console.warn(`[sync-coupang] sh_products upsert failed for ${coupangProductId}:`, productErr?.message);
            continue;
          }

          const savedId = (upsertedProduct as Record<string, unknown>).id as string;

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

          // 4. sh_stock_monitors 자동 등록 — 쿠팡 판매가도 함께 저장
          const firstOpt = sellerProductItems[0];
          const ourPrice = firstOpt
            ? Number(firstOpt.salePrice || firstOpt.originalPrice || 0)
            : 0;
          try {
            await serviceClient.from('sh_stock_monitors').upsert({
              megaload_user_id: shUserId,
              product_id: savedId,
              coupang_product_id: coupangProductId,
              source_url: '',
              source_status: 'unknown',
              coupang_status: 'active',
              is_active: true,
              ...(ourPrice > 0 && { our_price_last: ourPrice }),
            }, { onConflict: 'megaload_user_id,product_id' });
            monitorCreated++;
          } catch (monErr) {
            console.warn(`[sync-coupang] monitor creation failed for ${savedId}:`, monErr);
          }

          totalSynced++;
        }

        page++;
        if (items.length < 100) hasMore = false;
      }

      // job 완료
      if (jobId) {
        await serviceClient
          .from('sh_sync_jobs')
          .update({ status: 'completed', result: { synced: totalSynced, monitorCreated }, completed_at: new Date().toISOString() })
          .eq('id', jobId);
      }

      return NextResponse.json({ success: true, synced: totalSynced, monitorCreated });
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
