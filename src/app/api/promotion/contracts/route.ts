import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import { fetchContracts } from '@/lib/utils/coupang-api-client';
import type { CoupangCredentials, CoupangContract } from '@/lib/utils/coupang-api-client';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!ptUser.coupang_api_connected || !ptUser.coupang_vendor_id || !ptUser.coupang_access_key || !ptUser.coupang_secret_key) {
      return NextResponse.json({ error: '쿠팡 API가 연동되지 않았습니다.' }, { status: 400 });
    }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
    };

    let contracts = await fetchContracts(credentials);

    // API에서 못 가져왔으면 → DB에 저장된 contract_id를 fallback으로 사용
    if (contracts.length === 0) {
      const serviceClient = await createServiceClient();
      const { data: config } = await serviceClient
        .from('coupon_auto_sync_config')
        .select('contract_id')
        .eq('pt_user_id', ptUser.id)
        .maybeSingle();

      if (config?.contract_id) {
        const savedContract: CoupangContract = {
          contractId: Number(config.contract_id),
          contractName: `계약서 #${config.contract_id} (저장된 설정)`,
          startDate: '',
          endDate: '',
          contractStatus: 'ACTIVE',
        };
        contracts = [savedContract];
      }
    }

    return NextResponse.json({
      data: contracts,
      // 계약서가 비어있으면 API 폐기 안내 메시지 포함
      ...(contracts.length === 0 && {
        message: '계약서 API가 폐기(410)되어 자동 조회가 불가합니다. 쿠팡 WING에서 계약서 ID를 직접 확인 후 입력해주세요.',
        retired: true,
      }),
    });
  } catch (err) {
    console.error('promotion contracts error:', err);
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
