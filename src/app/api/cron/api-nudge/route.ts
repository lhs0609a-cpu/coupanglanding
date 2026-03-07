import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';

/**
 * GET /api/cron/api-nudge
 *
 * Vercel Cron이 매일 01:00 KST에 호출
 * 쿠팡 API 미연동 유저에게 단계적 넛지 알림
 *
 * 가입 +1일: 안내
 * 가입 +3일: 독촉
 * 가입 +7일: 강조 (수동 입력 불가 경고)
 * 이후 매주 월요일: 반복 리마인드
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const serviceClient = await createServiceClient();

    // API 미연동 활성 PT 유저 조회
    const { data: unconnectedUsers, error } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, created_at')
      .eq('status', 'active')
      .eq('coupang_api_connected', false);

    if (error || !unconnectedUsers?.length) {
      return NextResponse.json({ success: true, sent: 0, message: '미연동 유저 없음.' });
    }

    const now = new Date();
    let sentCount = 0;

    for (const user of unconnectedUsers) {
      const { profile_id, created_at } = user as { id: string; profile_id: string; created_at: string };
      const createdDate = new Date(created_at);
      const daysSinceJoin = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

      let notification: { title: string; message: string } | null = null;

      if (daysSinceJoin === 1) {
        notification = {
          title: '쿠팡 API를 연동해주세요',
          message: '쿠팡 Open API를 연동하면 매출 데이터가 자동으로 집계됩니다. [내 설정]에서 바로 연동하세요.',
        };
      } else if (daysSinceJoin === 3) {
        notification = {
          title: 'API 연동이 아직 완료되지 않았습니다',
          message: '쿠팡 API가 연동되지 않으면 매출 보고서를 제출할 수 없습니다. 지금 바로 연동해주세요.',
        };
      } else if (daysSinceJoin === 7) {
        notification = {
          title: 'API 미연동 — 정산 불가 경고',
          message: 'API가 연동되지 않아 매출 정산이 진행되지 않습니다. 반드시 [내 설정]에서 쿠팡 API를 연동해주세요.',
        };
      } else if (daysSinceJoin > 7 && now.getDay() === 1) {
        // 7일 이후 매주 월요일 리마인드
        notification = {
          title: '쿠팡 API 미연동 상태입니다',
          message: 'API가 연동되지 않아 정산을 진행할 수 없습니다. [내 설정]에서 연동을 완료해주세요.',
        };
      }

      if (notification) {
        await createNotification(serviceClient, {
          userId: profile_id,
          type: 'system',
          title: notification.title,
          message: notification.message,
          link: '/my/settings',
        });
        sentCount++;
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      totalUnconnected: unconnectedUsers.length,
    });
  } catch (err) {
    console.error('cron/api-nudge error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
