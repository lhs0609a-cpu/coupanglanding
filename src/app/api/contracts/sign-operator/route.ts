import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { contractId, signatureData, clientIp } = body;

    if (!contractId || !signatureData) {
      return NextResponse.json({ error: '계약 ID와 서명 데이터가 필요합니다.' }, { status: 400 });
    }

    // PT 사용자 확인
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 계약 확인
    const { data: contract } = await supabase
      .from('contracts')
      .select('id, pt_user_id, status, contract_mode')
      .eq('id', contractId)
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (contract.status !== 'sent') {
      return NextResponse.json({ error: '발송된 계약만 서명할 수 있습니다.' }, { status: 400 });
    }

    const contractMode = contract.contract_mode || 'single';
    const now = new Date().toISOString();

    if (contractMode === 'single') {
      // 2자 계약: 기존과 동일하게 바로 signed
      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          status: 'signed',
          signed_at: now,
          signed_ip: clientIp || 'unknown',
          signature_data: signatureData,
        })
        .eq('id', contractId);

      if (updateError) {
        return NextResponse.json({ error: `서명 실패: ${updateError.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, contractMode: 'single' });
    }

    // 3자 계약: 운영자 서명 저장 + 토큰 생성 (status는 sent 유지)
    const token = randomUUID();
    const tokenExpires = new Date();
    tokenExpires.setDate(tokenExpires.getDate() + 7); // 7일 후 만료

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        signed_at: now,
        signed_ip: clientIp || 'unknown',
        signature_data: signatureData,
        business_sign_token: token,
        business_sign_token_expires_at: tokenExpires.toISOString(),
      })
      .eq('id', contractId);

    if (updateError) {
      return NextResponse.json({ error: `서명 실패: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      contractMode: 'triple',
      businessSignToken: token,
    });
  } catch (err) {
    console.error('sign-operator error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
