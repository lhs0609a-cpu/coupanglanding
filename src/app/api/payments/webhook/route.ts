import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { completeSettlement } from '@/lib/payments/complete-settlement';
import { logSettlementError } from '@/lib/payments/settlement-errors';

export const maxDuration = 30;


// 모듈 로드 시점 env 검증 — 시크릿 미설정 채로 배포되면 즉시 명시적 경고를 남긴다.
//   prod 빌드 시 console.error 가 Vercel 빌드/런타임 로그에 남아 운영자가 즉시 인지 가능.
//   미설정 자체로 throw 하면 webhook 외 다른 endpoint까지 영향 가능하므로
//   로그만 남기고 verifyWebhookAuth 가 항상 false 반환하는 기존 동작은 유지.
(() => {
  const hasShared = !!process.env.TOSS_WEBHOOK_SECRET;
  const hasSigning = !!process.env.TOSS_WEBHOOK_SIGNING_KEY;
  if (!hasShared && !hasSigning) {
    console.error(
      '[webhook][BOOT] 🚨 TOSS_WEBHOOK_SECRET 및 TOSS_WEBHOOK_SIGNING_KEY 둘 다 미설정 — ' +
      '모든 결제 웹훅이 401 거부됨. 결제 후 정산 자동 확정이 멈춤. ' +
      'Vercel 환경변수에 둘 중 하나 이상 즉시 설정 필요.',
    );
  }
})();

/**
 * POST /api/payments/webhook
 * 토스페이먼츠 웹훅 핸들러
 *
 * 인증: 두 가지 중 하나를 반드시 통과해야 한다.
 *   1) 공유 비밀 헤더: x-toss-webhook-secret === TOSS_WEBHOOK_SECRET
 *   2) HMAC-SHA256 서명: x-toss-signature === hex(hmac(TOSS_WEBHOOK_SIGNING_KEY, raw body))
 *
 * 둘 다 미설정이면 외부 공격이 가능하므로 401 을 반환한다.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    if (!verifyWebhookAuth(request, rawBody)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { eventType?: string; data?: Record<string, unknown>; createdAt?: string };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { eventType, data, createdAt } = body;

    if (!eventType || !data) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
    }

    // replay 방어: 5분 이상 지난 이벤트는 거부
    if (createdAt) {
      const eventTime = new Date(createdAt).getTime();
      if (!Number.isNaN(eventTime)) {
        const drift = Math.abs(Date.now() - eventTime);
        if (drift > 5 * 60 * 1000) {
          return NextResponse.json({ error: 'Event too old' }, { status: 400 });
        }
      }
    }

    const serviceClient = await createServiceClient();

    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED': {
        const paymentKey = data.paymentKey as string | undefined;
        const status = data.status as string | undefined;
        const orderId = data.orderId as string | undefined;

        if (!paymentKey || !orderId || !status) break;

        // orderId로 트랜잭션 찾기
        const { data: tx } = await serviceClient
          .from('payment_transactions')
          .select('id, pt_user_id, monthly_report_id, status')
          .eq('toss_order_id', orderId)
          .single();

        if (!tx) break;

        // 이미 해당 tx 에 paymentKey 가 없는 경우도 토스가 내려준 값을 신뢰할 수 있는 수준(서명 검증 완료)
        if (status === 'CANCELED' || status === 'PARTIAL_CANCELED') {
          if (tx.status === 'success') {
            await serviceClient
              .from('payment_transactions')
              .update({ status: 'cancelled', raw_response: data })
              .eq('id', tx.id);

            // 이번 리포트에 다른 성공 tx 가 남아있으면 상태 유지, 아니면 되돌린다.
            const { count: otherSuccess } = await serviceClient
              .from('payment_transactions')
              .select('id', { count: 'exact', head: true })
              .eq('monthly_report_id', tx.monthly_report_id)
              .eq('status', 'success')
              .neq('id', tx.id);

            if (!otherSuccess) {
              await serviceClient
                .from('monthly_reports')
                .update({
                  fee_payment_status: 'awaiting_payment',
                  fee_paid_at: null,
                  fee_confirmed_at: null,
                  payment_status: 'pending',
                  payment_confirmed_at: null,
                })
                .eq('id', tx.monthly_report_id);

              const todayDateStr = new Date().toISOString().slice(0, 10);
              await serviceClient
                .from('pt_users')
                .update({ payment_overdue_since: todayDateStr })
                .eq('id', tx.pt_user_id)
                .is('payment_overdue_since', null);
            }
          }
          break;
        }

        if (status === 'DONE') {
          // 웹훅으로 성공 확정 (API 응답 유실 폴백).
          if (tx.status === 'success') break; // 멱등

          const { error: rpcErr } = await serviceClient.rpc('payment_mark_success', {
            p_tx_id: tx.id,
            p_payment_key: paymentKey,
            p_receipt_url: (data.receipt as { url?: string } | undefined)?.url ?? null,
            p_raw: data,
            p_approved_at: (data.approvedAt as string | undefined) ?? new Date().toISOString(),
          });

          if (rpcErr) {
            await logSettlementError(serviceClient, {
              stage: 'webhook_mark_success_rpc',
              monthlyReportId: tx.monthly_report_id,
              ptUserId: tx.pt_user_id,
              error: rpcErr,
              detail: { orderId, paymentKey },
            });
            break;
          }

          // 정산 후처리
          const { data: fullReport } = await serviceClient
            .from('monthly_reports')
            .select('*')
            .eq('id', tx.monthly_report_id)
            .single();

          if (fullReport) {
            try {
              await completeSettlement(serviceClient, fullReport);
            } catch (settleErr) {
              await logSettlementError(serviceClient, {
                stage: 'webhook_complete_settlement',
                monthlyReportId: tx.monthly_report_id,
                ptUserId: tx.pt_user_id,
                error: settleErr,
              });
            }
          }

          await serviceClient.rpc('payment_clear_overdue_if_settled', {
            p_pt_user_id: tx.pt_user_id,
          });
          break;
        }

        if (status === 'ABORTED' || status === 'EXPIRED') {
          await serviceClient
            .from('payment_transactions')
            .update({
              status: 'failed',
              failure_code: `WEBHOOK_${status}`,
              failure_message: `토스 웹훅: 결제 ${status}`,
              raw_response: data,
              failed_at: new Date().toISOString(),
            })
            .eq('id', tx.id)
            .in('status', ['pending', 'failed']);
          break;
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

/**
 * 웹훅 인증. 둘 중 하나라도 통과하면 true.
 * 시크릿이 모두 미설정이면 항상 false (외부 공격 차단).
 */
function verifyWebhookAuth(request: NextRequest, rawBody: string): boolean {
  const sharedSecret = process.env.TOSS_WEBHOOK_SECRET;
  const signingKey = process.env.TOSS_WEBHOOK_SIGNING_KEY;

  if (!sharedSecret && !signingKey) {
    console.error('[webhook] TOSS_WEBHOOK_SECRET / TOSS_WEBHOOK_SIGNING_KEY 미설정 — 모든 요청 거부');
    return false;
  }

  // 1) 공유 비밀 헤더
  if (sharedSecret) {
    const headerSecret = request.headers.get('x-toss-webhook-secret');
    if (headerSecret && safeEqual(headerSecret, sharedSecret)) return true;
  }

  // 2) HMAC 서명
  if (signingKey) {
    const signature = request.headers.get('x-toss-signature');
    if (signature) {
      const expected = createHmac('sha256', signingKey).update(rawBody).digest('hex');
      if (safeEqual(signature, expected)) return true;
    }
  }

  return false;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
