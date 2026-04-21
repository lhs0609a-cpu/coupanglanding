import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateLockLevel, kstDateStr } from '@/lib/payments/billing-constants';
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
    const todayDateStr = kstDateStr(today);

    // 연체 중이거나 락이 걸려 있거나 관리자 override 상태인 사용자만 대상
    const { data: candidates } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, payment_overdue_since, payment_lock_level, payment_lock_exempt_until, admin_override_level, payment_retry_in_progress');

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, updated: 0 });
    }

    let scanned = 0;
    let updated = 0;
    let escalated = 0;

    for (const u of candidates) {
      scanned++;

      // 1순위: 관리자 override — cron이 덮어쓰지 않음
      if (u.admin_override_level !== null && u.admin_override_level !== undefined) {
        if (u.admin_override_level !== u.payment_lock_level) {
          await serviceClient
            .from('pt_users')
            .update({ payment_lock_level: u.admin_override_level })
            .eq('id', u.id);
          updated++;
        }
        continue;
      }

      // 2순위: exempt 활성 → 강제 0
      const exemptActive =
        u.payment_lock_exempt_until && u.payment_lock_exempt_until > todayDateStr;

      // 3순위: payment_overdue_since 기반 자동 계산
      // 재시도 진행 중이면 락 유예 (D+3까지 자동 재시도가 마지막 결정 → 그 후에야 lock 시작)
      const newLevel = exemptActive
        ? 0
        : calculateLockLevel(u.payment_overdue_since, today, {
            retryInProgress: !!u.payment_retry_in_progress,
          });

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
