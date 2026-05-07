import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { GUIDE_POINTS, getArenaLevel } from '@/lib/utils/arena-points';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


const GUIDE_MASTER_THRESHOLD = 5; // 5개 카테고리 열람 시 시크릿 배지

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { ptUserId, categoryId } = await request.json();

    if (!ptUserId || !categoryId) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 본인의 pt_user인지 확인
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id')
      .eq('id', ptUserId)
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    let pointsAwarded = 0;
    const badgesUnlocked: string[] = [];

    // 카테고리 열람 기록 (achievement_key = guide_view_{categoryId})
    const viewKey = `guide_view_${categoryId}`;
    const { error: insertError } = await serviceClient
      .from('seller_achievements')
      .insert({
        pt_user_id: ptUserId,
        achievement_key: viewKey,
        unlocked_at: new Date().toISOString(),
      });

    if (insertError) {
      if (insertError.code === '23505') {
        // 이미 열람한 카테고리 → 포인트 미지급, 중복 무시
        return NextResponse.json({ pointsAwarded: 0, badgesUnlocked: [] });
      }
      console.error('Guide view tracking error:', insertError);
      void logSystemError({ source: 'guides/track-view', error: insertError }).catch(() => {});
      return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
    }

    // 첫 열람이므로 포인트 지급
    pointsAwarded += GUIDE_POINTS.perCategory;

    // 열람한 카테고리 수 확인 (guide_master 배지 체크)
    const { data: viewedCategories } = await serviceClient
      .from('seller_achievements')
      .select('achievement_key')
      .eq('pt_user_id', ptUserId)
      .like('achievement_key', 'guide_view_%');

    const viewedCount = viewedCategories?.length || 0;

    if (viewedCount >= GUIDE_MASTER_THRESHOLD) {
      // guide_master 배지 부여
      const { error: badgeError } = await serviceClient
        .from('seller_achievements')
        .insert({
          pt_user_id: ptUserId,
          achievement_key: 'guide_master',
          unlocked_at: new Date().toISOString(),
        });

      if (!badgeError) {
        badgesUnlocked.push('guide_master');
      }
    }

    // seller_points 업데이트
    if (pointsAwarded > 0) {
      const { data: existing } = await serviceClient
        .from('seller_points')
        .select('total_points')
        .eq('pt_user_id', ptUserId)
        .maybeSingle();

      const currentTotal = existing?.total_points || 0;
      const newTotal = currentTotal + pointsAwarded;
      const newLevel = getArenaLevel(newTotal);

      await serviceClient
        .from('seller_points')
        .upsert({
          pt_user_id: ptUserId,
          total_points: newTotal,
          current_level: newLevel.level,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'pt_user_id' });
    }

    return NextResponse.json({ pointsAwarded, badgesUnlocked });
  } catch (err) {
    console.error('Guide track-view error:', err);
    void logSystemError({ source: 'guides/track-view', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
