import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** GET: 쿠폰 자동 동기화 설정 조회 */
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
    const { data: config, error } = await serviceClient
      .from('coupon_auto_sync_config')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    if (error) {
      console.error('쿠폰 자동 동기화 설정 조회 오류:', error);
      return NextResponse.json({ error: '설정 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ config: config || null });
  } catch (err) {
    console.error('쿠폰 설정 조회 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** POST: 쿠폰 자동 동기화 설정 저장(upsert) */
export async function POST(request: NextRequest) {
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

    const body = await request.json();

    const {
      is_enabled,
      contract_id,
      instant_coupon_enabled,
      instant_coupon_id,
      instant_coupon_name,
      instant_coupon_auto_create,
      instant_coupon_title_template,
      instant_coupon_duration_days,
      instant_coupon_discount,
      instant_coupon_discount_type,
      instant_coupon_max_discount,
      download_coupon_enabled,
      download_coupon_id,
      download_coupon_name,
      download_coupon_auto_create,
      download_coupon_title_template,
      download_coupon_duration_days,
      download_coupon_policies,
      apply_delay_days,
    } = body;

    const serviceClient = await createServiceClient();
    const { data: config, error } = await serviceClient
      .from('coupon_auto_sync_config')
      .upsert(
        {
          pt_user_id: ptUser.id,
          is_enabled,
          contract_id,
          instant_coupon_enabled,
          instant_coupon_id,
          instant_coupon_name,
          instant_coupon_auto_create,
          instant_coupon_title_template,
          instant_coupon_duration_days,
          instant_coupon_discount,
          instant_coupon_discount_type,
          instant_coupon_max_discount,
          download_coupon_enabled,
          download_coupon_id,
          download_coupon_name,
          download_coupon_auto_create,
          download_coupon_title_template,
          download_coupon_duration_days,
          download_coupon_policies,
          apply_delay_days,
        },
        { onConflict: 'pt_user_id' },
      )
      .select()
      .single();

    if (error) {
      console.error('쿠폰 자동 동기화 설정 저장 오류:', error);
      return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ config });
  } catch (err) {
    console.error('쿠폰 설정 저장 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
