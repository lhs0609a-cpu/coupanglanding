import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { contractId } = body;

    if (!contractId) {
      return NextResponse.json({ error: '계약 ID가 필요합니다.' }, { status: 400 });
    }

    // 사용자 본인의 계약인지 확인
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, pt_user_id, status')
      .eq('id', contractId)
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (contract.status !== 'terminated') {
      return NextResponse.json({ error: '해지된 계약만 확인할 수 있습니다.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('contracts')
      .update({ termination_acknowledged_at: new Date().toISOString() })
      .eq('id', contractId);

    if (updateError) {
      return NextResponse.json({ error: `업데이트 실패: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('acknowledge-termination error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
