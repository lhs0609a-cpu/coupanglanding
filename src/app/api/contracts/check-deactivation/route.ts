import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyDeactivationReminder, notifyAdminOverdueAlert } from '@/lib/utils/notifications';

export async function POST() {
  try {
    const serviceClient = await createServiceClient();

    // 해지된 계약 중 철거 미확인 건 조회
    const { data: contracts, error } = await serviceClient
      .from('contracts')
      .select('id, pt_user_id, product_deactivation_deadline, product_deactivation_confirmed, pt_user:pt_users(profile_id)')
      .eq('status', 'terminated')
      .eq('product_deactivation_confirmed', false)
      .not('product_deactivation_deadline', 'is', null);

    if (error) {
      return NextResponse.json({ error: `조회 실패: ${error.message}` }, { status: 500 });
    }

    if (!contracts || contracts.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: '처리할 계약이 없습니다.' });
    }

    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let sentCount = 0;
    const overdueContracts: string[] = [];

    for (const contract of contracts) {
      const deadline = new Date(contract.product_deactivation_deadline as string);
      const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
      const diffMs = deadlineDate.getTime() - todayDate.getTime();
      const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // D-7, D-3, D-1, D-0, D+1, D+3에 리마인더
      const reminderDays = [7, 3, 1, 0, -1, -3];
      if (!reminderDays.includes(daysLeft)) continue;

      const ptUser = contract.pt_user as unknown as { profile_id: string } | null;
      if (!ptUser?.profile_id) continue;

      const deadlineStr = (contract.product_deactivation_deadline as string).split('T')[0];
      await notifyDeactivationReminder(serviceClient, ptUser.profile_id, daysLeft, deadlineStr);
      sentCount++;

      // D+1 이상 → 관리자에게도 알림
      if (daysLeft <= -1) {
        overdueContracts.push(contract.id);
      }
    }

    // 기한 초과 건이 있으면 관리자에게 알림
    if (overdueContracts.length > 0) {
      const { data: admins } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await notifyAdminOverdueAlert(serviceClient, admin.id, overdueContracts.length);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      overdueCount: overdueContracts.length,
    });
  } catch (err) {
    console.error('check-deactivation error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
