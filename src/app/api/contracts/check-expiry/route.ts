import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


// POST: 만료된 계약 자동 감지 및 상태 업데이트
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    // admin 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'partner'].includes(profile.role)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const today = new Date().toISOString().split('T')[0];

    // end_date가 오늘 이전인 signed/sent 계약을 expired로
    const { data: expired, error } = await serviceClient
      .from('contracts')
      .update({ status: 'expired' })
      .in('status', ['signed', 'sent'])
      .lt('end_date', today)
      .not('end_date', 'is', null)
      .select('id');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      expiredCount: expired?.length || 0,
    });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
