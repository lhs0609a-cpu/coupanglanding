/**
 * PATCH /api/admin/supplier-catalog/[id]   { action: 'approve' | 'reject', reason? }
 *   상품 검수 승인/반려. 승인 시 status='approved'(셀러 카탈로그 노출),
 *   반려 시 status='rejected' + rejection_reason.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });

  const { id } = await params;
  const { action, reason } = await request.json().catch(() => ({}));

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action은 'approve' 또는 'reject' 여야 합니다." }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // 승인 시 — 해당 공급사가 자동결제 카드를 등록했는지 확인.
  // 카드 없으면 판매 시 수수료 자동청구가 불가능하므로 판매노출(승인)을 막는다.
  if (action === 'approve') {
    const { data: prod } = await serviceClient
      .from('supplier_products').select('supplier_id').eq('id', id).single();
    if (!prod) return NextResponse.json({ error: '상품을 찾을 수 없습니다.' }, { status: 404 });
    const { data: sup } = await serviceClient
      .from('suppliers').select('billing_status, card_registered_at').eq('id', prod.supplier_id).single();
    if (!sup || sup.billing_status !== 'active' || !sup.card_registered_at) {
      return NextResponse.json({
        error: '해당 공급사가 자동결제 카드를 등록하지 않았습니다. 공급사가 카드를 등록한 뒤 승인할 수 있습니다.',
        code: 'SUPPLIER_NO_CARD',
      }, { status: 400 });
    }
  }

  const patch = action === 'approve'
    ? { status: 'approved', rejection_reason: null }
    : { status: 'rejected', rejection_reason: reason || '반려 사유 미기재' };

  const { data, error } = await serviceClient
    .from('supplier_products')
    .update(patch)
    .eq('id', id)
    .select('id, status, rejection_reason')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, product: data });
}
