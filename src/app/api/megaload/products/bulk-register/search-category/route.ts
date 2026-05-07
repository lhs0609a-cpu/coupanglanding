import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';

export const maxDuration = 30;


/**
 * GET — 쿠팡 카테고리 검색
 * ?keyword=비오틴
 */
export async function GET(req: NextRequest) {
  try {
    const keyword = req.nextUrl.searchParams.get('keyword');
    if (!keyword) {
      return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
    }

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
    const serviceClient = await createServiceClient();

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const result = await adapter.searchCategory(keyword);

    return NextResponse.json({ items: result.items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '카테고리 검색 실패' },
      { status: 500 },
    );
  }
}
