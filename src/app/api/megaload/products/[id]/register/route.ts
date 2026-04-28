import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { mapCategory } from '@/lib/megaload/services/ai.service';
import type { Channel } from '@/lib/megaload/types';
import { isChannelSupported } from '@/lib/megaload/types';
import { CHANNELS, CHANNEL_LABELS } from '@/lib/megaload/constants';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const requestedChannels = (body.channels || CHANNELS.filter((c) => c !== 'coupang')) as Channel[];
    const margins = (body.margins || {}) as Record<string, number>;

    // 준비 중 채널은 요청 단계에서 즉시 차단
    const unsupported = requestedChannels.filter((c) => !isChannelSupported(c));
    if (unsupported.length > 0) {
      const names = unsupported.map((c) => CHANNEL_LABELS[c]).join(', ');
      return NextResponse.json(
        { error: `${names} 은(는) 준비 중인 채널입니다.` },
        { status: 400 }
      );
    }
    const targetChannels = requestedChannels.filter((c) => c !== 'coupang');

    const serviceClient = await createServiceClient();

    // 마스터 상품 조회
    const { data: product } = await serviceClient
      .from('sh_products')
      .select('*, sh_product_options(*)')
      .eq('id', id)
      .single();

    if (!product) return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });

    const productData = product as Record<string, unknown>;
    const shUserId = productData.megaload_user_id as string;
    const productName = productData.product_name as string;
    const categoryId = productData.category_id as string;

    // 머리말/꼬리말 조회
    const { data: headers } = await serviceClient
      .from('sh_product_headers')
      .select('*')
      .eq('megaload_user_id', shUserId);

    const results: Record<string, { success: boolean; channelProductId?: string; error?: string }> = {};

    // 각 채널에 동시 등록 (Promise.allSettled)
    const registrations = targetChannels.map(async (channel) => {
      try {
        const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, channel);

        // AI 카테고리 매핑
        const categoryMapping = await mapCategory(productName, categoryId, channel);

        // 채널별 머리말/꼬리말
        const header = (headers || []).find((h: Record<string, unknown>) => h.channel === channel && h.type === 'header');
        const footer = (headers || []).find((h: Record<string, unknown>) => h.channel === channel && h.type === 'footer');
        const headerHtml = (header as Record<string, unknown>)?.content || '';
        const footerHtml = (footer as Record<string, unknown>)?.content || '';

        // 기준 가격 & 마진 적용
        const options = ((productData as Record<string, unknown>).sh_product_options as Array<Record<string, unknown>>) || [];
        const rawSellerPrice = Number((productData.raw_data as Record<string, unknown>)?.sellerProductPrice || 0);
        const basePrice = Number(options[0]?.sale_price) || rawSellerPrice;

        let salePrice: number;
        if (typeof margins[channel] === 'number') {
          salePrice = Math.round(basePrice * (1 + margins[channel] / 100));
        } else if (body.priceMode === 'same') {
          salePrice = basePrice;
        } else {
          salePrice = Number(body.prices?.[channel]) || basePrice;
        }

        // 상품 데이터 구성
        const channelProduct = {
          productName,
          categoryId: categoryMapping.categoryId || categoryId,
          description: `${headerHtml}${(productData.raw_data as Record<string, unknown>)?.content || ''}${footerHtml}`,
          salePrice,
          options,
          images: (productData.raw_data as Record<string, unknown>)?.images || [],
        };

        const result = await adapter.createProduct(channelProduct as Record<string, unknown>);

        // 채널 매핑 저장
        const priceRule = typeof margins[channel] === 'number'
          ? { mode: 'margin', margin_percent: margins[channel], base_price: basePrice, final_price: salePrice }
          : body.priceMode === 'same'
            ? { mode: 'same' }
            : { mode: 'custom', price: body.prices?.[channel] };

        await serviceClient
          .from('sh_product_channels')
          .upsert({
            product_id: id,
            megaload_user_id: shUserId,
            channel,
            channel_product_id: result.channelProductId,
            status: 'active',
            price_rule: priceRule,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'product_id,channel' });

        // 카테고리 매핑 저장
        if (categoryMapping.categoryId) {
          await serviceClient
            .from('sh_category_mappings')
            .upsert({
              megaload_user_id: shUserId,
              source_category_id: categoryId,
              channel,
              channel_category_id: categoryMapping.categoryId,
              channel_category_name: categoryMapping.categoryName,
              confidence: categoryMapping.confidence,
              is_ai_generated: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'megaload_user_id,source_category_id,channel' });
        }

        return { channel, success: true, channelProductId: result.channelProductId };
      } catch (err) {
        return { channel, success: false, error: err instanceof Error ? err.message : '등록 실패' };
      }
    });

    const settled = await Promise.allSettled(registrations);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        results[r.channel] = { success: r.success, channelProductId: r.channelProductId, error: r.error };
      }
    }

    // 쿠팡 등록 성공 시 품절 모니터 자동 등록
    const coupangResult = results['coupang'];
    if (coupangResult?.success && coupangResult.channelProductId) {
      const sourceUrl = (productData.source_url as string)
        || ((productData.raw_data as Record<string, unknown>)?.sourceUrl as string)
        || '';
      try {
        await serviceClient.from('sh_stock_monitors').upsert({
          megaload_user_id: shUserId,
          product_id: id,
          coupang_product_id: coupangResult.channelProductId,
          source_url: sourceUrl,
          source_status: sourceUrl ? 'in_stock' : 'unknown',
          coupang_status: 'active',
          is_active: true,
        }, { onConflict: 'megaload_user_id,product_id' });
      } catch (monErr) {
        console.warn(`[register] 품절 모니터 등록 실패 (${id}):`, monErr);
      }
    }

    const successCount = Object.values(results).filter((r) => r.success).length;
    return NextResponse.json({ success: true, results, successCount, totalChannels: targetChannels.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '상품 등록 실패' }, { status: 500 });
  }
}
