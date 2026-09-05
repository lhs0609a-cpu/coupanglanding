/**
 * POST /api/supplier/auto-category  { productName }
 *   상품명으로 쿠팡 카테고리 자동 추천. 공급사는 쿠팡 연동이 없으므로 로컬 매처 우선,
 *   Predict API 폴백용으로 "연결된 쿠팡 셀러 아무나"의 공유 어댑터를 넘긴다(선택).
 *   → { categoryCode, categoryName, categoryPath, confidence, source }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { matchCategory } from '@/lib/megaload/services/category-matcher';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 30;

async function getSharedAdapter(service: SupabaseClient): Promise<CoupangAdapter | undefined> {
  const { data: cred } = await service
    .from('channel_credentials')
    .select('megaload_user_id')
    .eq('channel', 'coupang')
    .eq('is_connected', true)
    .limit(1)
    .maybeSingle();
  if (!cred) return undefined;
  try {
    return await getAuthenticatedAdapter(service, (cred as { megaload_user_id: string }).megaload_user_id, 'coupang') as CoupangAdapter;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const service = await createServiceClient();
    const supplier = await getSupplierByProfile(service, user.id);
    if (!supplier) return NextResponse.json({ error: '공급사 계정이 필요합니다.' }, { status: 403 });

    const { productName } = await request.json().catch(() => ({}));
    const name = String(productName || '').trim();
    if (!name) return NextResponse.json({ error: '상품명을 먼저 입력해주세요.' }, { status: 400 });

    const adapter = await getSharedAdapter(service);
    const result = await matchCategory(name, adapter);
    if (!result) {
      return NextResponse.json({ error: '적합한 카테고리를 찾지 못했습니다. 카테고리 코드를 직접 입력해주세요.' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '카테고리 추천 실패' }, { status: 500 });
  }
}
