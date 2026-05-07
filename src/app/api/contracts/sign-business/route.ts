import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 20;

// GET: 토큰으로 계약 정보 조회 (비로그인)
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    const { data: contract } = await supabase
      .from('contracts')
      .select('id, share_percentage, start_date, end_date, contract_mode, signed_at, business_signed_at, business_sign_token_expires_at, pt_user:pt_users(id, business_name, business_representative, profile:profiles(full_name))')
      .eq('business_sign_token', token)
      .single();

    if (!contract) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 });
    }

    // 만료 확인
    if (contract.business_sign_token_expires_at) {
      const expires = new Date(contract.business_sign_token_expires_at);
      if (expires < new Date()) {
        return NextResponse.json({ error: '서명 링크가 만료되었습니다. 운영자에게 재발급을 요청해주세요.' }, { status: 410 });
      }
    }

    // 이미 서명 완료
    if (contract.business_signed_at) {
      return NextResponse.json({ error: '이미 서명이 완료되었습니다.' }, { status: 409 });
    }

    const ptUserRaw = contract.pt_user as unknown;
    const ptUser = (Array.isArray(ptUserRaw) ? ptUserRaw[0] : ptUserRaw) as Record<string, unknown> | null;
    const profileRaw = ptUser?.profile;
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as Record<string, unknown> | null;

    return NextResponse.json({
      contractId: contract.id,
      sharePercentage: contract.share_percentage,
      startDate: contract.start_date,
      endDate: contract.end_date,
      operatorName: profile?.full_name || '(운영자)',
      businessName: ptUser?.business_name || null,
      businessRepresentative: ptUser?.business_representative || null,
      operatorSignedAt: contract.signed_at,
    });
  } catch (err) {
    console.error('sign-business GET error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 사업자 대표 서명 제출 (비로그인)
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const log = (step: string, extra?: Record<string, unknown>) => {
    console.log(`[sign-business] +${Date.now() - t0}ms ${step}`, extra ?? '');
  };
  try {
    log('start');
    const body = await request.json();
    const { token, signerName, signatureData } = body;

    if (!token || !signerName || !signatureData) {
      return NextResponse.json({ error: '토큰, 서명자 이름, 서명 데이터가 필요합니다.' }, { status: 400 });
    }

    const supabase = await createServiceClient();

    // 계약 조회
    const { data: contract } = await supabase
      .from('contracts')
      .select('id, status, contract_mode, signed_at, business_signed_at, business_sign_token_expires_at, pt_user_id')
      .eq('business_sign_token', token)
      .single();
    log('contract-fetched', { hasContract: !!contract });

    if (!contract) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 });
    }

    // 만료 확인
    if (contract.business_sign_token_expires_at) {
      const expires = new Date(contract.business_sign_token_expires_at);
      if (expires < new Date()) {
        return NextResponse.json({ error: '서명 링크가 만료되었습니다.' }, { status: 410 });
      }
    }

    // 이미 서명 완료
    if (contract.business_signed_at) {
      return NextResponse.json({ error: '이미 서명이 완료되었습니다.' }, { status: 409 });
    }

    // 운영자 서명 확인
    if (!contract.signed_at) {
      return NextResponse.json({ error: '운영자 서명이 먼저 완료되어야 합니다.' }, { status: 400 });
    }

    // IP 추출
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : 'unknown';

    const now = new Date().toISOString();

    // 사업자 서명 저장 + status를 signed로 변경
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        business_signed_at: now,
        business_signature_data: signatureData,
        business_signed_ip: clientIp,
        business_signer_name: signerName,
      })
      .eq('id', contract.id)
      .select('start_date, pt_user_id')
      .single();
    log('contract-updated', { error: updateError?.message });

    if (updateError) {
      return NextResponse.json({ error: `서명 저장 실패: ${updateError.message}` }, { status: 500 });
    }

    // first_billing_grace_until = 계약 시작일 + 30일 (구멍 #77)
    if (updatedContract?.start_date && updatedContract?.pt_user_id) {
      const graceUntil = new Date(updatedContract.start_date);
      graceUntil.setDate(graceUntil.getDate() + 30);
      await supabase
        .from('pt_users')
        .update({ first_billing_grace_until: graceUntil.toISOString().slice(0, 10) })
        .eq('id', updatedContract.pt_user_id)
        .is('first_billing_grace_until', null);
      log('grace-set');
    }

    log('done');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[sign-business] POST error:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
