import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { fetchEnrolledCoupangBrands, searchCoupangBrands } from '@/lib/utils/coupang-api-client';

/**
 * 브랜드 설정 마법사(/megaload/brand-setup) 백엔드.
 *
 * GET  → 셀러의 enrolled 브랜드 목록 + 저장된 자체 브랜드명 + 매칭(enrolled에 있는지) 상태
 * POST { action:'search', brandName } → 쿠팡 Brand Library 검색 (brandId 조회)
 * POST { action:'save', brandName }   → megaload_users.seller_brand 저장(전 상품 default 브랜드)
 */

async function getContext(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const serviceClient = await createServiceClient();
  let shUserId: string;
  try {
    shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Megaload 계정이 없습니다.';
    return { error: NextResponse.json({ error: msg }, { status: 404 }) };
  }
  return { supabase, serviceClient, shUserId };
}

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

export async function GET(req: NextRequest) {
  const ctx = await getContext(req);
  if ('error' in ctx) return ctx.error;
  const { serviceClient, shUserId } = ctx;

  // 저장된 자체 브랜드명
  const { data: userRow } = await serviceClient
    .from('megaload_users')
    .select('seller_brand')
    .eq('id', shUserId)
    .single();
  const sellerBrand = (userRow?.seller_brand as string) || '';

  // enrolled 목록 (쿠팡 미연동/조회실패면 connected=false 로 안내)
  let enrolled: { brandId: string; brandName: string }[] = [];
  let connected = true;
  let apiError: string | undefined;
  try {
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const creds = (adapter as CoupangAdapter).getCredentials();
    enrolled = await fetchEnrolledCoupangBrands(creds);
  } catch (e) {
    connected = false;
    apiError = e instanceof Error ? e.message : '쿠팡 API 조회 실패';
  }

  const sellerBrandEnrolled = !!sellerBrand && enrolled.some((b) => norm(b.brandName) === norm(sellerBrand));
  const matched = enrolled.find((b) => norm(b.brandName) === norm(sellerBrand));

  // 상태: ready(저장+enrolled) / brand_not_enrolled(저장했지만 미등록) / no_brand(미저장) / not_connected
  const status = !connected
    ? 'not_connected'
    : !sellerBrand
      ? 'no_brand'
      : sellerBrandEnrolled
        ? 'ready'
        : 'brand_not_enrolled';

  return NextResponse.json({
    status,
    connected,
    apiError,
    sellerBrand,
    sellerBrandEnrolled,
    sellerBrandId: matched?.brandId || null,
    enrolled,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getContext(req);
  if ('error' in ctx) return ctx.error;
  const { serviceClient, shUserId } = ctx;

  const body = await req.json().catch(() => ({})) as { action?: string; brandName?: string };
  const action = body.action;

  if (action === 'search') {
    const brandName = (body.brandName || '').trim();
    if (!brandName) return NextResponse.json({ error: 'brandName이 필요합니다.' }, { status: 400 });
    try {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      const creds = (adapter as CoupangAdapter).getCredentials();
      const result = await searchCoupangBrands(creds, brandName, { countPerPage: 10 });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : '브랜드 검색 실패' }, { status: 502 });
    }
  }

  if (action === 'save') {
    const brandName = (body.brandName || '').trim();
    if (!brandName) return NextResponse.json({ error: 'brandName이 필요합니다.' }, { status: 400 });
    const { error } = await serviceClient
      .from('megaload_users')
      .update({ seller_brand: brandName, seller_brand_registered: true, updated_at: new Date().toISOString() })
      .eq('id', shUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, sellerBrand: brandName });
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
}
