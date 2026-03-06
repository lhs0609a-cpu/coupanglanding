import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getArenaLevel } from '@/lib/utils/arena-points';

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = await createServiceClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return null;
  return { user, serviceClient };
}

export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { serviceClient } = admin;

    // Get all seller_points with real user info
    const { data: users, error: usersError } = await serviceClient
      .from('seller_points')
      .select('*, pt_user:pt_users(*, profile:profiles(*))')
      .order('total_points', { ascending: false });

    if (usersError) {
      console.error('Admin arena users error:', usersError);
      return NextResponse.json({ error: '사용자 목록 조회에 실패했습니다.' }, { status: 500 });
    }

    // Get all challenges
    const { data: challenges, error: challengesError } = await serviceClient
      .from('seller_challenges')
      .select('*')
      .order('created_at', { ascending: false });

    if (challengesError) {
      console.error('Admin arena challenges error:', challengesError);
      return NextResponse.json({ error: '챌린지 목록 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      users: users || [],
      challenges: challenges || [],
    });
  } catch (error) {
    console.error('Admin arena GET error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { user, serviceClient } = admin;
    const body = await request.json();
    const {
      title,
      description,
      challenge_type,
      metric,
      target_value,
      reward_points,
      reward_badge,
      start_date,
      end_date,
    } = body;

    if (!title || !challenge_type || !metric || !target_value || !start_date || !end_date) {
      return NextResponse.json({ error: '필수 항목을 모두 입력해주세요.' }, { status: 400 });
    }

    const { data: challenge, error } = await serviceClient
      .from('seller_challenges')
      .insert({
        title,
        description: description || null,
        challenge_type,
        metric,
        target_value,
        reward_points: reward_points || 0,
        reward_badge: reward_badge || null,
        start_date,
        end_date,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Challenge create error:', error);
      return NextResponse.json({ error: '챌린지 생성에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data: challenge });
  } catch (error) {
    console.error('Admin arena POST error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { serviceClient } = admin;
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'action 필드가 필요합니다.' }, { status: 400 });
    }

    switch (action) {
      case 'update_challenge': {
        const { id, ...updates } = body;
        if (!id) {
          return NextResponse.json({ error: '챌린지 ID가 필요합니다.' }, { status: 400 });
        }

        // Remove action from updates
        delete updates.action;

        const { data, error } = await serviceClient
          .from('seller_challenges')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('Challenge update error:', error);
          return NextResponse.json({ error: '챌린지 수정에 실패했습니다.' }, { status: 500 });
        }

        return NextResponse.json({ data });
      }

      case 'award_points': {
        const { pt_user_id, points, reason } = body;
        if (!pt_user_id || !points) {
          return NextResponse.json({ error: '사용자 ID와 포인트가 필요합니다.' }, { status: 400 });
        }

        // Get existing points
        const { data: existingPoints } = await serviceClient
          .from('seller_points')
          .select('*')
          .eq('pt_user_id', pt_user_id)
          .maybeSingle();

        if (!existingPoints) {
          return NextResponse.json({ error: '해당 사용자의 포인트 정보를 찾을 수 없습니다.' }, { status: 404 });
        }

        const newTotal = (existingPoints.total_points || 0) + points;
        const newLevel = getArenaLevel(newTotal);

        const { data, error } = await serviceClient
          .from('seller_points')
          .update({
            total_points: newTotal,
            current_level: newLevel.level,
            updated_at: new Date().toISOString(),
          })
          .eq('pt_user_id', pt_user_id)
          .select()
          .single();

        if (error) {
          console.error('Award points error:', error);
          return NextResponse.json({ error: '포인트 지급에 실패했습니다.' }, { status: 500 });
        }

        // Suppress unused variable warning
        void reason;

        return NextResponse.json({ data });
      }

      case 'toggle_challenge': {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: '챌린지 ID가 필요합니다.' }, { status: 400 });
        }

        // Get current state
        const { data: current } = await serviceClient
          .from('seller_challenges')
          .select('is_active')
          .eq('id', id)
          .single();

        if (!current) {
          return NextResponse.json({ error: '챌린지를 찾을 수 없습니다.' }, { status: 404 });
        }

        const { data, error } = await serviceClient
          .from('seller_challenges')
          .update({
            is_active: !current.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('Toggle challenge error:', error);
          return NextResponse.json({ error: '챌린지 상태 변경에 실패했습니다.' }, { status: 500 });
        }

        return NextResponse.json({ data });
      }

      default:
        return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin arena PATCH error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
