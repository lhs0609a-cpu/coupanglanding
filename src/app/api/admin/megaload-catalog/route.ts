import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

const PAGE_SIZE = 50;

/**
 * GET /api/admin/megaload-catalog?page=1&q=&status=&visible=
 * 카탈로그 목록 (관리자 검수용)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const q = (searchParams.get('q') || '').trim();
  const status = searchParams.get('status') || '';
  const visible = searchParams.get('visible') || '';

  const serviceClient = await createServiceClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = serviceClient
    .from('catalog_products')
    .select(
      'id, drive_folder_id, drive_folder_name, product_name, display_name, brand, status, is_visible, suggested_price, main_image_count, detail_image_count, register_count, images, updated_at',
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (q) query = query.ilike('product_name', `%${q}%`);
  if (status) query = query.eq('status', status);
  if (visible === 'true') query = query.eq('is_visible', true);
  if (visible === 'false') query = query.eq('is_visible', false);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data || [],
    page,
    page_size: PAGE_SIZE,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}

/**
 * PATCH /api/admin/megaload-catalog
 * Body: { id, status?, is_visible?, display_name?, suggested_price?, coupang_category_code? }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json();
  const { id, ...patch } = body;
  if (!id) {
    return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  }

  const allowed: Record<string, unknown> = {};
  for (const key of [
    'status',
    'is_visible',
    'display_name',
    'suggested_price',
    'cost_price',
    'coupang_category_code',
    'category_id',
    'brand',
    'manufacturer',
  ]) {
    if (key in patch) allowed[key] = patch[key];
  }

  if (patch.is_visible || patch.status === 'active') {
    allowed.reviewed_at = new Date().toISOString();
    allowed.reviewed_by = adminUser.id;
  }

  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient
    .from('catalog_products')
    .update(allowed)
    .eq('id', id)
    .select('id, status, is_visible, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, product: data });
}

/**
 * DELETE /api/admin/megaload-catalog?id=
 * (Drive 원본은 건드리지 않음 — DB row만 archived 처리)
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from('catalog_products')
    .update({ status: 'archived', is_visible: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
