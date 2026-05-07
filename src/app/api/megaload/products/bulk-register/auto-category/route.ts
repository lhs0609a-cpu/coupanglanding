import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { matchCategory } from '@/lib/megaload/services/category-matcher';

export const maxDuration = 30;


/**
 * POST — 상품명으로 쿠팡 카테고리 자동 매칭
 * body: { productName: string }
 * → { categoryCode, categoryName, categoryPath, confidence, source }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;

    const body = await req.json() as { productName: string; forceCoupangApi?: boolean };
    if (!body.productName) {
      return NextResponse.json({ error: '상품명이 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;

    // forceCoupangApi: 로컬 DB 스킵, 쿠팡 Predict API 직접 호출
    let result;
    if (body.forceCoupangApi) {
      try {
        const predicted = await coupangAdapter.autoCategorize(body.productName);
        if (predicted && predicted.predictedCategoryId) {
          result = {
            categoryCode: String(predicted.predictedCategoryId),
            categoryName: predicted.predictedCategoryName || '',
            categoryPath: predicted.predictedCategoryName || '',
            confidence: 0.95,
            source: 'coupang_api' as const,
          };
        }
      } catch { /* Predict 실패 시 기본 매칭 사용 */ }
    }
    if (!result) {
      result = await matchCategory(body.productName, coupangAdapter);
    }

    if (!result) {
      return NextResponse.json({ error: '카테고리 매칭 실패' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '카테고리 매칭 실패' },
      { status: 500 },
    );
  }
}
