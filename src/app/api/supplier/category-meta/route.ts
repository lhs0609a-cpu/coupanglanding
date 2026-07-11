/**
 * GET /api/supplier/category-meta?categoryCode=56137
 *   상품 등록 동적폼용 — 카테고리별 고시/필수속성 항목 반환.
 *   공급사만 접근(로그인 + 공급사 계정 필요).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';
import { getSupplierCategoryMeta } from '@/lib/megaload/supplier/category-meta';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const categoryCode = request.nextUrl.searchParams.get('categoryCode');
  if (!categoryCode) return NextResponse.json({ error: 'categoryCode가 필요합니다.' }, { status: 400 });

  const serviceClient = await createServiceClient();
  const supplier = await getSupplierByProfile(serviceClient, user.id);
  if (!supplier) return NextResponse.json({ error: '공급사 등록을 먼저 완료해주세요.' }, { status: 403 });

  try {
    const meta = await getSupplierCategoryMeta(serviceClient, categoryCode);
    return NextResponse.json({ ok: true, ...meta });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '카테고리 메타 조회 실패', notices: [], attributes: [] });
  }
}
