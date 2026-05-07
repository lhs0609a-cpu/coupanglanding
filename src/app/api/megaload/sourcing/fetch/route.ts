import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AliexpressAdapter } from '@/lib/megaload/adapters/aliexpress.adapter';
import { Ali1688Adapter } from '@/lib/megaload/adapters/ali1688.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * URL에서 상품 ID 추출
 */
function extractProductId(url: string, platform: string): string | null {
  try {
    if (platform === 'aliexpress') {
      // https://www.aliexpress.com/item/1234567890.html
      // https://ko.aliexpress.com/item/1234567890.html
      const match = url.match(/item\/(\d+)/);
      return match ? match[1] : null;
    } else {
      // https://detail.1688.com/offer/1234567890.html
      // https://m.1688.com/offer/1234567890.html
      const match = url.match(/offer\/(\d+)/);
      return match ? match[1] : null;
    }
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const body = await request.json();
    const { url, platform } = body as { url: string; platform: 'aliexpress' | 'ali1688' };

    if (!url) {
      return NextResponse.json({ error: 'URL이 필요합니다' }, { status: 400 });
    }

    // URL 자동 감지
    const detectedPlatform = url.includes('1688.com') ? 'ali1688' : 'aliexpress';
    const targetPlatform = platform || detectedPlatform;

    const productId = extractProductId(url, targetPlatform);
    if (!productId) {
      return NextResponse.json({ error: '상품 ID를 추출할 수 없습니다. URL을 확인해주세요.' }, { status: 400 });
    }

    const shUserId = (shUser as Record<string, unknown>).id as string;

    // 소싱 플랫폼 자격증명 조회
    const { data: source } = await supabase
      .from('sh_sourcing_sources')
      .select('credentials')
      .eq('megaload_user_id', shUserId)
      .eq('platform', targetPlatform)
      .maybeSingle();

    if (!source) {
      return NextResponse.json({
        error: `${targetPlatform === 'aliexpress' ? 'AliExpress' : '1688'} 계정이 연결되지 않았습니다.`,
      }, { status: 400 });
    }

    const credentials = (source as Record<string, unknown>).credentials as Record<string, unknown>;

    if (targetPlatform === 'aliexpress') {
      const adapter = new AliexpressAdapter();
      await adapter.authenticate(credentials);
      const result = await adapter.getProduct(productId);

      // AliExpress 응답 파싱
      const data = (result as Record<string, unknown>).aliexpress_ds_product_get_response as Record<string, unknown> | undefined;
      const productData = (data?.result as Record<string, unknown>) || {};

      const product = {
        id: productId,
        platform: 'aliexpress',
        title: String(productData.product_title || productData.subject || ''),
        price_cny: Number(productData.target_original_price || productData.original_price || 0),
        image_url: String(productData.product_main_image_url || ''),
        supplier_name: String(productData.shop_name || ''),
        supplier_rating: Number(productData.evaluate_rate || 0),
        sales_count: Number(productData.order_count || 0),
        url,
      };

      return NextResponse.json({ product });
    } else {
      const adapter = new Ali1688Adapter();
      await adapter.authenticate(credentials);
      const result = await adapter.getProduct(productId);

      // 1688 응답 파싱
      const productData = (result as Record<string, unknown>).result as Record<string, unknown> || result;
      const imageObj = productData.image as Record<string, unknown> | undefined;
      const imageList = imageObj?.images as string[] | undefined;

      const product = {
        id: productId,
        platform: 'ali1688',
        title: String(productData.subject || productData.productName || ''),
        price_cny: Number(productData.referencePrice || productData.price || 0),
        image_url: String(imageList?.[0] || ''),
        supplier_name: String(productData.supplierLoginId || ''),
        supplier_rating: Number(productData.supplierScore || 0),
        sales_count: Number(productData.quantitySumMonth || 0),
        url,
      };

      return NextResponse.json({ product });
    }
  } catch (err) {
    console.error('[sourcing/fetch] error:', err);
    void logSystemError({ source: 'megaload/sourcing/fetch', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '상품 정보 가져오기 실패' }, { status: 500 });
  }
}
