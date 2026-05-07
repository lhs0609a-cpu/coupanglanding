import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { calculateDailyPoints, calculateStreakBonus, getArenaLevel } from '@/lib/utils/arena-points';
import { generateAnonymousName } from '@/lib/utils/arena-anonymous';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { listings_count = 0, revenue_amount = 0, activity_date } = body;
    const targetDate = activity_date || new Date().toISOString().split('T')[0];

    // Calculate daily points
    const dailyPoints = calculateDailyPoints(listings_count, revenue_amount);

    const serviceClient = await createServiceClient();

    // Upsert daily activity
    const { data: activity, error: activityError } = await serviceClient
      .from('seller_daily_activity')
      .upsert({
        pt_user_id: ptUser.id,
        activity_date: targetDate,
        listings_count,
        revenue_amount,
        points_listings: dailyPoints.points_listings,
        points_revenue: dailyPoints.points_revenue,
        points_streak: 0,
        points_challenge: 0,
        points_total: dailyPoints.points_total,
        data_source: 'manual',
      }, { onConflict: 'pt_user_id,activity_date' })
      .select()
      .single();

    if (activityError) {
      console.error('Activity upsert error:', activityError);
      void logSystemError({ source: 'arena/log-activity', error: activityError }).catch(() => {});
      return NextResponse.json({ error: '활동 기록 저장에 실패했습니다.' }, { status: 500 });
    }

    // Get existing seller_points
    const { data: existingPoints } = await serviceClient
      .from('seller_points')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    // Calculate streak
    let streakDays = 1;
    if (existingPoints?.last_activity_date) {
      const lastDate = new Date(existingPoints.last_activity_date);
      const currentDate = new Date(targetDate);
      const diffTime = currentDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Yesterday -> increment streak
        streakDays = (existingPoints.streak_days || 0) + 1;
      } else if (diffDays === 0) {
        // Same day -> keep streak
        streakDays = existingPoints.streak_days || 1;
      } else {
        // Gap -> reset to 1
        streakDays = 1;
      }
    }

    // Calculate streak bonus
    const streakBonus = calculateStreakBonus(streakDays);

    // Update the daily_activity record's points_streak field
    if (streakBonus.bonus > 0) {
      await serviceClient
        .from('seller_daily_activity')
        .update({
          points_streak: streakBonus.bonus,
          points_total: dailyPoints.points_total + streakBonus.bonus,
        })
        .eq('id', activity.id);
    }

    // Recalculate total_points by summing all daily_activity points_total for this user
    const { data: allActivities } = await serviceClient
      .from('seller_daily_activity')
      .select('points_total')
      .eq('pt_user_id', ptUser.id);

    const totalPoints = (allActivities || []).reduce(
      (sum: number, a: { points_total: number }) => sum + (a.points_total || 0),
      0
    );

    // Calculate total listings
    const { data: allListings } = await serviceClient
      .from('seller_daily_activity')
      .select('listings_count')
      .eq('pt_user_id', ptUser.id);

    const totalListings = (allListings || []).reduce(
      (sum: number, a: { listings_count: number }) => sum + (a.listings_count || 0),
      0
    );

    // Calculate total revenue
    const { data: allRevenue } = await serviceClient
      .from('seller_daily_activity')
      .select('revenue_amount')
      .eq('pt_user_id', ptUser.id);

    const totalRevenue = (allRevenue || []).reduce(
      (sum: number, a: { revenue_amount: number }) => sum + (a.revenue_amount || 0),
      0
    );

    // Get level
    const level = getArenaLevel(totalPoints);

    // Generate anonymous name for new users
    const anonymous = generateAnonymousName(ptUser.id);

    // Upsert seller_points
    const { data: updatedPoints, error: pointsError } = await serviceClient
      .from('seller_points')
      .upsert({
        pt_user_id: ptUser.id,
        total_points: totalPoints,
        current_level: level.level,
        streak_days: streakDays,
        last_activity_date: targetDate,
        total_listings: totalListings,
        total_revenue: totalRevenue,
        anonymous_name: existingPoints?.anonymous_name || anonymous.name,
        anonymous_emoji: existingPoints?.anonymous_emoji || anonymous.emoji,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'pt_user_id' })
      .select()
      .single();

    if (pointsError) {
      console.error('Points upsert error:', pointsError);
      void logSystemError({ source: 'arena/log-activity', error: pointsError }).catch(() => {});
      return NextResponse.json({ error: '포인트 업데이트에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      activity: {
        ...activity,
        points_streak: streakBonus.bonus,
        points_total: dailyPoints.points_total + streakBonus.bonus,
      },
      points: updatedPoints,
      breakdown: dailyPoints.breakdown,
      streakMilestone: streakBonus.milestone,
    });
  } catch (error) {
    console.error('Log activity error:', error);
    void logSystemError({ source: 'arena/log-activity', error: error }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
