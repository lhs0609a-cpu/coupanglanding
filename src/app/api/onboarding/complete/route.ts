import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { grantEducationRewards } from '@/lib/utils/education-rewards';

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { ptUserId, stepKey } = await request.json();

    if (!ptUserId || !stepKey) {
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

    // self_check 완료 처리 (SELECT → INSERT or UPDATE 패턴)
    const now = new Date().toISOString();

    const { data: existing } = await serviceClient
      .from('onboarding_steps')
      .select('id')
      .eq('pt_user_id', ptUserId)
      .eq('step_key', stepKey)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await serviceClient
        .from('onboarding_steps')
        .update({ status: 'approved', completed_at: now, submitted_at: now })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Onboarding update error:', updateError.message, updateError.details);
        return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
      }
    } else {
      const { error: insertError } = await serviceClient
        .from('onboarding_steps')
        .insert({
          pt_user_id: ptUserId,
          step_key: stepKey,
          status: 'approved',
          completed_at: now,
          submitted_at: now,
        });

      if (insertError) {
        console.error('Onboarding insert error:', insertError.message, insertError.details);
        return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
      }
    }

    // 교육 완료 보상 지급
    try {
      const rewards = await grantEducationRewards(serviceClient, ptUserId, stepKey);
      return NextResponse.json({
        success: true,
        rewards: {
          pointsAwarded: rewards.pointsAwarded,
          badgesUnlocked: rewards.badgesUnlocked,
        },
      });
    } catch (rewardErr) {
      console.error('Education reward error:', rewardErr);
      // 보상 지급 실패해도 완료 처리는 유지
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    console.error('Onboarding complete error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
