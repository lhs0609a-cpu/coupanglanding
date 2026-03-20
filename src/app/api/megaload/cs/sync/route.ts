import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAllAuthenticatedAdapters } from '@/lib/megaload/adapters/factory';
import { classifyInquiry } from '@/lib/megaload/services/cs-template-engine';
import type { CsKeywordRule } from '@/lib/megaload/types';

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
    const adapters = await getAllAuthenticatedAdapters(serviceClient, shUserId);

    if (adapters.length === 0) {
      return NextResponse.json({ error: '연결된 채널이 없습니다' }, { status: 400 });
    }

    // 키워드 규칙 미리 로드
    const { data: keywordRules } = await serviceClient
      .from('sh_cs_keyword_rules')
      .select('*')
      .eq('is_active', true);
    const rules = (keywordRules || []) as unknown as CsKeywordRule[];

    // 최근 7일 문의 수집
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let totalCollected = 0;
    const channelResults: Record<string, number> = {};
    const channelErrors: Record<string, string> = {};

    for (const { channel, adapter } of adapters) {
      try {
        const result = await adapter.getInquiries({ startDate, endDate });
        channelResults[channel] = 0;

        for (const item of result.items) {
          const channelInquiryId = String(
            item.inquiryId || item.onlineInquiryId || item.callCenterInquiryId || ''
          );
          if (!channelInquiryId) continue;

          // 중복 체크
          const { data: existing } = await serviceClient
            .from('sh_cs_inquiries')
            .select('id')
            .eq('megaload_user_id', shUserId)
            .eq('channel', channel)
            .eq('channel_inquiry_id', channelInquiryId)
            .maybeSingle();
          if (existing) continue;

          const content = String(item.content || item.inquiryContent || item.question || '');
          const title = String(item.title || item.inquiryTitle || '');
          const buyerName = String(item.buyerName || item.customerName || '');
          const inquiredAt = String(item.createdAt || item.inquiryDate || new Date().toISOString());
          const inquirySource = String(item._inquirySource || 'product');
          const channelOrderId = String(item.orderId || item.orderNumber || '');
          const channelProductName = String(item.productName || item.sellerProductName || '');

          // 키워드 기반 자동 분류
          const classification = classifyInquiry(content + ' ' + title, rules);

          // 주문번호로 주문 매칭 (배송상태/상품명 자동 채움)
          let matchedProductName = channelProductName;
          if (channelOrderId && !matchedProductName) {
            const { data: order } = await serviceClient
              .from('sh_orders')
              .select('id')
              .eq('megaload_user_id', shUserId)
              .eq('channel_order_id', channelOrderId)
              .maybeSingle();
            if (order) {
              const { data: orderItems } = await serviceClient
                .from('sh_order_items')
                .select('product_name')
                .eq('order_id', (order as Record<string, unknown>).id)
                .limit(1);
              if (orderItems && orderItems.length > 0) {
                matchedProductName = (orderItems[0] as Record<string, unknown>).product_name as string;
              }
            }
          }

          await serviceClient.from('sh_cs_inquiries').insert({
            megaload_user_id: shUserId,
            channel,
            channel_inquiry_id: channelInquiryId,
            title: title || null,
            content,
            buyer_name: buyerName || null,
            status: 'pending',
            inquired_at: inquiredAt,
            inquiry_source: inquirySource,
            channel_order_id: channelOrderId || null,
            channel_product_name: matchedProductName || null,
            category_id: classification?.categoryId || null,
            urgency: classification?.urgency || 'normal',
          });

          channelResults[channel] = (channelResults[channel] || 0) + 1;
          totalCollected++;
        }
      } catch (err) {
        channelResults[channel] = -1;
        channelErrors[channel] = err instanceof Error ? err.message : '알 수 없는 오류';
        console.error(`[cs-sync] ${channel} error:`, err);
      }
    }

    // sync job 기록
    await serviceClient.from('sh_sync_jobs').insert({
      megaload_user_id: shUserId,
      channel: 'all',
      job_type: 'cs_sync',
      status: 'completed',
      result: { totalCollected, channels: channelResults },
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      totalCollected,
      channels: channelResults,
      ...(Object.keys(channelErrors).length > 0 && { errors: channelErrors }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '문의 수집 실패' },
      { status: 500 }
    );
  }
}
