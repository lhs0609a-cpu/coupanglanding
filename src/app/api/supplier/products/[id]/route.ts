/**
 * PATCH /api/supplier/products/[id]  { notice: string }
 *   공급사가 자기 제휴상품에 셀러용 공지를 설정/수정/삭제(빈 문자열).
 *   그 상품을 판매하는 전 셀러가 제휴상품 카탈로그에서 확인.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';

export const maxDuration = 15;

const MAX_NOTICE = 200;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sc = await createServiceClient();
  const supplier = await getSupplierByProfile(sc, user.id);
  if (!supplier) return NextResponse.json({ error: '공급사 등록이 필요합니다.' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const notice = typeof body.notice === 'string' ? body.notice.trim().slice(0, MAX_NOTICE) : '';

  // 소유 상품인지 확인 후 업데이트
  const { data, error } = await sc
    .from('supplier_products')
    .update({ supplier_notice: notice || null, supplier_notice_at: notice ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('supplier_id', supplier.id)
    .select('id, supplier_notice, supplier_notice_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '내 상품이 아니거나 존재하지 않습니다.' }, { status: 404 });
  return NextResponse.json({ ok: true, product: data });
}
