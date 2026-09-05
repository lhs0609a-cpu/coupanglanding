/**
 * GET /api/admin/supplier-catalog?status=pending
 *   관리자 검수 큐 — 공급사 등록 상품 목록(공급사/옵션 포함).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'pending';
  const serviceClient = await createServiceClient();

  let q = serviceClient
    .from('supplier_products')
    .select('*, supplier:suppliers(id, company_name, brand_name, logo_url, business_verified), options:supplier_product_options(*)')
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data || [] });
}
