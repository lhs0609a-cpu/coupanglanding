import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * GET /api/megaload/catalog?page=1&q=&category=
 * 사용자용 카탈로그 (활성 + 노출만)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const q = (searchParams.get('q') || '').trim();
  const categoryId = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || 'recent'; // recent | popular

  const serviceClient = await createServiceClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = serviceClient
    .from('catalog_products')
    .select(
      'id, drive_folder_name, product_name, display_name, brand, suggested_price, main_image_count, detail_image_count, register_count, images, category_id',
      { count: 'exact' }
    )
    .eq('status', 'active')
    .eq('is_visible', true)
    .range(from, to);

  if (sort === 'popular') {
    query = query.order('register_count', { ascending: false });
  } else {
    query = query.order('updated_at', { ascending: false });
  }

  if (q) query = query.ilike('product_name', `%${q}%`);
  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 사용자가 이미 등록한 상품 표시
  const productIds = (data || []).map((p) => (p as { id: string }).id);
  let registeredIds = new Set<string>();
  if (productIds.length > 0) {
    const { data: regs } = await serviceClient
      .from('catalog_registrations')
      .select('catalog_product_id')
      .in('catalog_product_id', productIds)
      .in('status', ['succeeded', 'registering']);
    registeredIds = new Set(((regs || []) as Array<{ catalog_product_id: string }>).map((r) => r.catalog_product_id));
  }

  const items = (data || []).map((p) => {
    const product = p as Record<string, unknown> & { id: string };
    return { ...product, already_registered: registeredIds.has(product.id) };
  });

  return NextResponse.json({
    items,
    page,
    page_size: PAGE_SIZE,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
