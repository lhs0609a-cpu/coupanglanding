import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();

    // 현재 유저의 pt_user_id
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    const myPtUserId = ptUser?.id || null;

    // 총 등록 건수 기준 TOP 50
    const { data: topUsers, error } = await serviceClient
      .from('seller_points')
      .select('pt_user_id, anonymous_name, anonymous_emoji, total_listings, last_activity_date, updated_at')
      .gt('total_listings', 0)
      .order('total_listings', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Ranking query error:', error);
      return NextResponse.json({ error: '랭킹 조회에 실패했습니다.' }, { status: 500 });
    }

    // 전체 참여자 수
    const { count: totalParticipants } = await serviceClient
      .from('seller_points')
      .select('*', { count: 'exact', head: true })
      .gt('total_listings', 0);

    const ranking = (topUsers || []).map((entry, index) => ({
      rank: index + 1,
      anonymous_name: entry.anonymous_name,
      anonymous_emoji: entry.anonymous_emoji,
      total_listings: entry.total_listings,
      last_synced: entry.updated_at,
      isMe: entry.pt_user_id === myPtUserId,
    }));

    // 내 순위 찾기
    const myEntryInTop50 = ranking.find((e) => e.isMe);
    let myRank: number | null = null;
    let myListings: number | null = null;

    if (myPtUserId) {
      if (myEntryInTop50) {
        myRank = myEntryInTop50.rank;
        myListings = myEntryInTop50.total_listings;
      } else {
        // Top 50 밖 → 내 순위 계산
        const { data: myPoints } = await serviceClient
          .from('seller_points')
          .select('total_listings')
          .eq('pt_user_id', myPtUserId)
          .maybeSingle();

        if (myPoints && myPoints.total_listings > 0) {
          const { count } = await serviceClient
            .from('seller_points')
            .select('*', { count: 'exact', head: true })
            .gt('total_listings', myPoints.total_listings);

          myRank = (count || 0) + 1;
          myListings = myPoints.total_listings;
        }
      }
    }

    return NextResponse.json({
      ranking,
      myRank,
      myListings,
      totalParticipants: totalParticipants || 0,
    });
  } catch (error) {
    console.error('Ranking error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
