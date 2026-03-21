import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scanProductFolder } from '@/lib/megaload/services/local-product-reader';
import { calculateSellingPrice, DEFAULT_BRACKETS } from '@/lib/megaload/services/margin-pricing';

/**
 * GET — 폴더 스캔 + 상품 목록 미리보기
 * ?folderPath=J:\...\100-1
 *
 * (레거시 POST는 제거됨 — 등록은 batch/route.ts 사용)
 */
export async function GET(req: NextRequest) {
  try {
    const folderPath = req.nextUrl.searchParams.get('folderPath');
    if (!folderPath) {
      return NextResponse.json({ error: '폴더 경로를 입력해주세요.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // scanProductFolder 내부에서 Path Traversal 방어 수행
    const products = await scanProductFolder(folderPath);

    const preview = products.map((p) => {
      const sourcePrice = p.productJson.price || 0;
      const sellingPrice = calculateSellingPrice(sourcePrice);
      return {
        productCode: p.productCode,
        name: p.productJson.name || p.productJson.title || `product_${p.productCode}`,
        brand: p.productJson.brand || '',
        tags: p.productJson.tags || [],
        description: p.productJson.description || '',
        sourcePrice,
        sellingPrice,
        mainImageCount: p.mainImages.length,
        detailImageCount: p.detailImages.length,
        infoImageCount: p.infoImages.length,
        reviewImageCount: p.reviewImages.length,
        mainImages: p.mainImages,
        detailImages: p.detailImages,
        infoImages: p.infoImages,
        reviewImages: p.reviewImages,
        folderPath: p.folderPath,
        hasProductJson: !!(p.productJson.name || p.productJson.title),
        naverCategoryId: p.productJson.naverCategoryId
          || p.productJson.sourceCategory?.categoryId
          || undefined,
      };
    });

    return NextResponse.json({
      products: preview,
      totalCount: preview.length,
      brackets: DEFAULT_BRACKETS.map((b) => ({
        ...b,
        maxPrice: b.maxPrice === Infinity ? null : b.maxPrice,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '스캔 실패' },
      { status: 500 },
    );
  }
}

/**
 * POST — 레거시 엔드포인트 (deprecated)
 * 배치 등록은 /bulk-register/init-job + /bulk-register/batch 사용
 */
export async function POST() {
  return NextResponse.json(
    { error: '이 엔드포인트는 더 이상 사용되지 않습니다. /bulk-register/batch를 사용해주세요.' },
    { status: 410 },
  );
}
