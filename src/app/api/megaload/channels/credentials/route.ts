import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channel, credentials } = await request.json();

  // Get megaload user
  const { data: shUser } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!shUser) {
    return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });
  }

  // Upsert credentials
  const { error } = await supabase
    .from('channel_credentials')
    .upsert(
      {
        megaload_user_id: shUser.id,
        channel,
        credentials,
        is_connected: true,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'megaload_user_id,channel' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ★ 쿠팡 WING 로그인 ID 는 pt_users 에도 적는다.
  //   상품등록(batch/route.ts)과 대리등록(catalog-register.ts)은 channel_credentials 가 아니라
  //   pt_users.coupang_seller_id 를 읽어 vendorUserId 로 보낸다. 여기서 안 적어두면
  //   연동 마법사를 끝까지 마쳐도 등록이 "'vendorUserId' 값을 확인해 주세요" 로 전량 실패한다.
  //   (쿠폰 쪽이 쓰는 coupang_wing_user_id 도 같은 값이라 함께 채워 둘을 어긋나지 않게 한다.)
  if (channel === 'coupang') {
    const wingUserId = String((credentials as Record<string, unknown>)?.wingUserId ?? '').trim();
    if (wingUserId) {
      try {
        const serviceClient = await createServiceClient();
        await serviceClient
          .from('pt_users')
          .update({ coupang_seller_id: wingUserId, coupang_wing_user_id: wingUserId })
          .eq('profile_id', user.id);
      } catch (e) {
        // 저장 실패해도 채널 연동 자체는 성공으로 둔다 — 설정 화면에서 다시 넣을 수 있다.
        console.warn('[channels/credentials] pt_users WING ID 저장 실패:', e instanceof Error ? e.message : e);
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: shUser } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!shUser) {
    return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });
  }

  const { data: credentials } = await supabase
    .from('channel_credentials')
    .select('channel, is_connected, last_verified_at, expires_at')
    .eq('megaload_user_id', shUser.id);

  return NextResponse.json({ credentials: credentials || [] });
}
