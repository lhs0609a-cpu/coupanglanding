import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 20;

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const log = (step: string, extra?: Record<string, unknown>) => {
    console.log(`[sign-operator] +${Date.now() - t0}ms ${step}`, extra ?? '');
  };
  try {
    log('start');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    log('auth-checked', { hasUser: !!user });

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
    log('pt_users-fetched', { hasPtUser: !!ptUser });

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
    log('contract-fetched', { hasContract: !!contract, status: contract?.status });

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
      const { data: updatedContract, error: updateError } = await supabase
        .from('contracts')
        .update({
          status: 'signed',
          signed_at: now,
          signed_ip: clientIp || 'unknown',
          signature_data: signatureData,
        })
        .eq('id', contractId)
        .select('start_date')
        .single();

      log('contract-updated-single', { error: updateError?.message });
      if (updateError) {
        return NextResponse.json({ error: `서명 실패: ${updateError.message}` }, { status: 500 });
      }

      // first_billing_grace_until = 계약 시작일 + 30일 (구멍 #77)
      // 이미 다른 signed 계약이 있어서 grace가 이미 지난 유저라면 덮어쓰지 않음
      if (updatedContract?.start_date) {
        const graceUntil = new Date(updatedContract.start_date);
        graceUntil.setDate(graceUntil.getDate() + 30);
        await supabase
          .from('pt_users')
          .update({ first_billing_grace_until: graceUntil.toISOString().slice(0, 10) })
          .eq('id', ptUser.id)
          .is('first_billing_grace_until', null);
        log('grace-set');
      }

      log('done-single');
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

    log('contract-updated-triple', { error: updateError?.message });
    if (updateError) {
      return NextResponse.json({ error: `서명 실패: ${updateError.message}` }, { status: 500 });
    }

    log('done-triple');
    return NextResponse.json({
      success: true,
      contractMode: 'triple',
      businessSignToken: token,
    });
  } catch (err) {
    console.error('[sign-operator] error:', err);
    void logSystemError({ source: 'contracts/sign-operator', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
