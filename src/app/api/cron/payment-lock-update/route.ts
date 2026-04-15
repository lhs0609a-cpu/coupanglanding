import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateLockLevel } from '@/lib/payments/billing-constants';
import { createNotification } from '@/lib/utils/notifications';

/**
 * GET /api/cron/payment-lock-update
 * 매일 04:00 KST 실행. payment_overdue_since 기준으로 lock_level 갱신.
 *
 * - exempt_until > 오늘 → lock 0 강제
 * - 그 외 → calculateLockLevel(overdue_since) 적용
 * - 레벨이 상승했을 때만 사용자에게 알림
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();
    const today = new Date();
    const todayDateStr = today.toISOString().slice(0, 10);

    // 연체 중이거나 락이 걸려 있는 사용자만 대상 (전수 스캔 회피)
    const { data: candidates } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, payment_overdue_since, payment_lock_level, payment_lock_exempt_until');

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, updated: 0 });
    }

    let scanned = 0;
    let updated = 0;
    let escalated = 0;

    for (const u of candidates) {
      scanned++;
      const exemptActive =
        u.payment_lock_exempt_until && u.payment_lock_exempt_until > todayDateStr;

      const newLevel = exemptActive
        ? 0
        : calculateLockLevel(u.payment_overdue_since, today);

      if (newLevel === u.payment_lock_level) continue;

      await serviceClient
        .from('pt_users')
        .update({ payment_lock_level: newLevel })
        .eq('id', u.id);

      updated++;

      if (newLevel > (u.payment_lock_level || 0)) {
        escalated++;
        await notifyLevelEscalation(serviceClient, u.profile_id, newLevel);
      }
    }

    return NextResponse.json({ success: true, scanned, updated, escalated });
  } catch (err) {
    console.error('cron/payment-lock-update error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

async function notifyLevelEscalation(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  profileId: string,
  level: number,
) {
  const titles: Record<number, string> = {
    1: '서비스 일부 제한 (1단계)',
    2: '서비스 쓰기 전체 제한 (2단계)',
    3: '서비스 완전 차단 (3단계)',
  };
  const messages: Record<number, string> = {
    1: '결제 미이행으로 신규 상품 등록·일괄 처리가 차단되었습니다. 즉시 결제 카드를 등록/변경해주세요.',
    2: '결제 미이행으로 모든 쓰기 작업이 차단되었습니다. 조회만 가능합니다. 즉시 결제 카드를 등록/변경해주세요.',
    3: '결제 미이행으로 서비스가 완전히 차단되었습니다. 결제 설정 페이지에서 카드를 등록해야 다시 이용할 수 있습니다.',
  };

  await createNotification(serviceClient, {
    userId: profileId,
    type: 'fee_payment',
    title: titles[level] || '결제 락 레벨 변경',
    message: messages[level] || '결제 상태를 확인해주세요.',
    link: '/my/settings',
  });
}
