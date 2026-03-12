import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyTrainerTraineeStagnant } from '@/lib/utils/notifications';

/**
 * GET /api/cron/trainer-coaching-check
 *
 * 매일 실행: 장기 미활동 트레이니를 찾아 트레이너에게 알림
 * - 7일 미접속: 주의 알림
 * - 14일 미접속: 경고 알림
 * - 중복 알림 방지: 3일 내 동일 알림 체크
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();

    // 활성 trainer_trainees 조회 (트레이너 프로필 ID 포함)
    const { data: activeLinks } = await supabase
      .from('trainer_trainees')
      .select(`
        trainee_pt_user_id,
        trainer:trainers(
          id,
          pt_user:pt_users(profile_id, profile:profiles(full_name))
        ),
        trainee_pt_user:pt_users(last_active_at, profile:profiles(full_name))
      `)
      .eq('is_active', true);

    if (!activeLinks || activeLinks.length === 0) {
      return NextResponse.json({ message: 'No active trainer-trainee links', notified: 0 });
    }

    const now = Date.now();
    let notifiedCount = 0;

    for (const link of activeLinks) {
      const trainee = link.trainee_pt_user as unknown as { last_active_at: string | null; profile: { full_name: string } | null } | null;
      const trainer = link.trainer as unknown as { id: string; pt_user: { profile_id: string; profile: { full_name: string } | null } | null } | null;

      if (!trainee || !trainer?.pt_user) continue;

      const lastActive = trainee.last_active_at;
      if (!lastActive) continue;

      const daysSince = Math.floor((now - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24));
      const traineeName = trainee.profile?.full_name || '교육생';
      const trainerProfileId = trainer.pt_user.profile_id;

      // 7일 또는 14일 미활동
      if (daysSince !== 7 && daysSince !== 14) continue;

      // 중복 알림 방지: 최근 3일 내 동일 알림 체크
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', trainerProfileId)
        .eq('type', 'system')
        .ilike('title', '%활동 정체%')
        .ilike('message', `%${traineeName}%`)
        .gte('created_at', threeDaysAgo)
        .limit(1);

      if (recentNotif && recentNotif.length > 0) continue;

      await notifyTrainerTraineeStagnant(supabase, trainerProfileId, traineeName, daysSince);
      notifiedCount++;
    }

    return NextResponse.json({
      message: `Trainer coaching check completed`,
      checked: activeLinks.length,
      notified: notifiedCount,
    });
  } catch (error) {
    console.error('Trainer coaching check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
