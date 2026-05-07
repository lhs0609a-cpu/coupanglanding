import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AliexpressAdapter } from '@/lib/megaload/adapters/aliexpress.adapter';
import { Ali1688Adapter } from '@/lib/megaload/adapters/ali1688.adapter';

export const maxDuration = 30;


export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: shUser } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!shUser) {
    return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });
  }

  const body = await request.json();
  const { sourcingProductId, orderId, quantity, platform, orderType } = body;
  const shUserId = (shUser as Record<string, unknown>).id as string;

  // 발주 기록 생성
  const { data: sourcingOrder, error } = await supabase
    .from('sh_sourcing_orders')
    .insert({
      megaload_user_id: shUserId,
      sourcing_product_id: sourcingProductId,
      order_id: orderId,
      platform,
      order_type: orderType || 'dropshipping',
      quantity: quantity || 1,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sourcingOrderData = sourcingOrder as Record<string, unknown>;

  // 소싱 소스 자격증명 조회
  const { data: source } = await supabase
    .from('sh_sourcing_sources')
    .select('credentials')
    .eq('megaload_user_id', shUserId)
    .eq('platform', platform)
    .single();

  if (!source) {
    // 자격증명 없으면 pending 상태로 유지 (수동 발주 필요)
    return NextResponse.json({
      success: true,
      sourcingOrder: sourcingOrderData,
      message: `${platform} 계정이 연결되지 않아 수동 발주가 필요합니다.`,
      autoOrdered: false,
    });
  }

  // 플랫폼별 자동 발주 시도
  try {
    const credentials = (source as Record<string, unknown>).credentials as Record<string, unknown>;

    if (platform === 'aliexpress') {
      const adapter = new AliexpressAdapter();
      await adapter.authenticate(credentials);

      // 소싱 상품 정보 조회
      const { data: sourcingProduct } = await supabase
        .from('sh_sourcing_products')
        .select('platform_product_id, platform_sku_id')
        .eq('id', sourcingProductId)
        .single();

      if (sourcingProduct) {
        const sp = sourcingProduct as Record<string, unknown>;
        const orderResult = await adapter.createOrder(
          sp.platform_product_id as string,
          sp.platform_sku_id as string,
          quantity || 1,
          {},
        );

        // 발주 상태 업데이트
        await supabase
          .from('sh_sourcing_orders')
          .update({
            status: 'ordered',
            platform_order_id: (orderResult as Record<string, unknown>).orderId,
            ordered_at: new Date().toISOString(),
          })
          .eq('id', sourcingOrderData.id);
      }
    } else if (platform === 'ali1688') {
      const adapter = new Ali1688Adapter();
      await adapter.authenticate(credentials);

      const { data: sourcingProduct } = await supabase
        .from('sh_sourcing_products')
        .select('platform_product_id, platform_sku_id')
        .eq('id', sourcingProductId)
        .single();

      if (sourcingProduct) {
        const sp = sourcingProduct as Record<string, unknown>;
        const orderResult = await adapter.createOrder(
          sp.platform_product_id as string,
          sp.platform_sku_id as string,
          quantity || 1,
        );

        await supabase
          .from('sh_sourcing_orders')
          .update({
            status: 'ordered',
            platform_order_id: (orderResult as Record<string, unknown>).orderId,
            ordered_at: new Date().toISOString(),
          })
          .eq('id', sourcingOrderData.id);
      }
    }

    return NextResponse.json({
      success: true,
      sourcingOrder: sourcingOrderData,
      message: '자동 발주가 완료되었습니다.',
      autoOrdered: true,
    });
  } catch (err) {
    // 자동 발주 실패 → pending 유지
    console.error(`[auto-order] ${platform} error:`, err);
    return NextResponse.json({
      success: true,
      sourcingOrder: sourcingOrderData,
      message: `자동 발주 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}. 수동 발주가 필요합니다.`,
      autoOrdered: false,
    });
  }
}
