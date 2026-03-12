import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import { scanProductFolder, uploadLocalImages } from '@/lib/sellerhub/services/local-product-reader';
import { calculateSellingPrice, DEFAULT_BRACKETS, type PriceBracket } from '@/lib/sellerhub/services/margin-pricing';
import { buildCoupangProductPayload, type DeliveryInfo, type ReturnInfo } from '@/lib/sellerhub/services/coupang-product-builder';

/**
 * GET — 폴더 스캔 + 상품 목록 미리보기
 * ?folderPath=J:\...\100-1
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

    const products = await scanProductFolder(folderPath);

    const preview = products.map((p) => {
      const sourcePrice = p.productJson.price || 0;
      const sellingPrice = calculateSellingPrice(sourcePrice);
      return {
        productCode: p.productCode,
        name: p.productJson.name || p.productJson.title || `product_${p.productCode}`,
        brand: p.productJson.brand || '',
        sourcePrice,
        sellingPrice,
        mainImageCount: p.mainImages.length,
        detailImageCount: p.detailImages.length,
        infoImageCount: p.infoImages.length,
        folderPath: p.folderPath,
        hasProductJson: !!(p.productJson.name || p.productJson.title),
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

// ---- POST body 타입 ----
interface BulkRegisterBody {
  folderPath: string;
  productCodes?: string[];
  brackets?: (Omit<PriceBracket, 'maxPrice'> & { maxPrice: number | null })[];
  categoryCode: string;
  deliveryInfo: DeliveryInfo;
  returnInfo: ReturnInfo;
  stock?: number;
}

/**
 * POST — 선택된 상품 실제 등록
 *
 * 각 상품별 프로세스:
 *  1. product.json에서 이름/가격 읽기
 *  2. 마진율로 판매가 계산
 *  3. main_images → Supabase 업로드 → CDN URL (대표이미지)
 *  4. output/ → Supabase 업로드 → CDN URL (상세페이지)
 *  5. 쿠팡 페이로드 빌드
 *  6. CoupangAdapter.createProduct() 호출
 *  7. sh_products / sh_product_channels / sh_product_options DB 저장
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;

    const body = (await req.json()) as BulkRegisterBody;
    const {
      folderPath,
      productCodes,
      brackets: rawBrackets,
      categoryCode,
      deliveryInfo,
      returnInfo,
      stock,
    } = body;

    if (!folderPath) {
      return NextResponse.json({ error: '폴더 경로가 필요합니다.' }, { status: 400 });
    }
    if (!categoryCode) {
      return NextResponse.json({ error: '카테고리 코드가 필요합니다.' }, { status: 400 });
    }
    if (!deliveryInfo?.outboundShippingPlaceCode) {
      return NextResponse.json({ error: '출고지를 선택해주세요.' }, { status: 400 });
    }
    if (!returnInfo?.returnCenterCode) {
      return NextResponse.json({ error: '반품지를 선택해주세요.' }, { status: 400 });
    }

    // 가격 구간 복원 (Infinity는 JSON으로 전송 못하므로 null → Infinity)
    const brackets: PriceBracket[] = rawBrackets
      ? rawBrackets.map((b) => ({
          ...b,
          maxPrice: b.maxPrice === null ? Infinity : b.maxPrice,
        }))
      : DEFAULT_BRACKETS;

    const serviceClient = await createServiceClient();

    // 어댑터 인증 + vendorId 추출
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    // 폴더 스캔
    const allProducts = await scanProductFolder(folderPath);
    const targetProducts = productCodes && productCodes.length > 0
      ? allProducts.filter((p) => productCodes.includes(p.productCode))
      : allProducts;

    if (targetProducts.length === 0) {
      return NextResponse.json({ error: '등록할 상품이 없습니다.' }, { status: 400 });
    }

    // sync job 생성
    const { data: job } = await serviceClient
      .from('sh_sync_jobs')
      .insert({
        sellerhub_user_id: shUserId,
        channel: 'coupang',
        job_type: 'bulk_register',
        status: 'running',
        total_count: targetProducts.length,
        processed_count: 0,
        error_count: 0,
      })
      .select()
      .single();
    const jobId = (job as Record<string, unknown>)?.id as string;

    const results: { productCode: string; success: boolean; name?: string; channelProductId?: string; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < targetProducts.length; i++) {
      const product = targetProducts[i];
      const productName = product.productJson.name || product.productJson.title || `product_${product.productCode}`;

      try {
        // 1. 판매가 계산
        const sourcePrice = product.productJson.price || 0;
        const sellingPrice = calculateSellingPrice(sourcePrice, brackets);

        // 2. 대표이미지 업로드 (main_images/product_*.jpg)
        const mainImageUrls = await uploadLocalImages(product.mainImages, shUserId);

        // 3. 상세페이지 이미지 업로드 (output/*.jpg)
        const detailImageUrls = await uploadLocalImages(product.detailImages, shUserId);

        // 4. 쿠팡 페이로드 빌드
        const payload = buildCoupangProductPayload({
          vendorId,
          product,
          sellingPrice,
          categoryCode,
          mainImageUrls,
          detailImageUrls,
          deliveryInfo,
          returnInfo,
          stock: stock || 999,
          brand: product.productJson.brand,
        });

        // 5. 쿠팡 API 호출
        const result = await coupangAdapter.createProduct(payload);

        // 6. DB 저장 — sh_products
        const { data: savedProduct } = await serviceClient
          .from('sh_products')
          .insert({
            sellerhub_user_id: shUserId,
            coupang_product_id: result.channelProductId,
            product_name: productName,
            brand: product.productJson.brand || '',
            category_id: categoryCode,
            status: 'active',
            raw_data: {
              sourceFolder: product.folderPath,
              sourcePrice,
              productCode: product.productCode,
              mainImageUrls,
              detailImageUrls,
            },
          })
          .select('id')
          .single();

        const savedId = (savedProduct as Record<string, unknown>)?.id as string;

        if (savedId) {
          // sh_product_channels
          await serviceClient.from('sh_product_channels').insert({
            product_id: savedId,
            sellerhub_user_id: shUserId,
            channel: 'coupang',
            channel_product_id: result.channelProductId,
            status: 'active',
            last_synced_at: new Date().toISOString(),
          });

          // sh_product_options (단일 옵션)
          await serviceClient.from('sh_product_options').insert({
            product_id: savedId,
            sellerhub_user_id: shUserId,
            option_name: '기본',
            sku: product.productCode,
            sale_price: sellingPrice,
            cost_price: sourcePrice,
            stock: stock || 999,
          });
        }

        results.push({
          productCode: product.productCode,
          success: true,
          name: productName,
          channelProductId: result.channelProductId,
        });
        successCount++;
      } catch (err) {
        results.push({
          productCode: product.productCode,
          success: false,
          name: productName,
          error: err instanceof Error ? err.message : '알 수 없는 오류',
        });
        errorCount++;
      }

      // 진행률 업데이트
      if (jobId) {
        await serviceClient
          .from('sh_sync_jobs')
          .update({ processed_count: i + 1, error_count: errorCount })
          .eq('id', jobId);
      }

      // Rate limit: 쿠팡 5 calls/sec
      // 상품 1개당 이미지 업로드 + createProduct + DB 저장 = 여러 호출이므로 200ms 추가 딜레이
      if (i < targetProducts.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // job 완료
    if (jobId) {
      await serviceClient
        .from('sh_sync_jobs')
        .update({
          status: errorCount === targetProducts.length ? 'failed' : 'completed',
          processed_count: targetProducts.length,
          error_count: errorCount,
          result: { successCount, errorCount },
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    return NextResponse.json({
      success: true,
      totalCount: targetProducts.length,
      successCount,
      errorCount,
      results,
      jobId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '등록 실패' },
      { status: 500 },
    );
  }
}
