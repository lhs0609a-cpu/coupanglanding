import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/** GET: 쿠폰 적용 로그 조회 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const serviceClient = await createServiceClient();

    const { data, count, error } = await serviceClient
      .from('coupon_apply_log')
      .select('*', { count: 'exact' })
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('쿠폰 적용 로그 조회 오류:', error);
      void logSystemError({ source: 'promotion/logs', error: error }).catch(() => {});
      return NextResponse.json({ error: '적용 로그 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], total: count || 0 });
  } catch (err) {
    console.error('쿠폰 로그 조회 서버 오류:', err);
    void logSystemError({ source: 'promotion/logs', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
