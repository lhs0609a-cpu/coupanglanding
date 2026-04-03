import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * 퀵서치: 판매자상품명으로 검색 → 원본 소스 URL 반환
 * GET /api/megaload/products/quick-search?q=오투바이오+12595862404
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q) {
      return NextResponse.json({ sourceUrl: null });
    }

    const supabase = await createClient();
    const shUser = await ensureMegaloadUser(supabase);
    if (!shUser) {
      return NextResponse.json({ sourceUrl: null }, { status: 401 });
    }

    // 판매자상품명(product_name)으로 검색
    const { data } = await supabase
      .from('sh_products')
      .select('raw_data')
      .eq('megaload_user_id', shUser.id)
      .ilike('product_name', `%${q}%`)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const rawData = data?.raw_data as Record<string, unknown> | null;
    const sourceUrl = rawData?.sourceUrl as string | null;

    return NextResponse.json({ sourceUrl: sourceUrl || null });
  } catch {
    return NextResponse.json({ sourceUrl: null });
  }
}
