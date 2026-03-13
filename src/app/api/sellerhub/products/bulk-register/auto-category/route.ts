import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import { matchCategory } from '@/lib/sellerhub/services/category-matcher';

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
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;

    const body = await req.json() as { productName: string };
    if (!body.productName) {
      return NextResponse.json({ error: '상품명이 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;

    const result = await matchCategory(body.productName, coupangAdapter);

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
