import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import {
  isCommodityCategory,
  getCategoryQueries,
  searchPexels,
  selectPhotosForSeller,
  downloadAndUploadStockImage,
  queryBankImages,
  selectBankUrlsForSeller,
} from '@/lib/megaload/services/stock-image-service';
import { resolveStockCategoryKey } from '@/lib/megaload/data/stock-image-categories';

interface StockImageProduct {
  uid: string;
  categoryPath: string;
  productCode: string;
}

interface StockImageBody {
  products: StockImageProduct[];
  count?: number; // 상품당 사진 수 (기본 5)
}

/**
 * POST — 큐레이션 뱅크 우선 조회 → Pexels 폴백
 *
 * 새 흐름:
 * 1) stock_image_bank DB 조회 → 셀러 시드 셔플 → CDN URL 바로 반환
 * 2) DB에 없고 PEXELS_API_KEY 있으면 → 기존 Pexels 폴백
 */
export async function POST(req: NextRequest) {
  try {
    // 1. 인증
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' },
        { status: 404 },
      );
    }

    // 2. 요청 파싱
    const body = (await req.json()) as StockImageBody;
    const { products, count = 5 } = body;

    if (!products?.length) {
      return NextResponse.json({ error: 'products 배열이 필요합니다.' }, { status: 400 });
    }

    // 3. 카테고리별 그룹핑
    const categoryGroups = new Map<string, StockImageProduct[]>();
    const skipped: string[] = [];

    for (const p of products) {
      if (!isCommodityCategory(p.categoryPath)) {
        skipped.push(p.uid);
        continue;
      }
      const group = categoryGroups.get(p.categoryPath) || [];
      group.push(p);
      categoryGroups.set(p.categoryPath, group);
    }

    const results: Record<string, {
      stockImageUrls: string[];
      categoryPath: string;
      stockCategoryKey?: string;
      cached: boolean;
    }> = {};

    // 4. DB 우선 조회 (카테고리별)
    const bankCache = new Map<string, string[]>();

    for (const [catPath, prods] of categoryGroups) {
      const resolved = resolveStockCategoryKey(catPath);
      if (!resolved) continue;

      // 카테고리 키별 뱅크 이미지 캐시
      if (!bankCache.has(resolved.key)) {
        const bankImages = await queryBankImages(resolved.key, serviceClient);
        bankCache.set(resolved.key, bankImages.map(img => img.cdn_url));
      }

      const cdnUrls = bankCache.get(resolved.key) || [];
      if (cdnUrls.length === 0) continue;

      for (const p of prods) {
        const sellerSeed = `${shUserId}_${p.productCode}`;
        const urls = selectBankUrlsForSeller(cdnUrls, sellerSeed, count);

        if (urls.length > 0) {
          results[p.uid] = {
            stockImageUrls: urls,
            categoryPath: catPath,
            stockCategoryKey: resolved.key,
            cached: true,
          };
        }
      }
    }

    // 5. 뱅크에서 못 찾은 상품 → Pexels 폴백
    const apiKey = process.env.PEXELS_API_KEY;
    const unresolved = new Map<string, StockImageProduct[]>();

    for (const [catPath, prods] of categoryGroups) {
      const remaining = prods.filter(p => !results[p.uid]);
      if (remaining.length > 0) {
        unresolved.set(catPath, remaining);
      }
    }

    if (apiKey && unresolved.size > 0) {
      for (const [catPath, prods] of unresolved) {
        const queries = getCategoryQueries(catPath);
        if (!queries) {
          for (const p of prods) skipped.push(p.uid);
          continue;
        }

        try {
          const photos = await searchPexels(catPath, apiKey, 30);
          if (photos.length === 0) {
            for (const p of prods) skipped.push(p.uid);
            continue;
          }

          for (const p of prods) {
            const sellerSeed = `${shUserId}_${p.productCode}`;
            const selected = selectPhotosForSeller(photos, sellerSeed, count);

            const uploadPromises = selected.map(photo =>
              downloadAndUploadStockImage(
                photo.src.large,
                shUserId,
                serviceClient,
              ).catch(err => {
                console.error(`[stock-images] Upload failed for photo ${photo.id}:`, err);
                return null;
              }),
            );

            const urls = (await Promise.all(uploadPromises)).filter((u): u is string => u !== null);

            if (urls.length > 0) {
              results[p.uid] = {
                stockImageUrls: urls,
                categoryPath: catPath,
                cached: false,
              };
            } else {
              skipped.push(p.uid);
            }
          }
        } catch (err) {
          console.error(`[stock-images] Pexels fallback failed for "${catPath}":`, err);
          for (const p of prods) skipped.push(p.uid);
        }
      }
    } else if (unresolved.size > 0) {
      // API 키 없고 뱅크에도 없는 경우
      for (const prods of unresolved.values()) {
        for (const p of prods) skipped.push(p.uid);
      }
    }

    return NextResponse.json({ results, skipped });
  } catch (err) {
    console.error('[stock-images] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '스톡 이미지 처리 실패' },
      { status: 500 },
    );
  }
}
