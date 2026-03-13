import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import { matchCategory, type CategoryMatchResult } from '@/lib/sellerhub/services/category-matcher';

/**
 * POST — 다수 상품명에 대한 일괄 카테고리 자동매칭
 * body: { productNames: string[] }  (최대 50개씩)
 *
 * 클라이언트가 500개 상품을 10번에 나눠 호출
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;

    const body = await req.json() as { productNames: string[] };
    if (!body.productNames || body.productNames.length === 0) {
      return NextResponse.json({ error: '상품명 목록이 필요합니다.' }, { status: 400 });
    }
    if (body.productNames.length > 50) {
      return NextResponse.json({ error: '한 번에 최대 50개까지 가능합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;

    const results: (CategoryMatchResult & { index: number })[] = [];

    for (let i = 0; i < body.productNames.length; i++) {
      const name = body.productNames[i];
      try {
        const result = await matchCategory(name, coupangAdapter);
        if (result) {
          results.push({ ...result, index: i });
        } else {
          results.push({
            index: i,
            categoryCode: '',
            categoryName: '',
            categoryPath: '',
            confidence: 0,
            source: 'ai',
          });
        }
      } catch {
        results.push({
          index: i,
          categoryCode: '',
          categoryName: '',
          categoryPath: '',
          confidence: 0,
          source: 'ai',
        });
      }

      // 레이트 리밋 방지
      if (i < body.productNames.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '일괄 카테고리 매칭 실패' },
      { status: 500 },
    );
  }
}
