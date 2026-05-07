import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AliexpressAdapter } from '@/lib/megaload/adapters/aliexpress.adapter';
import { Ali1688Adapter } from '@/lib/megaload/adapters/ali1688.adapter';

export const maxDuration = 30;


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
    const { keyword, platform, page } = body as {
      keyword: string;
      platform: 'aliexpress' | 'ali1688';
      page?: number;
    };

    if (!keyword) {
      return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 });
    }

    const shUserId = (shUser as Record<string, unknown>).id as string;

    // 소싱 플랫폼 자격증명 조회
    const { data: source } = await supabase
      .from('sh_sourcing_sources')
      .select('credentials')
      .eq('megaload_user_id', shUserId)
      .eq('platform', platform)
      .maybeSingle();

    if (!source) {
      return NextResponse.json({
        error: `${platform === 'aliexpress' ? 'AliExpress' : '1688'} 계정이 연결되지 않았습니다. 채널 설정에서 연결해주세요.`,
      }, { status: 400 });
    }

    const credentials = (source as Record<string, unknown>).credentials as Record<string, unknown>;

    if (platform === 'aliexpress') {
      const adapter = new AliexpressAdapter();
      await adapter.authenticate(credentials);
      const result = await adapter.searchProducts(keyword, page || 1);

      // AliExpress API 응답 → 프론트 형식으로 변환
      const rawProducts = ((result as Record<string, unknown>).aliexpress_ds_recommend_feed_get_response as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
      const items = ((rawProducts?.products as Record<string, unknown>)?.product || []) as Record<string, unknown>[];

      const products = items.map((item) => ({
        id: String(item.product_id || ''),
        platform: 'aliexpress',
        title: String(item.product_title || ''),
        price_cny: Number(item.target_original_price || item.original_price || 0),
        image_url: String(item.product_main_image_url || ''),
        supplier_name: String(item.shop_name || item.seller_name || ''),
        supplier_rating: Number(item.evaluate_rate || 0),
        sales_count: Number(item.lastest_volume || item.sale_count || 0),
        url: `https://www.aliexpress.com/item/${item.product_id}.html`,
      }));

      return NextResponse.json({ products });
    } else {
      const adapter = new Ali1688Adapter();
      await adapter.authenticate(credentials);
      const result = await adapter.searchProducts(keyword, page || 1);

      // 1688 API 응답 → 프론트 형식으로 변환
      const items = ((result as Record<string, unknown>).result as Record<string, unknown>[]) || [];

      const products = items.map((item) => {
        const imgObj = item.image as Record<string, unknown> | undefined;
        const imgList = imgObj?.images as string[] | undefined;
        return {
          id: String(item.offerId || item.productID || ''),
          platform: 'ali1688',
          title: String(item.subject || item.productName || ''),
          price_cny: Number(item.price || item.referencePrice || 0),
          image_url: String(item.imageUrl || imgList?.[0] || ''),
          supplier_name: String(item.supplierLoginId || item.companyName || ''),
          supplier_rating: Number(item.supplierScore || 0),
          sales_count: Number(item.quantitySumMonth || 0),
          url: `https://detail.1688.com/offer/${item.offerId || item.productID}.html`,
        };
      });

      return NextResponse.json({ products });
    }
  } catch (err) {
    console.error('[sourcing/search] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '검색 실패' }, { status: 500 });
  }
}
