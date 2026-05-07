import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Get pt_user
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const serviceClient = await createServiceClient();

    // Get seller_points
    const { data: points } = await serviceClient
      .from('seller_points')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    // Get achievements
    const { data: achievements } = await serviceClient
      .from('seller_achievements')
      .select('*')
      .eq('pt_user_id', ptUser.id);

    // Get active challenges with progress
    const today = new Date().toISOString().split('T')[0];
    const { data: challengesRaw } = await serviceClient
      .from('seller_challenges')
      .select('*, progress:seller_challenge_progress(*)')
      .eq('is_active', true)
      .gte('end_date', today);

    // Filter progress to only this user's entries
    const challenges = (challengesRaw || []).map((challenge: Record<string, unknown>) => ({
      ...challenge,
      progress: Array.isArray(challenge.progress)
        ? (challenge.progress as Record<string, unknown>[]).filter(
            (p: Record<string, unknown>) => p.pt_user_id === ptUser.id
          )
        : [],
    }));

    // Get recent activity (last 7 days)
    const { data: recentActivity } = await serviceClient
      .from('seller_daily_activity')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('activity_date', { ascending: false })
      .limit(7);

    return NextResponse.json({
      points: points || null,
      achievements: achievements || [],
      challenges,
      recentActivity: recentActivity || [],
    });
  } catch (error) {
    console.error('Arena stats error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
