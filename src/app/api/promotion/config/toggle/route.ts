import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** POST: 쿠폰 자동 동기화 활성화/비활성화 토글 */
export async function POST(_request: NextRequest) {
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

    // 현재 설정 조회
    const { data: current, error: fetchError } = await serviceClient
      .from('coupon_auto_sync_config')
      .select('is_enabled')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (fetchError) {
      console.error('쿠폰 설정 조회 오류:', fetchError);
      return NextResponse.json({ error: '설정 조회에 실패했습니다.' }, { status: 500 });
    }

    if (!current) {
      return NextResponse.json({ error: '쿠폰 자동 동기화 설정이 존재하지 않습니다. 먼저 설정을 저장해주세요.' }, { status: 404 });
    }

    // 토글
    const newEnabled = !current.is_enabled;
    const { data: updated, error: updateError } = await serviceClient
      .from('coupon_auto_sync_config')
      .update({ is_enabled: newEnabled })
      .eq('pt_user_id', ptUser.id)
      .select()
      .single();

    if (updateError) {
      console.error('쿠폰 설정 토글 오류:', updateError);
      return NextResponse.json({ error: '설정 변경에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ config: updated });
  } catch (err) {
    console.error('쿠폰 설정 토글 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
