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

    // 카테고리 메타 조회 테스트 (58786 = 한방음료) — 3개 엔드포인트 시도
    let noticeMeta = null;
    try {
      noticeMeta = await coupangAdapter.getNoticeCategoryFields('58786');
    } catch (e) {
      noticeMeta = { error: e instanceof Error ? e.message : String(e) };
    }

    // 각 엔드포인트 개별 테스트
    const endpointTests: Record<string, unknown> = {};
    const testPaths = [
      `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-models/display-category-codes/58786`,
      `/v2/providers/seller_api/apis/api/v1/vendor/categories/58786/noticeCategories`,
      `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/categorization/meta/display-category-codes/58786`,
    ];
    for (const p of testPaths) {
      try {
        const res = await (coupangAdapter as any).coupangApi('GET', p);
        endpointTests[p.split('/').slice(-3).join('/')] = JSON.stringify(res).slice(0, 500);
      } catch (e) {
        endpointTests[p.split('/').slice(-3).join('/')] = e instanceof Error ? e.message : String(e);
      }
    }
    const rawMeta = endpointTests;

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
