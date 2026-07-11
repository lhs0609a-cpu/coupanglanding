/**
 * GET /api/megaload/supplier-catalog?sort=hot&q=
 *   셀러용 공급사 카탈로그 — 승인 상품 목록(옵션·공급사·실판매수 포함).
 *   sort: 'hot'(실판매순) | 'margin'(마진순) | 'new'(신규순)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const sort = sp.get('sort') || 'hot';

  const serviceClient = await createServiceClient();
  let query = serviceClient
    .from('supplier_products')
    .select('id, seller_product_name, brand, category_path, thumbnail_url, min_price, max_price, ' +
            'supplier:suppliers(brand_name, company_name, logo_url), options:supplier_product_options(supply_price, stock)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(60);
  if (q) query = query.ilike('seller_product_name', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string; seller_product_name: string; brand: string | null; category_path: string | null;
    thumbnail_url: string | null; min_price: number; max_price: number;
    supplier: unknown; options: { supply_price: number; stock: number }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // 실판매 집계 (확정분)
  const ids = rows.map((p) => p.id);
  const soldByProduct: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: sales } = await serviceClient
      .from('supplier_sales')
      .select('catalog_product_id, quantity')
      .in('catalog_product_id', ids)
      .eq('status', 'confirmed');
    for (const s of (sales || []) as { catalog_product_id: string; quantity: number }[]) {
      soldByProduct[s.catalog_product_id] = (soldByProduct[s.catalog_product_id] || 0) + (s.quantity || 0);
    }
  }

  const products = rows.map((p) => {
    const opts = p.options || [];
    const minSupply = opts.length ? Math.min(...opts.map((o) => o.supply_price)) : 0;
    const totalStock = opts.reduce((s, o) => s + (o.stock || 0), 0);
    return { ...p, min_supply_price: minSupply, total_stock: totalStock, sold_count: soldByProduct[p.id] || 0 };
  });

  if (sort === 'hot') products.sort((a, b) => b.sold_count - a.sold_count);
  else if (sort === 'margin') products.sort((a, b) => (b.max_price - b.min_supply_price) - (a.max_price - a.min_supply_price));

  return NextResponse.json({ products });
}
