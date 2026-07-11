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
