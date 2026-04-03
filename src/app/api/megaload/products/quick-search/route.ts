import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * 퀵서치: 상품명/브랜드/상품번호로 검색 → 매칭 상품 목록 반환
 * GET /api/megaload/products/quick-search?q=성진바이오
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q) {
      return NextResponse.json({ results: [] });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ results: [] }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ results: [] }, { status: 401 });
    }

    // 상품명, 브랜드, 상품코드에서 검색 (최대 20개)
    const { data } = await supabase
      .from('sh_products')
      .select('id, product_name, display_name, brand, coupang_product_id, raw_data, created_at')
      .eq('megaload_user_id', shUserId)
      .neq('status', 'deleted')
      .or(`product_name.ilike.%${q}%,display_name.ilike.%${q}%,brand.ilike.%${q}%,coupang_product_id.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    const results = (data || []).map((item) => {
      const raw = item.raw_data as Record<string, unknown> | null;
      return {
        id: item.id,
        productName: item.product_name || item.display_name || '',
        brand: item.brand || '',
        coupangProductId: item.coupang_product_id || '',
        sourceUrl: (raw?.sourceUrl as string) || null,
      };
    });

    return NextResponse.json({ results, total: results.length });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
