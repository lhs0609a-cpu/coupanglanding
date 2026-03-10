import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** GET: 쿠폰 적용 통계 조회 */
export async function GET() {
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

    // Run all count queries in parallel
    const [totalResult, pendingResult, processingResult, completedResult, failedResult, skippedResult] =
      await Promise.all([
        serviceClient
          .from('product_coupon_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id),
        serviceClient
          .from('product_coupon_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id)
          .eq('status', 'pending'),
        serviceClient
          .from('product_coupon_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id)
          .eq('status', 'processing'),
        serviceClient
          .from('product_coupon_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id)
          .eq('status', 'completed'),
        serviceClient
          .from('product_coupon_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id)
          .eq('status', 'failed'),
        serviceClient
          .from('product_coupon_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('pt_user_id', ptUser.id)
          .eq('status', 'skipped'),
      ]);

    // Check for errors
    const anyError = [totalResult, pendingResult, processingResult, completedResult, failedResult, skippedResult]
      .find((r) => r.error);

    if (anyError?.error) {
      console.error('쿠폰 통계 조회 오류:', anyError.error);
      return NextResponse.json({ error: '통계 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      total: totalResult.count || 0,
      pending: pendingResult.count || 0,
      processing: processingResult.count || 0,
      completed: completedResult.count || 0,
      failed: failedResult.count || 0,
      skipped: skippedResult.count || 0,
    });
  } catch (err) {
    console.error('쿠폰 통계 조회 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
