import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'weekly';

    const serviceClient = await createServiceClient();

    // Get current user's pt_user_id
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    const myPtUserId = ptUser?.id || null;

    // Get top 50 by total_points
    const { data: topUsers, error } = await serviceClient
      .from('seller_points')
      .select('pt_user_id, anonymous_name, anonymous_emoji, total_points, current_level, streak_days, total_listings')
      .order('total_points', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Leaderboard query error:', error);
      return NextResponse.json({ error: '리더보드 조회에 실패했습니다.' }, { status: 500 });
    }

    // Map to leaderboard entries
    const leaderboard = (topUsers || []).map((entry, index) => ({
      rank: index + 1,
      anonymous_name: entry.anonymous_name,
      anonymous_emoji: entry.anonymous_emoji,
      total_points: entry.total_points,
      current_level: entry.current_level,
      streak_days: entry.streak_days,
      total_listings: entry.total_listings,
      isMe: entry.pt_user_id === myPtUserId,
    }));

    // Check if user is in top 50
    const myEntryInTop50 = leaderboard.find((e) => e.isMe);

    let myRank: number | null = null;
    let myStats = null;

    if (myPtUserId) {
      if (myEntryInTop50) {
        myRank = myEntryInTop50.rank;
        myStats = myEntryInTop50;
      } else {
        // User not in top 50 - find their rank
        const { data: myPoints } = await serviceClient
          .from('seller_points')
          .select('pt_user_id, anonymous_name, anonymous_emoji, total_points, current_level, streak_days, total_listings')
          .eq('pt_user_id', myPtUserId)
          .maybeSingle();

        if (myPoints) {
          // Count how many users have more points
          const { count } = await serviceClient
            .from('seller_points')
            .select('*', { count: 'exact', head: true })
            .gt('total_points', myPoints.total_points);

          myRank = (count || 0) + 1;
          myStats = {
            rank: myRank,
            anonymous_name: myPoints.anonymous_name,
            anonymous_emoji: myPoints.anonymous_emoji,
            total_points: myPoints.total_points,
            current_level: myPoints.current_level,
            streak_days: myPoints.streak_days,
            total_listings: myPoints.total_listings,
            isMe: true,
          };
        }
      }
    }

    return NextResponse.json({
      leaderboard,
      myRank,
      myStats,
      period,
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
