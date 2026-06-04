import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';
import { CONTRACT_TERMS_VERSION } from '@/lib/data/contract-terms';

export const maxDuration = 20;

/**
 * POST /api/contracts/agree-amendment
 * 기존 서명자가 개정 약관(현재 CONTRACT_TERMS_VERSION)에 재동의한 사실을 기록한다.
 * 본인 소유 + 이미 서명된 계약만 대상.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { contractId, clientIp } = body as { contractId?: string; clientIp?: string };
    if (!contractId) return NextResponse.json({ error: '계약 ID가 필요합니다.' }, { status: 400 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!ptUser) return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, pt_user_id, signed_at')
      .eq('id', contractId)
      .eq('pt_user_id', ptUser.id)
      .single();
    if (!contract) return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 });
    if (!contract.signed_at) {
      return NextResponse.json({ error: '서명된 계약만 개정 동의가 가능합니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        amendment_agreed_version: CONTRACT_TERMS_VERSION,
        amendment_agreed_at: now,
        amendment_agreed_ip: clientIp || 'unknown',
      })
      .eq('id', contractId)
      .eq('pt_user_id', ptUser.id);

    if (updateError) {
      return NextResponse.json({ error: `동의 처리 실패: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, agreedVersion: CONTRACT_TERMS_VERSION, agreedAt: now });
  } catch (err) {
    console.error('[agree-amendment] error:', err);
    void logSystemError({ source: 'contracts/agree-amendment', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
