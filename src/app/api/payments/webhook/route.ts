import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/payments/webhook
 * 토스페이먼츠 웹훅 핸들러
 * 결제 상태 변경(승인, 취소 등)을 수신하여 DB 동기화
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventType, data } = body;

    if (!eventType || !data) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED': {
        const { paymentKey, status, orderId } = data;

        if (!paymentKey || !orderId) break;

        // orderId로 트랜잭션 찾기
        const { data: tx } = await serviceClient
          .from('payment_transactions')
          .select('id, monthly_report_id')
          .eq('toss_order_id', orderId)
          .single();

        if (!tx) break;

        if (status === 'CANCELED' || status === 'PARTIAL_CANCELED') {
          await serviceClient
            .from('payment_transactions')
            .update({
              status: 'cancelled',
              raw_response: data,
            })
            .eq('id', tx.id);

          // 리포트 상태 되돌리기
          await serviceClient
            .from('monthly_reports')
            .update({
              fee_payment_status: 'awaiting_payment',
              fee_paid_at: null,
            })
            .eq('id', tx.monthly_report_id);
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/payments/webhook error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
