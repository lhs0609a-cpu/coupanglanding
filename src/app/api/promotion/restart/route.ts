import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** POST: 기존 일괄 적용 취소 후 재시작 */
export async function POST(request: NextRequest) {
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

    // 1. 기존 활성 진행 상태를 cancelled로 변경
    const { error: cancelError } = await serviceClient
      .from('bulk_apply_progress')
      .update({ status: 'cancelled' })
      .eq('pt_user_id', ptUser.id)
      .in('status', ['collecting', 'applying']);

    if (cancelError) {
      console.error('기존 진행 취소 오류:', cancelError);
      return NextResponse.json({ error: '기존 작업 취소에 실패했습니다.' }, { status: 500 });
    }

    // 2. 기존 트래킹 레코드 전체 삭제 (새로 수집하여 정확한 vendorItemId 사용)
    const { error: deleteError } = await serviceClient
      .from('product_coupon_tracking')
      .delete()
      .eq('pt_user_id', ptUser.id);

    if (deleteError) {
      console.error('트래킹 레코드 삭제 오류:', deleteError);
      return NextResponse.json({ error: '상품 데이터 초기화에 실패했습니다.' }, { status: 500 });
    }

    const totalProducts = 0; // 새로 수집 예정

    // 3. 새 진행 상태 생성 (collecting부터 시작하여 상품 수집 → 적용 2단계 진행)
    const { data: newProgress, error: createError } = await serviceClient
      .from('bulk_apply_progress')
      .insert({
        pt_user_id: ptUser.id,
        status: 'collecting',
        total_products: totalProducts || 0,
      })
      .select()
      .single();

    if (createError || !newProgress) {
      console.error('새 진행 상태 생성 오류:', createError);
      return NextResponse.json({ error: '재시작에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ progress: newProgress });
  } catch (err) {
    console.error('일괄 적용 재시작 서버 오류:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
