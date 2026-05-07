import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/** GET: 최신 일괄 적용 진행 상태 조회 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const serviceClient = await createServiceClient();
    const { data: progress, error } = await serviceClient
      .from('bulk_apply_progress')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('일괄 적용 진행 상태 조회 오류:', error);
      void logSystemError({ source: 'promotion/progress', error: error }).catch(() => {});
      return NextResponse.json({ error: '진행 상태 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ progress: progress || null });
  } catch (err) {
    console.error('진행 상태 조회 서버 오류:', err);
    void logSystemError({ source: 'promotion/progress', error: err }).catch(() => {});
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE: 활성 일괄 적용 취소 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const serviceClient = await createServiceClient();

    // 활성 진행 상태를 cancelled로 변경
    const { data: cancelledProgress, error: cancelError } = await serviceClient
      .from('bulk_apply_progress')
      .update({ status: 'cancelled' })
      .eq('pt_user_id', ptUser.id)
      .in('status', ['collecting', 'applying'])
      .select()
      .maybeSingle();

    if (cancelError) {
      console.error('일괄 적용 취소 오류:', cancelError);
      void logSystemError({ source: 'promotion/progress', error: cancelError }).catch(() => {});
      return NextResponse.json({ error: '취소 처리에 실패했습니다.' }, { status: 500 });
    }

    if (!cancelledProgress) {
      return NextResponse.json({ error: '취소할 활성 작업이 없습니다.' }, { status: 404 });
    }

    // pending 상태인 트래킹 레코드를 skipped로 변경
    const { error: skipError } = await serviceClient
      .from('product_coupon_tracking')
      .update({ status: 'skipped' })
      .eq('pt_user_id', ptUser.id)
      .eq('status', 'pending');

    if (skipError) {
      console.error('pending 레코드 skipped 처리 오류:', skipError);
      void logSystemError({ source: 'promotion/progress', error: skipError }).catch(() => {});
      // 진행 상태는 이미 취소되었으므로 경고만 로깅
    }

    return NextResponse.json({ progress: cancelledProgress });
  } catch (err) {
    console.error('일괄 적용 취소 서버 오류:', err);
    void logSystemError({ source: 'promotion/progress', error: err }).catch(() => {});
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
