import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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

    // self_check 완료 처리
    const { error: upsertError } = await serviceClient
      .from('onboarding_steps')
      .upsert(
        {
          pt_user_id: ptUserId,
          step_key: stepKey,
          status: 'approved',
          completed_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
        },
        { onConflict: 'pt_user_id,step_key' },
      );

    if (upsertError) {
      console.error('Onboarding upsert error:', upsertError);
      return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Onboarding complete error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
