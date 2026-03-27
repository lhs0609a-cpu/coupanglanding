import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * GET — 쿠팡 API 연결 테스트 + 디버그 정보 반환
 * 프록시 경유 출고지 목록 조회로 인증 동작 확인
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    // 카테고리 메타 조회 테스트 (58786 = 한방음료)
    let noticeMeta = null;
    try {
      noticeMeta = await coupangAdapter.getNoticeCategoryFields('58786');
    } catch (e) {
      noticeMeta = { error: e instanceof Error ? e.message : String(e) };
    }

    // 카테고리 메타 원본 응답
    let rawMeta = null;
    try {
      const path = '/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-models/display-category-codes/58786';
      rawMeta = await (coupangAdapter as any).coupangApi('GET', path);
    } catch (e) {
      rawMeta = { error: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({
      vendorId,
      proxyUrl: process.env.COUPANG_PROXY_URL || '(not set)',
      proxySecretSet: !!process.env.COUPANG_PROXY_SECRET,
      shUserId,
      noticeMeta,
      rawMeta: rawMeta ? JSON.stringify(rawMeta).slice(0, 3000) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
