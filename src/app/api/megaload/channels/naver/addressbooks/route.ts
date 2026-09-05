/**
 * GET /api/megaload/channels/naver/addressbooks
 *   네이버 판매자 주소록(출고지/반품지) 목록 조회 → 자동전파 배송 설정에서
 *   출고지/반품지 코드를 드롭다운으로 고르게 하기 위한 엔드포인트.
 *
 * 실패해도 UI 는 수기 입력으로 폴백하므로 200/{ok:false} 로 부드럽게 반환.
 */
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceClient();
  let shUserId: string;
  try {
    shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '메가로드 계정이 필요합니다.' }, { status: 403 });
  }

  const { data: cred } = await serviceClient
    .from('channel_credentials')
    .select('credentials')
    .eq('megaload_user_id', shUserId)
    .eq('channel', 'naver')
    .eq('is_connected', true)
    .maybeSingle();

  if (!cred) {
    return NextResponse.json({ ok: false, error: '네이버가 연동되지 않았습니다. 먼저 채널 연동에서 키를 등록해주세요.' });
  }

  // 주소록 자동조회(네이버 멀티채널)는 아직 프로덕션 미활성 — UI 는 수기 입력으로 폴백한다.
  //  (어댑터 addressbook 메서드가 개발 브랜치에만 있어, master 빌드 안정화를 위해 폴백 반환)
  return NextResponse.json({ ok: false, error: '주소록 자동조회 준비 중 — 출고지/반품지 코드를 직접 입력해주세요.' });
}
